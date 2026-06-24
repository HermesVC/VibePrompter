//! Integration probe: write_file + apply_patch (+ parser, negative cases, optional LLM).

use std::path::{Path, PathBuf};

use crate::app::AppState;
use crate::providers::prompt_format::tool_call_parse;
use crate::tools::{self, ToolExecutionContext};
use crate::utils::AppResult;
use crate::workspace::{run_verify_spec, VerifySpec};

pub const TOOLS_INTEGRATION_DIR: &str = "test/harness-tools";
pub const TOOLS_PAGE_REL: &str = "test/harness-tools/page.html";
pub const TOOLS_CSS_REL: &str = "test/harness-tools/style.css";

const STUB_HTML: &str = "<!DOCTYPE html>\n<html><head><title>Stub</title></head>\n<body><h1>Title Stub</h1></body></html>\n";
const STUB_CSS: &str = "body { margin: 0; }\n";

#[derive(Debug, Clone, serde::Serialize)]
pub struct ToolchainStep {
    pub id: String,
    pub tool: String,
    pub pass: bool,
    pub detail: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ToolchainDeterministicReport {
    pub steps: Vec<ToolchainStep>,
    pub all_pass: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ToolchainLiveReport {
    pub tools_phase: bool,
    pub answer_preview: String,
    pub tool_markers: ToolMarkers,
    pub files: Vec<FileCheck>,
    pub verify: Option<bool>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ToolMarkers {
    pub mentions_write_file: bool,
    pub mentions_apply_patch: bool,
    pub mentions_write_created: bool,
    pub mentions_patch_applied: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct FileCheck {
    pub path: String,
    pub exists: bool,
    pub contains: Option<String>,
    pub found: bool,
}

fn step(id: &str, tool: &str, pass: bool, detail: impl Into<String>) -> ToolchainStep {
    ToolchainStep {
        id: id.into(),
        tool: tool.into(),
        pass,
        detail: detail.into(),
    }
}

/// Remove integration fixture files (best-effort).
pub fn reset_tools_integration_dir(workspace_root: &Path) -> AppResult<()> {
    let dir =
        workspace_root.join(TOOLS_INTEGRATION_DIR.replace('/', std::path::MAIN_SEPARATOR_STR));
    if dir.exists() {
        std::fs::remove_dir_all(&dir)?;
    }
    std::fs::create_dir_all(&dir)?;
    Ok(())
}

async fn tool_ctx(state: &AppState) -> AppResult<ToolExecutionContext> {
    let settings = state.workspace.get_settings().await?;
    Ok(ToolExecutionContext {
        workspace: state.workspace.clone(),
        settings,
        scope_path: Some(TOOLS_INTEGRATION_DIR.into()),
    })
}

/// Deterministic: write_file → apply_patch → negatives → wire parse → verify.
pub async fn run_toolchain_deterministic(
    state: &AppState,
) -> AppResult<ToolchainDeterministicReport> {
    let settings = state.workspace.get_settings().await?;
    let root = PathBuf::from(settings.workspace_root.trim());
    reset_tools_integration_dir(&root)?;

    let mut steps = Vec::new();
    let ctx = tool_ctx(state).await?;

    // --- direct write_file ---
    let w1 = tools::execute_tool(
        &ctx,
        "write_file",
        serde_json::json!({ "path": TOOLS_PAGE_REL, "content": STUB_HTML }),
    )
    .await?;
    steps.push(step(
        "write_file_create_page",
        "write_file",
        w1.ok,
        &w1.message,
    ));

    // --- direct apply_patch ---
    let p1 = tools::execute_tool(
        &ctx,
        "apply_patch",
        serde_json::json!({
            "path": TOOLS_PAGE_REL,
            "old_text": "Title Stub",
            "new_text": "Title Patched"
        }),
    )
    .await?;
    steps.push(step("apply_patch_title", "apply_patch", p1.ok, &p1.message));

    // --- second file write + patch ---
    let w2 = tools::execute_tool(
        &ctx,
        "write_file",
        serde_json::json!({ "path": TOOLS_CSS_REL, "content": STUB_CSS }),
    )
    .await?;
    steps.push(step(
        "write_file_create_css",
        "write_file",
        w2.ok,
        &w2.message,
    ));

    let p2 = tools::execute_tool(
        &ctx,
        "apply_patch",
        serde_json::json!({
            "path": TOOLS_CSS_REL,
            "old_text": "margin: 0",
            "new_text": "margin: 0; padding: 0"
        }),
    )
    .await?;
    steps.push(step("apply_patch_css", "apply_patch", p2.ok, &p2.message));

    // --- negative: write_file on existing ---
    let w_dup = tools::execute_tool(
        &ctx,
        "write_file",
        serde_json::json!({ "path": TOOLS_PAGE_REL, "content": "x" }),
    )
    .await;
    let (dup_pass, dup_msg) = match w_dup {
        Err(e) => (true, e.to_string()),
        Ok(r) => (!r.ok, r.message),
    };
    steps.push(step(
        "write_file_reject_existing",
        "write_file",
        dup_pass,
        dup_msg,
    ));

    // --- negative: apply_patch missing file ---
    let p_miss = tools::execute_tool(
        &ctx,
        "apply_patch",
        serde_json::json!({
            "path": "test/harness-tools/missing.html",
            "old_text": "x",
            "new_text": "y"
        }),
    )
    .await;
    let (miss_pass, miss_msg) = match p_miss {
        Err(e) => (true, e.to_string()),
        Ok(r) => (!r.ok, r.message),
    };
    steps.push(step(
        "apply_patch_reject_missing",
        "apply_patch",
        miss_pass,
        miss_msg,
    ));

    // --- wire parse: write_file (separate file to avoid clobber) ---
    let extra_rel = "test/harness-tools/from-wire.html";
    let wire_write = format!(
        r#"<|tool_call|>call:write_file{{path:{extra_rel},content:"<html><body>Wire</body></html>"}}</|tool_call|>"#
    );
    let (parse_w_ok, parse_w_msg) = execute_first_parsed_call(state, &wire_write).await?;
    steps.push(step(
        "parser_execute_write_file",
        "write_file",
        parse_w_ok,
        parse_w_msg,
    ));

    // --- wire parse: apply_patch on page ---
    let wire_patch = r#"<|tool_call|>call:apply_patch{path:test/harness-tools/page.html,old_text:Title Patched,new_text:Title Wire-Patched}</|tool_call|>"#;
    let (parse_p_ok, parse_p_msg) = execute_first_parsed_call(state, &wire_patch).await?;
    steps.push(step(
        "parser_execute_apply_patch",
        "apply_patch",
        parse_p_ok,
        parse_p_msg,
    ));

    // --- disk content ---
    let page_body = std::fs::read_to_string(
        root.join(TOOLS_PAGE_REL.replace('/', std::path::MAIN_SEPARATOR_STR)),
    )
    .unwrap_or_default();
    steps.push(step(
        "disk_page_contains_wire_patch",
        "verify",
        page_body.contains("Title Wire-Patched"),
        if page_body.contains("Title Wire-Patched") {
            "page.html has patched title".into()
        } else {
            format!(
                "unexpected body: {}…",
                page_body.chars().take(80).collect::<String>()
            )
        },
    ));

    // --- run_verify ---
    let verify = run_verify_spec(
        &root,
        &VerifySpec {
            kind: "file_contains".into(),
            path: Some(TOOLS_CSS_REL.into()),
            needle: Some("padding: 0".into()),
            manifest: None,
        },
    )
    .await?;
    steps.push(step(
        "verify_css_padded",
        "run_verify",
        verify.ok,
        verify.message,
    ));

    // --- list_dir ---
    let list = tools::execute_tool(
        &ctx,
        "list_dir",
        serde_json::json!({ "path": TOOLS_INTEGRATION_DIR }),
    )
    .await?;
    let names: Vec<String> = list
        .output
        .get("entries")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|e| e.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    let list_ok = names.iter().any(|n| n.ends_with("page.html"))
        && names.iter().any(|n| n.ends_with("style.css"))
        && names.iter().any(|n| n.ends_with("from-wire.html"));
    steps.push(step(
        "list_dir_sees_files",
        "list_dir",
        list.ok && list_ok,
        format!("entries: {}", names.join(", ")),
    ));

    // --- read_file ---
    let read = tools::execute_tool(
        &ctx,
        "read_file",
        serde_json::json!({ "path": TOOLS_PAGE_REL }),
    )
    .await?;
    let body = read
        .output
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    steps.push(step(
        "read_file_page",
        "read_file",
        read.ok && body.contains("Title Wire-Patched"),
        if body.contains("Title Wire-Patched") {
            format!("read {} chars, title OK", body.len())
        } else {
            format!("unexpected: {}…", body.chars().take(60).collect::<String>())
        },
    ));

    let all_pass = steps.iter().all(|s| s.pass);
    Ok(ToolchainDeterministicReport { steps, all_pass })
}

async fn execute_first_parsed_call(state: &AppState, sample: &str) -> AppResult<(bool, String)> {
    let calls = tool_call_parse::parse_all_tool_calls(sample);
    let Some(call) = calls.first() else {
        return Ok((false, "parse returned 0 calls".into()));
    };
    let ctx = tool_ctx(state).await?;
    match tools::execute_tool(&ctx, &call.name, call.arguments.clone()).await {
        Ok(r) => Ok((r.ok, format!("{}: {}", call.name, r.message))),
        Err(e) => Ok((false, e.to_string())),
    }
}

/// Live LLM: model must write_file + apply_patch in folder scope (LM Studio). `TOOLS_PROBE_LIVE=1`.
pub async fn run_toolchain_live(state: &AppState) -> AppResult<ToolchainLiveReport> {
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;

    use crate::chat::{run_chat, ChatRunEventSink, ChatRunRequest, ChatRunStatus};
    use crate::models::ChatMessage;
    use crate::workspace::{ChatContextPayload, ChatScope};

    let settings = state.workspace.get_settings().await?;
    let root = PathBuf::from(settings.workspace_root.trim());
    reset_tools_integration_dir(&root)?;

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

    let mut trace = Trace { tools_phase: false };

    let prompt = format!(
        "Интеграционный тест tools в `{TOOLS_INTEGRATION_DIR}/` (папка пустая).\n\
         Сделай строго через tool_call, без ```file``` fences и без prose до tools:\n\
         1) write_file `{TOOLS_PAGE_REL}` — минимальный HTML с <h1>Live Stub</h1>\n\
         2) apply_patch — замени Live Stub на Live Done в том же файле\n\
         3) write_file `{TOOLS_CSS_REL}` — body {{ color: #333; }}\n\
         Кратко отчитайся после успешных tool results."
    );

    let result = run_chat(
        state,
        ChatRunRequest {
            messages: vec![ChatMessage {
                role: "user".into(),
                content: prompt,
                images: vec![],
            }],
            mode_id: Some("chat-developer".into()),
            connection_id: None,
            chat_context: Some(ChatContextPayload {
                scope: ChatScope::Folder {
                    path: TOOLS_INTEGRATION_DIR.into(),
                    tree_summary: format!("{TOOLS_INTEGRATION_DIR}/\n"),
                    outline_summary: String::new(),
                    files: vec![],
                    truncated: false,
                },
                modifiers: vec!["developer".into()],
                language_id: Some("html".into()),
            }),
            session_summary: None,
            session_id: Some("tools-integration-live".into()),
            ..Default::default()
        },
        Arc::new(AtomicBool::new(false)),
        &mut trace,
    )
    .await?;

    let text = result.text;
    let markers = ToolMarkers {
        mentions_write_file: text.contains("write_file")
            || text.contains("[Tool result: write_file]"),
        mentions_apply_patch: text.contains("apply_patch")
            || text.contains("[Tool result: apply_patch]"),
        mentions_write_created: text.contains("Created test/harness-tools"),
        mentions_patch_applied: text.contains("Patched test/harness-tools"),
    };

    let files = vec![
        check_file(&root, TOOLS_PAGE_REL, Some("Live Done")),
        check_file(&root, TOOLS_CSS_REL, Some("#333")),
    ];

    let verify = if files.iter().all(|f| f.exists) {
        run_verify_spec(
            &root,
            &VerifySpec {
                kind: "file_contains".into(),
                path: Some(TOOLS_PAGE_REL.into()),
                needle: Some("Live Done".into()),
                manifest: None,
            },
        )
        .await
        .ok()
        .map(|o| o.ok)
    } else {
        None
    };

    Ok(ToolchainLiveReport {
        tools_phase: trace.tools_phase,
        answer_preview: text.chars().take(600).collect(),
        tool_markers: markers,
        files,
        verify,
    })
}

fn check_file(root: &Path, rel: &str, needle: Option<&str>) -> FileCheck {
    let abs = root.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
    let exists = abs.is_file();
    let (contains, found) = if let Some(n) = needle {
        let body = std::fs::read_to_string(&abs).unwrap_or_default();
        let found = body.contains(n);
        (Some(n.to_string()), found)
    } else {
        (None, exists)
    };
    FileCheck {
        path: rel.into(),
        exists,
        contains,
        found: if needle.is_some() { found } else { exists },
    }
}

pub fn live_report_pass(report: &ToolchainLiveReport) -> (bool, String) {
    if !report.tools_phase {
        return (false, "tools phase never ran".into());
    }
    let page_ok = report
        .files
        .iter()
        .find(|f| f.path == TOOLS_PAGE_REL)
        .is_some_and(|f| f.exists && f.found);
    let css_ok = report
        .files
        .iter()
        .find(|f| f.path == TOOLS_CSS_REL)
        .is_some_and(|f| f.exists && f.found);
    if !page_ok {
        return (false, "page.html missing or lacks Live Done".into());
    }
    if !css_ok {
        return (false, "style.css not created or lacks #333".into());
    }
    if report.verify == Some(false) {
        return (false, "run_verify file_contains failed".into());
    }
    (true, "live toolchain OK".into())
}
