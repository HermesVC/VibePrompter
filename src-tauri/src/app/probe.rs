//! Headless AppState bootstrap for debug binaries (memory probe, etc.).

use std::path::PathBuf;
use std::sync::Arc;

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
