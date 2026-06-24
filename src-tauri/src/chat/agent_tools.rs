//! Workspace agent tools in chat — declarations, execution, and follow-up turns.

use serde_json::json;

use crate::app::AppState;
use crate::providers::prompt_format::{self, ToolDefinition};
use crate::tools::{self, ToolExecutionContext, ToolExecutionResult};
use crate::utils::AppResult;
use crate::workspace::ChatScope;

const MAX_TOOL_ITERATIONS: usize = 6;
const MAX_TOOL_AUTO_CONTINUES: usize = 3;
const TOOL_CONTINUATION_TAIL_CHARS: usize = 6_000;
const TOOL_STITCH_OVERLAP_CHARS: usize = 2_000;

const WORKSPACE_TOOLS_PROTOCOL: &str = r#"## Workspace file tools (active)

You can inspect and edit the project with these tools (declare via tool_call blocks):
- `list_dir` — list files under a path (`path`, optional `depth`)
- `read_file` — read a file or line range (`path`, optional `start_line`, `end_line`)
- `file_outline` — list classes/methods/functions in PHP/JS/Python (`path`)
- `read_symbol` — read a symbol body by name (`path`, `symbol`)
- `apply_patch` — surgical edit (`path`, `edits`: [{`old_text`, `new_text`}], optional `expected_hash` from read_file)

Use relative paths from the workspace root. Prefer `read_file` before editing.
**Minimal patches only:** `old_text` and `new_text` must differ as little as possible — often a single line or identifier.
Include 1–2 lines of context so `old_text` is unique; never paste a whole method, case block, or file.
If the tool returns "patch too large", shrink `old_text` to the smallest unique fragment and retry.
For typo / one-line fixes, `old_text` should be 1–3 lines. Do not paste whole files unless creating new ones.
When you need to inspect files, emit tool_call block(s) in one of these formats, then wait:

Qwen / local models (preferred):
<|tool_call|>call:read_file{path:relative/path.ext}</|tool_call|>
<|tool_call|>call:apply_patch{path:relative/path.ext,edits:[{old_text:lines to find,new_text:replacement}]}</|tool_call|>

Gemma 4:
<|tool_call>call:read_file{path:<|"|>relative/path.ext<|"|>}<|tool_call|>

Alternative:
<tool_call>call:read_file{path:relative/path.ext}</tool_call>

Do not say "I will inspect/read/check" unless you also emit the needed tool_call block in the same turn.
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
                        serde_json::to_string_pretty(&r.output)
                            .unwrap_or_else(|_| r.message.clone())
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

/// Optional hook to persist tool reads into session vector memory.
pub struct ToolLoopMemoryHook<'a> {
    pub session_id: &'a str,
    pub memory: &'a crate::services::ChatMemoryService,
    pub conn: &'a crate::storage::repositories::ConnectionRow,
    pub cfg: &'a crate::providers::HttpConfig,
    pub indexed_hashes: &'a mut std::collections::HashSet<String>,
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
    mut memory_hook: Option<ToolLoopMemoryHook<'_>>,
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
    let mut tools_executed = 0usize;

    for _ in 0..MAX_TOOL_ITERATIONS {
        if should_cancel() {
            break;
        }

        let mut calls = format.parse_tool_calls(&result.text);
        if calls.is_empty() {
            calls = crate::providers::prompt_format::tool_call_parse::parse_loose_tool_calls(
                &result.text,
            );
        }
        if calls.is_empty() {
            if tools_executed == 0
                && crate::providers::prompt_format::tool_call_parse::contains_tool_call_markup(
                    &result.text,
                )
            {
                tracing::warn!(
                    "model emitted tool_call markup but parser extracted 0 calls (len={})",
                    result.text.chars().count()
                );
            }
            break;
        }

        tracing::info!(
            "tool loop: parsed {} call(s): {}",
            calls.len(),
            calls
                .iter()
                .map(|c| c.name.as_str())
                .collect::<Vec<_>>()
                .join(", ")
        );

        let pairs: Vec<(String, serde_json::Value)> = calls
            .iter()
            .map(|c| (c.name.clone(), c.arguments.clone()))
            .collect();
        let tool_results = tools::execute_many(&ctx, &pairs).await;
        tools_executed += tool_results.len();

        if let Some(hook) = memory_hook.as_mut() {
            crate::chat::index_tool_results(
                hook.memory,
                hook.conn,
                hook.cfg,
                hook.session_id,
                &tool_results,
                hook.indexed_hashes,
            )
            .await;
        }

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

        let followup = match complete_stream_with_tool_auto_continue(
            row,
            messages.clone(),
            params.clone(),
            cfg,
            &mut on_token,
            should_cancel.clone(),
        )
        .await
        {
            Ok(followup) => {
                if followup.text.trim().is_empty()
                    || crate::providers::prompt_format::tool_call_parse::is_tool_call_only(
                        &followup.text,
                    )
                {
                    tracing::warn!(
                        "tool follow-up empty or tool-only; surfacing tool results to user"
                    );
                    let mut partial = result.clone();
                    partial.text = format_tool_results_for_user(&tool_results);
                    partial
                } else {
                    followup
                }
            }
            Err(e) => {
                tracing::warn!("tool follow-up stream failed: {e}; surfacing tool results to user");
                let mut partial = result.clone();
                partial.text = format_tool_results_for_user(&tool_results);
                partial
            }
        };
        result = followup;

        tracing::info!(
            "tool loop: executed {} tool(s), follow-up model={}",
            tool_results.len(),
            result.model
        );
    }

    if tools_executed > 0 {
        result.text = crate::providers::prompt_format::tool_call_parse::strip_tool_call_markup(
            &result.text,
        );
    }

    Ok(result)
}

fn format_tool_results_for_user(results: &[ToolExecutionResult]) -> String {
    if results.is_empty() {
        return String::new();
    }
    results
        .iter()
        .map(|r| {
            if r.ok {
                let body = serde_json::to_string_pretty(&r.output).unwrap_or_else(|_| {
                    serde_json::Value::String(r.message.clone()).to_string()
                });
                format!("[{}]\n{body}", r.name)
            } else {
                format!("[{}] ERROR: {}", r.name, r.message)
            }
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

async fn complete_stream_with_tool_auto_continue<F, C>(
    row: &crate::storage::repositories::ConnectionRow,
    base_messages: Vec<crate::models::ChatMessage>,
    params: crate::models::CompletionParams,
    cfg: &crate::providers::HttpConfig,
    on_token: &mut F,
    should_cancel: C,
) -> AppResult<crate::models::CompletionResult>
where
    F: FnMut(&str) + Send,
    C: Fn() -> bool + Send + Sync + Clone,
{
    let max_output = params.max_tokens.unwrap_or(0);
    let mut current_messages = base_messages.clone();
    let mut accumulated = String::new();
    let mut combined: Option<crate::models::CompletionResult> = None;

    for continue_idx in 0..=MAX_TOOL_AUTO_CONTINUES {
        let mut part = crate::providers::complete_stream(
            row,
            current_messages.clone(),
            params.clone(),
            cfg,
            |delta| on_token(delta),
            should_cancel.clone(),
        )
        .await?;

        apply_tool_output_truncation(&mut part, max_output);
        let part_text = std::mem::take(&mut part.text);
        let before_len = accumulated.len();
        accumulated = stitch_tool_continuation(&accumulated, &part_text);
        let visible_progress = accumulated.len() > before_len;
        merge_tool_completion_result(&mut combined, part, &accumulated);

        let should_continue = combined
            .as_ref()
            .is_some_and(|r| should_continue_tool_completion(r, &accumulated));
        if !should_continue || !visible_progress || should_cancel() {
            break;
        }
        if continue_idx == MAX_TOOL_AUTO_CONTINUES {
            break;
        }

        current_messages = tool_continuation_messages(&base_messages, &accumulated);
    }

    combined.ok_or_else(|| crate::utils::AppError::Validation("tool follow-up did not run".into()))
}

fn merge_tool_completion_result(
    combined: &mut Option<crate::models::CompletionResult>,
    mut part: crate::models::CompletionResult,
    accumulated_text: &str,
) {
    if let Some(out) = combined.as_mut() {
        out.text = accumulated_text.to_string();
        out.latency_ms = out.latency_ms.saturating_add(part.latency_ms);
        out.usage.input_tokens = out
            .usage
            .input_tokens
            .saturating_add(part.usage.input_tokens);
        out.usage.output_tokens = out
            .usage
            .output_tokens
            .saturating_add(part.usage.output_tokens);
        out.stream_incomplete |= part.stream_incomplete;
        out.finish_reason = part.finish_reason.take();
        out.output_truncated = part.output_truncated;
    } else {
        part.text = accumulated_text.to_string();
        *combined = Some(part);
    }
}

fn apply_tool_output_truncation(result: &mut crate::models::CompletionResult, max_output: u32) {
    if result.output_truncated {
        return;
    }
    if result.finish_reason.as_deref() == Some("length") {
        result.output_truncated = true;
        return;
    }
    if max_output == 0 || result.usage.output_tokens == 0 {
        return;
    }
    if result.usage.output_tokens >= max_output.saturating_sub(64) {
        result.output_truncated = true;
    }
}

fn should_continue_tool_completion(
    result: &crate::models::CompletionResult,
    accumulated_text: &str,
) -> bool {
    result.output_truncated || tool_continuation_context(accumulated_text).inside_fence
}

fn tool_continuation_messages(
    base: &[crate::models::ChatMessage],
    accumulated: &str,
) -> Vec<crate::models::ChatMessage> {
    let mut messages = base.to_vec();
    let ctx = tool_continuation_context(accumulated);
    messages.push(crate::models::ChatMessage {
        role: "assistant".into(),
        content: tail_chars(accumulated, TOOL_CONTINUATION_TAIL_CHARS),
        images: Vec::new(),
    });
    messages.push(crate::models::ChatMessage {
        role: "user".into(),
        content: tool_continuation_prompt(&ctx),
        images: Vec::new(),
    });
    messages
}

fn stitch_tool_continuation(accumulated: &str, next: &str) -> String {
    if accumulated.is_empty() || next.is_empty() {
        return format!("{accumulated}{next}");
    }
    let suffix = tail_chars(accumulated, TOOL_STITCH_OVERLAP_CHARS);
    let prefix: String = next.chars().take(TOOL_STITCH_OVERLAP_CHARS).collect();
    let max = suffix.chars().count().min(prefix.chars().count());
    for len in (8..=max).rev() {
        let suffix_tail = tail_chars(&suffix, len);
        let prefix_head: String = prefix.chars().take(len).collect();
        if suffix_tail == prefix_head {
            let rest: String = next.chars().skip(len).collect();
            return format!("{accumulated}{rest}");
        }
    }
    format!("{accumulated}{next}")
}

fn tail_chars(s: &str, max_chars: usize) -> String {
    let len = s.chars().count();
    if len <= max_chars {
        return s.to_string();
    }
    s.chars().skip(len - max_chars).collect()
}

struct ToolContinuationContext {
    inside_fence: bool,
    fence_language: Option<String>,
    last_line: String,
}

fn tool_continuation_context(text: &str) -> ToolContinuationContext {
    let mut inside_fence = false;
    let mut fence_language: Option<String> = None;
    for line in text.lines() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix("```") {
            inside_fence = !inside_fence;
            if inside_fence {
                let lang = rest.trim();
                fence_language = if lang.is_empty() {
                    None
                } else {
                    Some(lang.to_string())
                };
            }
        }
    }
    ToolContinuationContext {
        inside_fence,
        fence_language,
        last_line: text.lines().last().unwrap_or("").to_string(),
    }
}

fn tool_continuation_prompt(ctx: &ToolContinuationContext) -> String {
    let cursor = if ctx.last_line.trim().is_empty() {
        String::new()
    } else {
        format!(
            "\nThe cut happened after this exact line fragment:\n{}\n",
            ctx.last_line
        )
    };
    if ctx.inside_fence {
        let lang = ctx
            .fence_language
            .as_deref()
            .filter(|s| !s.is_empty())
            .unwrap_or("code");
        if lang.starts_with("file ") || lang.contains("path=") || lang.contains("file=") {
            return format!(
                "/no_think\nYour previous assistant message was cut off inside a generated file fence (`{lang}`).{cursor}Continue from the very next character of the file content. Do not repeat the fragment. When this file is complete, close the markdown fence with ```; if more generated files are required, continue with the next ```file ... fence. Do not explain or summarize."
            );
        }
        return format!(
            "/no_think\nYour previous assistant message was cut off inside a `{lang}` code block.{cursor}Continue from the very next character of the code. Do not repeat the fragment. Close the markdown fence with ``` once the code block is complete. Do not explain or summarize."
        );
    }
    format!(
        "/no_think\nYour previous assistant message above was cut off.{cursor}Continue exactly from the next character where it stopped. Output only the continuation. Do not restart, summarize, explain, add a heading, wrap in a new code fence, or repeat completed text."
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_scope_enables_tools() {
        let scope = ChatScope::Folder {
            path: "src/app".into(),
            tree_summary: String::new(),
            outline_summary: String::new(),
            files: vec![],
            truncated: false,
        };
        assert!(scope_enables_tools(&scope));
        assert_eq!(scope_path_for_tools(&scope).as_deref(), Some("src/app"));
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
        assert_eq!(scope_path_for_tools(&scope).as_deref(), Some("src/lib"));
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
    fn tool_protocol_shows_exact_call_syntax() {
        let mut system = Some("base".to_string());
        let scope = ChatScope::Folder {
            path: "src/app".into(),
            tree_summary: String::new(),
            outline_summary: String::new(),
            files: vec![],
            truncated: false,
        };

        augment_system_for_tools(&mut system, "openai_messages", &scope);
        let system = system.unwrap();

        assert!(system.contains("<|tool_call>call:read_file"));
        assert!(system.contains("Do not say \"I will inspect/read/check\""));
    }

    #[test]
    fn tool_followup_detects_output_length_truncation() {
        let mut result = crate::models::CompletionResult {
            text: "partial".into(),
            model: "test".into(),
            latency_ms: 0,
            usage: crate::models::TokenUsage {
                input_tokens: 10,
                output_tokens: 100,
            },
            context_window_size: None,
            scoped_text: None,
            session_summary: None,
            memory_compressed: false,
            evicted_turns: None,
            context_recovered: false,
            stream_incomplete: false,
            finish_reason: Some("stop".into()),
            output_truncated: false,
            retrieved_memory: None,
            vector_chunks_used: None,
            vector_memory_compressed: false,
        };

        apply_tool_output_truncation(&mut result, 120);

        assert!(result.output_truncated);
        assert!(should_continue_tool_completion(&result, &result.text));
    }

    #[test]
    fn tool_followup_continues_unclosed_file_fence() {
        let text = "```file test/app.js\nexport const x = ";
        let ctx = tool_continuation_context(text);
        let prompt = tool_continuation_prompt(&ctx);

        assert!(ctx.inside_fence);
        assert!(prompt.contains("generated file fence"));
        assert!(prompt.contains("close the markdown fence"));
    }

    #[test]
    fn tool_followup_stitches_repeated_overlap() {
        let a = "function demo() {\n  return ";
        let b = "  return 1;\n}\n";

        assert_eq!(
            stitch_tool_continuation(a, b),
            "function demo() {\n  return 1;\n}\n"
        );
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
