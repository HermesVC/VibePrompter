//! Workspace agent tools in chat — declarations, execution, and follow-up turns.

use serde_json::json;

use crate::app::AppState;
use crate::providers::prompt_format::{self, ToolDefinition};
use crate::tools::{self, ToolExecutionContext, ToolExecutionResult};
use crate::utils::AppResult;
use crate::workspace::ChatScope;

const MAX_TOOL_ITERATIONS: usize = 6;

const WORKSPACE_TOOLS_PROTOCOL: &str = r#"## Workspace file tools (active)

You can inspect the project with these tools (declare via tool_call blocks):
- `list_dir` — list files under a path (`path`, optional `depth`)
- `read_file` — read a file or line range (`path`, optional `start_line`, `end_line`)

Use relative paths from the workspace root. Prefer `read_file` with line ranges for large files.
After a tool_call, wait for tool results before answering the user."#;

/// Scopes where the model should use filesystem tools instead of inlined bodies.
pub fn scope_enables_tools(scope: &ChatScope) -> bool {
    matches!(
        scope,
        ChatScope::Folder { .. } | ChatScope::Workspace { .. } | ChatScope::File { .. }
    )
}

pub fn workspace_tool_definitions() -> Vec<ToolDefinition> {
    tools::list_workspace_tools()
}

pub fn scope_path_for_tools(scope: &ChatScope) -> Option<String> {
    match scope {
        ChatScope::Folder { path, .. } => {
            let p = path.trim().trim_matches('/');
            if p.is_empty() || p == "." {
                None
            } else {
                Some(p.to_string())
            }
        }
        ChatScope::File { path, .. } => {
            let p = path.replace('\\', "/");
            if let Some((dir, _)) = p.rsplit_once('/') {
                if dir.is_empty() {
                    None
                } else {
                    Some(dir.to_string())
                }
            } else {
                None
            }
        }
        ChatScope::Workspace { .. } => None,
        _ => None,
    }
}

/// Append tool protocol + Gemma declarations when the connection supports tool calling.
pub fn augment_system_for_tools(
    system: &mut Option<String>,
    prompt_format_id: &str,
    scope: &ChatScope,
) {
    if !scope_enables_tools(scope) {
        return;
    }
    let format = prompt_format::resolve(prompt_format_id);
    if !format.supports_tool_calling() {
        return;
    }

    let tools = workspace_tool_definitions();
    let mut block = WORKSPACE_TOOLS_PROTOCOL.to_string();
    if prompt_format_id == "gemma4" {
        block.push_str(&prompt_format::gemma4::format_tool_declarations(&tools));
    } else {
        block.push_str("\n\nAvailable tools:\n");
        for t in &tools {
            block.push_str(&format!("- {} — {}\n", t.name, t.description));
        }
    }

    let mut sys = system.take().unwrap_or_default();
    if !sys.trim().is_empty() {
        sys.push_str("\n\n");
    }
    sys.push_str(&block);
    *system = Some(sys);
}

pub fn format_tool_followup_user_message(
    prompt_format_id: &str,
    results: &[ToolExecutionResult],
) -> String {
    if prompt_format_id == "gemma4" {
        results
            .iter()
            .map(|r| {
                prompt_format::gemma4::format_tool_response(
                    &r.name,
                    &if r.ok {
                        r.output.clone()
                    } else {
                        json!({ "ok": false, "error": r.message })
                    },
                )
            })
            .collect::<Vec<_>>()
            .join("")
    } else {
        results
            .iter()
            .map(|r| {
                format!(
                    "[Tool result: {}]\n{}\n",
                    r.name,
                    if r.ok {
                        serde_json::to_string_pretty(&r.output).unwrap_or_else(|_| r.message.clone())
                    } else {
                        format!("ERROR: {}", r.message)
                    }
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}

pub async fn build_tool_context(
    state: &AppState,
    scope_path: Option<String>,
) -> AppResult<ToolExecutionContext> {
    let settings = state.workspace.get_settings().await?;
    Ok(ToolExecutionContext {
        workspace: state.workspace.clone(),
        settings,
        scope_path,
    })
}

/// After a model turn, run tool calls and re-prompt until no tools or limit hit.
pub async fn run_tool_followup_loop<F, C>(
    state: &AppState,
    prompt_format_id: &str,
    scope_path: Option<String>,
    mut messages: Vec<crate::models::ChatMessage>,
    params: crate::models::CompletionParams,
    cfg: &crate::providers::HttpConfig,
    row: &crate::storage::repositories::ConnectionRow,
    mut result: crate::models::CompletionResult,
    mut on_token: F,
    should_cancel: C,
) -> AppResult<crate::models::CompletionResult>
where
    F: FnMut(&str) + Send,
    C: Fn() -> bool + Send + Sync + Clone,
{
    let format = prompt_format::resolve(prompt_format_id);
    if !format.supports_tool_calling() {
        return Ok(result);
    }

    let ctx = build_tool_context(state, scope_path).await?;

    for _ in 0..MAX_TOOL_ITERATIONS {
        if should_cancel() {
            break;
        }

        let calls = format.parse_tool_calls(&result.text);
        if calls.is_empty() {
            break;
        }

        let pairs: Vec<(String, serde_json::Value)> = calls
            .iter()
            .map(|c| (c.name.clone(), c.arguments.clone()))
            .collect();
        let tool_results = tools::execute_many(&ctx, &pairs).await;

        messages.push(crate::models::ChatMessage {
            role: "assistant".into(),
            content: result.text.clone(),
            images: vec![],
        });
        messages.push(crate::models::ChatMessage {
            role: "user".into(),
            content: format_tool_followup_user_message(prompt_format_id, &tool_results),
            images: vec![],
        });

        result = crate::providers::complete_stream(
            row,
            messages.clone(),
            params.clone(),
            cfg,
            &mut on_token,
            should_cancel.clone(),
        )
        .await?;

        tracing::info!(
            "tool loop: executed {} tool(s), follow-up model={}",
            tool_results.len(),
            result.model
        );
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_scope_enables_tools() {
        let scope = ChatScope::Folder {
            path: "src/app".into(),
            tree_summary: String::new(),
            files: vec![],
            truncated: false,
        };
        assert!(scope_enables_tools(&scope));
        assert_eq!(
            scope_path_for_tools(&scope).as_deref(),
            Some("src/app")
        );
    }

    #[test]
    fn file_scope_parent_path() {
        let scope = ChatScope::File {
            path: "src/lib/foo.ts".into(),
            content: String::new(),
            content_hash: String::new(),
            line_start: 1,
            line_end: 1,
            language_id: None,
        };
        assert!(scope_enables_tools(&scope));
        assert_eq!(
            scope_path_for_tools(&scope).as_deref(),
            Some("src/lib")
        );
    }

    #[test]
    fn formats_gemma_tool_response() {
        let results = vec![ToolExecutionResult {
            name: "read_file".into(),
            ok: true,
            output: json!({ "path": "a.ts", "content": "x" }),
            message: "ok".into(),
        }];
        let msg = format_tool_followup_user_message("gemma4", &results);
        assert!(msg.contains("<|tool_response>"));
        assert!(msg.contains("read_file"));
    }

    #[test]
    fn ignores_snippet_scope() {
        let scope = ChatScope::Snippet {
            original: "x".into(),
            working: "x".into(),
            path: None,
            line_start: None,
            line_end: None,
            language_id: None,
        };
        assert!(!scope_enables_tools(&scope));
    }
}
