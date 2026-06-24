//! Headless AppState bootstrap for debug binaries (memory probe, etc.).

use std::path::PathBuf;
use std::sync::Arc;

use crate::app::harness_fixtures::{
    self, BUG_NEEDLE, FIX_NEEDLE, PATCH_NEW, PATCH_OLD, SYNTHETIC_BUGGY_API_REL,
};
use crate::app::AppState;
use crate::config::Config;
use crate::events::EventBus;
use crate::services::{
    AnalyticsService, CatalogService, ChatMemoryService, ConnectionService, HistoryService,
    PromptService, SettingsService, ShortcutService, WorkspaceService,
};
use crate::storage::repositories::{
    AnalyticsRepo, ConnectionRepo, HistoryRepo, MemoryRepo, ModeRepo, ProviderRepo, SettingsRepo,
    ShortcutRepo,
};
use crate::storage::{create_pool, run_migrations};
use crate::utils::AppResult;

/// Resolve the same app data directory the desktop app uses.
pub fn default_app_data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("VIBEPROMPTER_APP_DATA") {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir);
        }
    }
    #[cfg(windows)]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            return PathBuf::from(appdata).join("com.vibeprompter.app");
        }
    }
    PathBuf::from(".vibeprompter-data")
}

/// Build `AppState` without starting the desktop shell (uses the real SQLite DB).
pub async fn build_probe_state() -> AppResult<AppState> {
    let app_data_dir = default_app_data_dir();
    std::fs::create_dir_all(&app_data_dir)?;
    let config = Config::from_app_data_dir(&app_data_dir)?;
    let pool = create_pool(&config.db_path).await?;
    run_migrations(&pool).await?;

    let events = EventBus::noop();
    let settings = SettingsService::new(SettingsRepo::new(pool.clone()), events.clone());
    let history = HistoryService::with_events(HistoryRepo::new(pool.clone()), events.clone());
    let shortcuts = ShortcutService::new(ShortcutRepo::new(pool.clone()), events.clone());
    let catalog = CatalogService::new(ModeRepo::new(pool.clone()), ProviderRepo::new(pool.clone()));
    let secrets: Arc<dyn crate::security::SecretStore> = crate::security::init().into();
    let connections = ConnectionService::new(
        ConnectionRepo::new(pool.clone()),
        secrets,
        settings.clone(),
        4,
    );
    let analytics = AnalyticsService::new(AnalyticsRepo::new(pool.clone()));
    let chat_memory = ChatMemoryService::new(MemoryRepo::new(pool.clone()));
    let workspace = WorkspaceService::new(SettingsRepo::new(pool.clone()));
    let prompts = PromptService::new(catalog.clone(), connections.clone(), history.clone())
        .with_analytics(analytics.clone());

    Ok(AppState {
        config,
        settings,
        history,
        shortcuts,
        catalog,
        connections,
        analytics,
        chat_memory,
        workspace,
        prompts,
        keyring_available: crate::security::KeyringStore::new().is_available(),
    })
}

/// Parse tool markup and execute the first call (read_file probe).
pub async fn probe_tool_call_parse_and_execute(
    state: &AppState,
    sample: &str,
) -> AppResult<(bool, String)> {
    use crate::providers::prompt_format::tool_call_parse;
    use crate::tools::{self, ToolExecutionContext};

    let calls = tool_call_parse::parse_all_tool_calls(sample);
    let Some(call) = calls.first() else {
        return Ok((false, "parse returned 0 calls".into()));
    };
    let settings = state.workspace.get_settings().await?;
    let ctx = ToolExecutionContext {
        workspace: state.workspace.clone(),
        settings,
        scope_path: Some("test".into()),
    };
    match tools::execute_tool(&ctx, &call.name, call.arguments.clone()).await {
        Ok(r) => Ok((r.ok, r.message)),
        Err(e) => Ok((false, e.to_string())),
    }
}

/// Full `run_chat` with folder scope — returns (assistant text, tools phase seen).
pub async fn probe_tool_call_live(state: &AppState) -> AppResult<(String, bool)> {
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;

    use crate::chat::{run_chat, ChatRunEventSink, ChatRunRequest, ChatRunStatus};
    use crate::models::ChatMessage;
    use crate::workspace::{ChatContextPayload, ChatScope};

    struct Trace {
        tools_phase: bool,
    }
    impl ChatRunEventSink for Trace {
        fn status(&mut self, s: ChatRunStatus) {
            if s.phase == "tools" {
                self.tools_phase = true;
            }
        }
        fn token(&mut self, _: u32, _: &str) {}
        fn memory(&mut self, _: crate::chat::ChatRunMemoryUpdate) {}
    }

    let mut trace = Trace {
        tools_phase: false,
    };
    let result = run_chat(
        state,
        ChatRunRequest {
            messages: vec![ChatMessage {
                role: "user".into(),
                content: "Прочитай test/single-page-games/index.html и скажи содержимое тега title."
                    .into(),
                images: vec![],
            }],
            mode_id: Some("chat-developer".into()),
            connection_id: None,
            chat_context: Some(ChatContextPayload {
                scope: ChatScope::Folder {
                    path: "test".into(),
                    tree_summary: "test/single-page-games/index.html".into(),
                    outline_summary: String::new(),
                    files: vec![],
                    truncated: false,
                },
                modifiers: vec!["developer".into()],
                language_id: None,
            }),
            session_summary: None,
            session_id: Some("tool-call-probe".into()),
        },
        Arc::new(AtomicBool::new(false)),
        &mut trace,
    )
    .await?;
    Ok((result.text, trace.tools_phase))
}

/// Deterministic apply_patch smoke on synthetic fixture (bypasses LLM). Reverts after check.
pub async fn probe_apply_patch_smoke(state: &AppState) -> AppResult<(bool, String)> {
    use crate::tools::{self, ToolExecutionContext};

    let settings = state.workspace.get_settings().await?;
    let root = settings.workspace_root.trim();
    harness_fixtures::reset_synthetic_buggy_api(PathBuf::from(root).as_path())?;

    let ctx = ToolExecutionContext {
        workspace: state.workspace.clone(),
        settings: settings.clone(),
        scope_path: Some(harness_fixtures::HARNESS_FIXTURES_DIR.into()),
    };

    let read = tools::execute_tool(
        &ctx,
        "read_file",
        serde_json::json!({ "path": SYNTHETIC_BUGGY_API_REL }),
    )
    .await?;
    if !read.ok {
        return Ok((false, format!("read_file failed: {}", read.message)));
    }

    let content = read
        .output
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if !content.contains(PATCH_OLD) {
        return Ok((
            false,
            format!("synthetic fixture missing patch needle: {PATCH_OLD:?}"),
        ));
    }

    let patch = tools::execute_tool(
        &ctx,
        "apply_patch",
        serde_json::json!({
            "path": SYNTHETIC_BUGGY_API_REL,
            "old_text": PATCH_OLD,
            "new_text": PATCH_NEW
        }),
    )
    .await?;
    if !patch.ok {
        return Ok((false, patch.message));
    }
    let max_old = patch
        .output
        .get("maxOldLines")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    if max_old > 5 {
        return Ok((
            false,
            format!("patch applied but maxOldLines={max_old} (expected ≤5 for typo fix)"),
        ));
    }

    let revert = tools::execute_tool(
        &ctx,
        "apply_patch",
        serde_json::json!({
            "path": SYNTHETIC_BUGGY_API_REL,
            "old_text": PATCH_NEW,
            "new_text": PATCH_OLD
        }),
    )
    .await?;

    if revert.ok {
        Ok((true, "synthetic apply_patch fix+revert OK".into()))
    } else {
        Ok((false, format!("fix OK but revert failed: {}", revert.message)))
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct HarnessFixtureProbeResult {
    pub target: String,
    pub tools_phase: bool,
    pub trace_status_phases: Vec<String>,
    pub answer_preview: String,
    pub had_bug_before: bool,
    pub has_bug_after: bool,
    pub has_fix_after: bool,
    pub agent_found_bug: bool,
    pub patch_smoke_ok: Option<bool>,
    pub patch_smoke_message: Option<String>,
}

/// Live agent scenario on synthetic PHP fixture (requires LM Studio).
pub async fn probe_harness_fixture_bugfix(
    state: &AppState,
) -> AppResult<HarnessFixtureProbeResult> {
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;

    use crate::chat::{run_chat, ChatRunEventSink, ChatRunRequest, ChatRunStatus};
    use crate::models::ChatMessage;
    use crate::workspace::{ChatContextPayload, ChatScope};

    struct Trace {
        phases: Vec<String>,
        tools_phase: bool,
    }
    impl ChatRunEventSink for Trace {
        fn status(&mut self, s: ChatRunStatus) {
            self.phases.push(s.phase.clone());
            if s.phase == "tools" {
                self.tools_phase = true;
            }
        }
        fn token(&mut self, _: u32, _: &str) {}
        fn memory(&mut self, _: crate::chat::ChatRunMemoryUpdate) {}
    }

    let settings = state.workspace.get_settings().await?;
    let root = settings.workspace_root.trim();
    harness_fixtures::reset_synthetic_buggy_api(PathBuf::from(root).as_path())?;
    let abs = PathBuf::from(root).join(
        SYNTHETIC_BUGGY_API_REL.replace('/', std::path::MAIN_SEPARATOR_STR),
    );
    let before = std::fs::read_to_string(&abs)?;
    let had_bug_before = before.contains(BUG_NEEDLE);

    let mut trace = Trace {
        phases: Vec::new(),
        tools_phase: false,
    };

    let result = run_chat(
        state,
        ChatRunRequest {
            messages: vec![ChatMessage {
                role: "user".into(),
                content: format!(
                    "Просканируй синтетический тестовый файл {SYNTHETIC_BUGGY_API_REL} \
(это harness-фикстура, не продакшен). В методе getDolgomerInfo найди баг с переменными \
(projectUids vs projectUuids) и исправь через apply_patch. Сначала read_file, потом apply_patch \
с точным old_text. Кратко опиши что нашёл и что исправил."
                ),
                images: vec![],
            }],
            mode_id: Some("chat-developer".into()),
            connection_id: None,
            chat_context: Some(ChatContextPayload {
                scope: ChatScope::File {
                    path: SYNTHETIC_BUGGY_API_REL.into(),
                    content: String::new(),
                    content_hash: String::new(),
                    line_start: 1,
                    line_end: 1,
                    language_id: Some("php".into()),
                },
                modifiers: vec!["developer".into()],
                language_id: Some("php".into()),
            }),
            session_summary: None,
            session_id: Some("harness-fixture-probe".into()),
        },
        Arc::new(AtomicBool::new(false)),
        &mut trace,
    )
    .await?;

    let after = std::fs::read_to_string(&abs)?;
    let answer = result.text.clone();
    let agent_found_bug = answer.contains("projectUids") && answer.contains("projectUuids");

    Ok(HarnessFixtureProbeResult {
        target: SYNTHETIC_BUGGY_API_REL.into(),
        tools_phase: trace.tools_phase,
        trace_status_phases: trace.phases,
        answer_preview: answer.chars().take(800).collect(),
        had_bug_before,
        has_bug_after: after.contains(BUG_NEEDLE),
        has_fix_after: after.contains(FIX_NEEDLE),
        agent_found_bug,
        patch_smoke_ok: None,
        patch_smoke_message: None,
    })
}
