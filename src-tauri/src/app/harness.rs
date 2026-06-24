//! Harness checks — deterministic toolchain validation + optional live LLM scenarios.

use std::path::Path;

use crate::app::probe::{probe_apply_patch_smoke, probe_harness_fixture_bugfix, HarnessFixtureProbeResult};
use crate::app::AppState;
use crate::providers::prompt_format::tool_call_parse;
use crate::utils::AppResult;
use crate::workspace::patch::{validate_patch_edits, PatchEdit, PatchLimits};
use crate::workspace::{
    compose_system_prompt_with_opts, scope_user_context_block, ChatContextPayload, ChatScope,
    ComposeSystemOptions,
};

pub const REACT_SCAFFOLD_DIR: &str = "test/harness-react";
pub const HARNESS_AUDIT_SESSION: &str = "harness-audit-probe";
pub const HARNESS_REACT_SESSION: &str = "harness-react-scaffold";

#[derive(Debug, Clone, serde::Serialize)]
pub struct HarnessCheck {
    pub id: String,
    pub pass: bool,
    pub detail: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct HarnessDeterministicReport {
    pub checks: Vec<HarnessCheck>,
    pub all_pass: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct HarnessLiveReport {
    pub audit: Option<HarnessFixtureProbeResult>,
    pub react_steps: Vec<ReactScaffoldStepReport>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ReactScaffoldStepReport {
    pub step: u8,
    pub tools_phase: bool,
    pub text_preview: String,
    pub raw_tool_markup_in_text: bool,
    pub files_expected: Vec<String>,
    pub files_present: Vec<String>,
    pub files_missing: Vec<String>,
}

fn check(id: &str, pass: bool, detail: impl Into<String>) -> HarnessCheck {
    HarnessCheck {
        id: id.into(),
        pass,
        detail: detail.into(),
    }
}

/// Fast checks — no LLM (parser, prompts, patch limits, apply_patch smoke).
pub async fn run_deterministic_checks(state: &AppState) -> AppResult<HarnessDeterministicReport> {
    let mut checks = Vec::new();

    let file_scope = ChatScope::File {
        path: "vp/src/a.php".into(),
        content: "<?php\n$secret = 1;\n".into(),
        content_hash: "h".into(),
        line_start: 1,
        line_end: 2,
        language_id: Some("php".into()),
    };
    let ctx = ChatContextPayload {
        scope: file_scope.clone(),
        modifiers: vec![],
        language_id: None,
    };
    let sys_tools = compose_system_prompt_with_opts("", &ctx, ComposeSystemOptions { tools_active: true });
    checks.push(check(
        "tools_active_system_omits_file_body",
        !sys_tools.contains("$secret") && sys_tools.contains("read_file"),
        if sys_tools.contains("$secret") {
            String::from("file body leaked into system prompt")
        } else {
            String::from("system prompt uses tools path without inlined body")
        },
    ));

    let user_block = scope_user_context_block(&file_scope, true);
    checks.push(check(
        "tools_active_user_scope_minimal",
        user_block.contains("read_file") && !user_block.contains("$secret"),
        user_block.chars().take(120).collect::<String>(),
    ));

    let qwen = r#"<|tool_call|>call:apply_patch{path:vp/a.php,old_text:foreach ($projectUids as $id),new_text:foreach ($projectUuids as $id)}</|tool_call|>"#;
    let parsed = tool_call_parse::parse_all_tool_calls(qwen);
    checks.push(check(
        "parser_qwen_apply_patch",
        parsed.len() == 1 && parsed[0].name == "apply_patch",
        format!("parsed {} call(s)", parsed.len()),
    ));

    let fence = r#"```file:vp/a.php
old_text:
foreach ($projectUids as $x) {
new_text:
foreach ($projectUuids as $x) {
```"#;
    let fence_calls: Vec<_> = tool_call_parse::parse_all_tool_calls(fence)
        .into_iter()
        .filter(|c| c.name == "apply_patch")
        .collect();
    let fence_ok = fence_calls.iter().any(|c| {
        c.arguments.get("old_text").and_then(|v| v.as_str())
            == Some("foreach ($projectUids as $x) {")
    });
    checks.push(check(
        "parser_old_new_fence",
        fence_ok,
        format!(
            "apply_patch from old_text/new_text fence ({} candidate(s))",
            fence_calls.len()
        ),
    ));

    let block_old = (0..18)
        .map(|i| format!("    case 'item_{i}':"))
        .collect::<Vec<_>>()
        .join("\n");
    let block_new = block_old.replace("item_3", "item_3_fixed");
    let validation = validate_patch_edits(
        &[PatchEdit {
            old_text: block_old,
            new_text: block_new,
        }],
        PatchLimits::default(),
    );
    checks.push(check(
        "patch_limits_multi_line_case",
        validation.violations.is_empty(),
        if validation.violations.is_empty() {
            "18-line case block passes default limits".into()
        } else {
            validation.violations.join("; ")
        },
    ));

    let stripped = tool_call_parse::strip_assistant_wire_markup(&format!(
        "Done.\n{qwen}\n```file:vp/a.php\nold_text:\nx\nnew_text:\ny\n```"
    ));
    checks.push(check(
        "strip_wire_markup",
        !stripped.contains("tool_call") && !stripped.contains("old_text:"),
        stripped.chars().take(80).collect::<String>(),
    ));

    let (smoke_ok, smoke_msg) = probe_apply_patch_smoke(state).await?;
    checks.push(check(
        "apply_patch_smoke",
        smoke_ok,
        smoke_msg,
    ));

    let toolchain = crate::app::toolchain_probe::run_toolchain_deterministic(state).await?;
    for s in &toolchain.steps {
        checks.push(check(
            &format!("toolchain_{}", s.id),
            s.pass,
            format!("{}: {}", s.tool, s.detail),
        ));
    }

    let all_pass = checks.iter().all(|c| c.pass);
    Ok(HarnessDeterministicReport { checks, all_pass })
}

/// Live agent audit on synthetic PHP fixture (requires LM Studio). `HARNESS_LIVE=1`.
pub async fn probe_harness_audit(state: &AppState) -> AppResult<HarnessFixtureProbeResult> {
    probe_harness_fixture_bugfix(state).await
}

/// Multi-step React scaffold under `test/harness-react/` (requires LM Studio). `HARNESS_REACT=1`.
pub async fn probe_react_scaffold_steps(state: &AppState) -> AppResult<Vec<ReactScaffoldStepReport>> {
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;

    use crate::chat::{run_chat, ChatRunEventSink, ChatRunRequest, ChatRunStatus};
    use crate::models::ChatMessage;
    use crate::workspace::ChatContextPayload;

    let settings = state.workspace.get_settings().await?;
    let root = settings.workspace_root.trim();

    let steps: Vec<(u8, String, Vec<String>)> = vec![
        (
            1,
            format!(
                "Создай план scaffold React+Vite+TypeScript в папке {REACT_SCAFFOLD_DIR}/.\n\
                 Выведи один markdown fence:\n```file {REACT_SCAFFOLD_DIR}/PLAN.md\n# Plan\n(дерево файлов и шаги 2–3)\n```\n\
                 Без PHP. Не используй tool_call для PLAN.md."
            ),
            vec![format!("{REACT_SCAFFOLD_DIR}/PLAN.md")],
        ),
        (
            2,
            format!(
                "Шаг 2 scaffold в {REACT_SCAFFOLD_DIR}/: создай базовые конфиги через file fences (не tool_call):\n\
                 - {REACT_SCAFFOLD_DIR}/package.json (react, react-dom, vite, typescript)\n\
                 - {REACT_SCAFFOLD_DIR}/vite.config.ts\n\
                 - {REACT_SCAFFOLD_DIR}/index.html\n\
                 - {REACT_SCAFFOLD_DIR}/tsconfig.json\n\
                 Один fence на файл. Минимум рабочий Vite+React."
            ),
            vec![
                format!("{REACT_SCAFFOLD_DIR}/package.json"),
                format!("{REACT_SCAFFOLD_DIR}/vite.config.ts"),
                format!("{REACT_SCAFFOLD_DIR}/index.html"),
                format!("{REACT_SCAFFOLD_DIR}/tsconfig.json"),
            ],
        ),
        (
            3,
            format!(
                "Шаг 3 scaffold в {REACT_SCAFFOLD_DIR}/: исходники через file fences:\n\
                 - {REACT_SCAFFOLD_DIR}/src/main.tsx\n\
                 - {REACT_SCAFFOLD_DIR}/src/App.tsx\n\
                 - {REACT_SCAFFOLD_DIR}/src/index.css\n\
                 Простой App с заголовком «Harness React». Без tool_call."
            ),
            vec![
                format!("{REACT_SCAFFOLD_DIR}/src/main.tsx"),
                format!("{REACT_SCAFFOLD_DIR}/src/App.tsx"),
                format!("{REACT_SCAFFOLD_DIR}/src/index.css"),
            ],
        ),
    ];

    let mut reports = Vec::new();

    for (step, prompt, expected_files) in steps {
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
                    content: prompt,
                    images: vec![],
                }],
                mode_id: Some("chat-developer".into()),
                connection_id: None,
                chat_context: Some(ChatContextPayload {
                    scope: ChatScope::Workspace {
                        tree_summary: Some(format!("{REACT_SCAFFOLD_DIR}/\n")),
                    },
                    modifiers: vec!["developer".into()],
                    language_id: Some("typescript".into()),
                }),
                session_summary: None,
                session_id: Some(HARNESS_REACT_SESSION.into()),
                ..Default::default()
            },
            Arc::new(AtomicBool::new(false)),
            &mut trace,
        )
        .await?;

        let _applied = harness_apply_generated_fences(state, &result.text).await?;

        let text = result.text;
        let expected = expected_files;
        let mut present = Vec::new();
        let mut missing = Vec::new();
        for rel in &expected {
            let abs = Path::new(root).join(rel.replace('/', "\\"));
            if abs.is_file() {
                present.push(rel.clone());
            } else {
                missing.push(rel.clone());
            }
        }

        reports.push(ReactScaffoldStepReport {
            step,
            tools_phase: trace.tools_phase,
            text_preview: text.chars().take(500).collect(),
            raw_tool_markup_in_text: tool_call_parse::contains_tool_call_markup(&text),
            files_expected: expected,
            files_present: present,
            files_missing: missing,
        });
    }

    Ok(reports)
}

/// Parse `` ```file:path ` `` fences (full file bodies, not patch wire).
pub fn extract_generated_file_fences(text: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut search = 0usize;
    while let Some(rel) = text[search..].find("```") {
        let start = search + rel;
        let after = start + 3;
        let Some(header_end_rel) = text[after..].find('\n') else {
            break;
        };
        let header = text[after..after + header_end_rel].trim();
        let content_start = after + header_end_rel + 1;
        let close = text[content_start..].find("```").unwrap_or(text.len() - content_start);
        let content = text[content_start..content_start + close].trim_end();
        if let Some(path) = parse_generated_file_header(header) {
            if !is_patch_wire_fence_content(content) {
                out.push((path, content.to_string()));
            }
        }
        search = if close < text.len() - content_start {
            content_start + close + 3
        } else {
            text.len()
        };
    }
    out
}

fn parse_generated_file_header(header: &str) -> Option<String> {
    let header = header.trim();
    if let Some(rest) = header.strip_prefix("file:") {
        let path = rest.trim();
        return (!path.is_empty()).then(|| path.to_string());
    }
    let lower = header.to_ascii_lowercase();
    if lower.starts_with("file ") {
        let path = header[4..].trim();
        return (!path.is_empty()).then(|| path.to_string());
    }
    None
}

fn is_patch_wire_fence_content(content: &str) -> bool {
    let t = content.trim();
    t.starts_with("edits:")
        || (t.contains("old_text:") && t.contains("new_text:"))
        || t.contains("call:apply_patch")
}

/// Write `` ```file ` `` blocks from assistant text into the workspace (harness / debug).
pub async fn harness_apply_generated_fences(
    state: &AppState,
    text: &str,
) -> AppResult<Vec<String>> {
    use std::path::PathBuf;

    use crate::workspace::write_file_checked;

    let settings = state.workspace.get_settings().await?;
    let root = PathBuf::from(settings.workspace_root.trim());
    let mut written = Vec::new();
    for (path, content) in extract_generated_file_fences(text) {
        write_file_checked(&root, &path, &content, None)?;
        written.push(path);
    }
    Ok(written)
}

/// Workspace files for UI/CLI verification after manual scenario runs.
pub fn check_workspace_files(root: &str, rel_paths: &[&str]) -> (Vec<String>, Vec<String>) {
    let mut present = Vec::new();
    let mut missing = Vec::new();
    for rel in rel_paths {
        let abs = Path::new(root).join(rel.replace('/', "\\"));
        if abs.is_file() {
            present.push((*rel).to_string());
        } else {
            missing.push((*rel).to_string());
        }
    }
    (present, missing)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn react_scaffold_dir_constant() {
        assert!(REACT_SCAFFOLD_DIR.starts_with("test/"));
    }

    #[test]
    fn extracts_generated_file_fence() {
        let text = "```file:test/harness-react/PLAN.md\n# Plan\nstep 2\n```";
        let blocks = extract_generated_file_fences(text);
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].0, "test/harness-react/PLAN.md");
        assert!(blocks[0].1.contains("# Plan"));
    }

    #[test]
    fn skips_patch_wire_fences() {
        let text = "```file:vp/a.php\nold_text:\nx\nnew_text:\ny\n```";
        assert!(extract_generated_file_fences(text).is_empty());
    }
}
