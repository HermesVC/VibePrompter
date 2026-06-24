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
/// Max chars per tool result body in follow-up user message (read_file content etc.).
pub const TOOL_RESULT_MAX_CHARS: usize = 12_000;
/// Max total chars for all tool results in one follow-up turn.
pub const TOOL_RESULT_TURN_MAX_CHARS: usize = 24_000;

const WORKSPACE_TOOLS_PROTOCOL: &str = r#"## Workspace file tools (active)

**Mandatory output format**
- For inspect/fix tasks on existing files: your first output must be `<|tool_call|>call:read_file{...}</|tool_call|>` (or apply_patch after you have read_file results). No prose before tool_call.
- Never paste a rewritten file body, ```file:``` fences, `edits:`, or labeled `old_text:` / `new_text:` blocks for existing files — those are not executed.
- One-line fixes = one apply_patch with a short old_text. Wait for tool results before explaining to the user.

You can inspect and edit the project with these tools (declare via tool_call blocks):
- `list_dir` — list files under a path (`path`, optional `depth`)
- `read_file` — read a file or line range (`path`, optional `start_line`/`end_line` or `lines:[start,end]`)
- `file_outline` — list classes/methods/functions in PHP/JS/Python (`path`)
- `read_symbol` — read a symbol body by name (`path`, `symbol`)
- `apply_patch` — surgical edit on **existing** files (`path`, `edits`: [{`old_text`, `new_text`}], optional `expected_hash` from read_file)
- `write_file` — create a **new** file only (`path`, `content`). Fails if file exists — then use apply_patch.
- `run_verify` — deterministic check after edits (`kind`: file_contains | file_not_contains | php_lint | cargo_check | vitest, plus `path` / `needle` / `manifest`)

Use relative paths from the workspace root. In **folder scope**, you may pass a bare filename (`index.html`) or the full path (`test/foo/index.html`).
Prefer `read_file` before editing existing files.
**New vs existing:** `list_dir` first if unsure. **New path** → `write_file`. **Existing path** → `read_file` then `apply_patch`. Never use apply_patch with empty old_text to create a file.
**Patch sizing:** prefer the smallest unique `old_text` (often 1–3 lines for typos). Multi-line `old_text` is fine when the fix genuinely spans a case block, method, or branch — include enough context that the anchor is unique once in the file.
Do not paste a whole file unless creating a new one. Split unrelated fixes into separate apply_patch calls.
If the tool returns "patch too large", narrow the anchor or split into sequential edits.

### Correct vs wrong (existing files)

GOOD — one-line typo fix:
<|tool_call|>call:apply_patch{path:vp/src/api/Foo.php,old_text:foreach ($projectUids as $id),new_text:foreach ($projectUuids as $id)}</|tool_call|>

GOOD — read then patch:
<|tool_call|>call:read_file{path:vp/src/api/Foo.php}</|tool_call|>
(then after tool results)
<|tool_call|>call:apply_patch{path:vp/src/api/Foo.php,old_text:exact unique lines,new_text:fixed lines}</|tool_call|>

GOOD — multi-line block when the bug spans several lines (unique anchor):
<|tool_call|>call:apply_patch{path:vp/src/api/Foo.php,old_text:"    case 'a':\n        break;\n    case 'b':",new_text:"    case 'a':\n        break;\n    case 'b_fixed':"}</|tool_call|>

BAD — not executed as tools (do NOT use for patches):
```file:path/to/File.php
edits:[{"old_text":"...whole method...","new_text":"..."}]
```

BAD — labeled old_text/new_text inside file fences (shown as garbage in UI, not applied):
```file:path/to/File.php
old_text:
foreach ($projectUids as $id) {
new_text:
foreach ($projectUuids as $id) {
```

BAD — whole file or entire class in one old_text on an **existing** file (split edits or use write_file for new paths).

### Creating NEW files (scaffold, index.html, new modules)

GOOD — new file via write_file (quote content when it contains commas or HTML tags):
<|tool_call|>call:write_file{path:index.html,content:"<!DOCTYPE html>\n<html><body>ok</body></html>"}</|tool_call|>

BAD — apply_patch on non-existent file or empty old_text:
<|tool_call|>call:apply_patch{path:test/new.html,old_text:,new_text:...}</|tool_call|>

Alternative for new files (applied after the turn in UI, not in tool loop): markdown fence
```file test/qwen_test/styles.css
/* full css */
```
Prefer **write_file** in tool_call when tools are active so files land immediately.

**Never** use markdown ` ```file:...` fences with `edits:` for existing files. Use tool_call only.
One small fix = one apply_patch call. Split multiple bugs into separate tool_call blocks.

When you need to inspect files, emit tool_call block(s) in one of these formats, then wait:

Qwen / LM Studio (preferred):
<|tool_call|>call:read_file{path:relative/path.ext}</|tool_call|>
<|tool_call|>call:apply_patch{path:relative/path.ext,old_text:exact lines,new_text:replacement}</|tool_call|>
<|tool_call|>call:write_file{path:relative/new.ext,content:full file body}</|tool_call|>

Gemma 4:
<|tool_call>call:read_file{path:<|"|>relative/path.ext<|"|>}<|tool_call|>
<|tool_call>call:apply_patch{path:<|"|>relative/path.ext<|"|>,old_text:<|"|>old<|"|>,new_text:<|"|>new<|"|>}<|tool_call|>

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

/// True when scope and connection format both support the workspace agent tool loop.
pub fn connection_tools_active(scope: &ChatScope, prompt_format_id: &str) -> bool {
    scope_enables_tools(scope) && prompt_format::resolve(prompt_format_id).supports_tool_calling()
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
    let capped: Vec<ToolExecutionResult> = results
        .iter()
        .map(|r| ToolExecutionResult {
            name: r.name.clone(),
            ok: r.ok,
            output: cap_tool_output_for_followup(&r.name, &r.output, r.ok),
            message: r.message.clone(),
        })
        .collect();

    let body = if prompt_format_id == "gemma4" {
        capped
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
        capped
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
    };

    cap_tool_followup_turn_text(body)
}

/// Shrink tool JSON before it enters the follow-up user message.
pub fn cap_tool_output_for_followup(
    name: &str,
    output: &serde_json::Value,
    ok: bool,
) -> serde_json::Value {
    if !ok {
        return output.clone();
    }
    match name {
        "read_file" => cap_read_file_tool_output(output),
        "apply_patch" => summarize_patch_tool_output(output),
        "write_file" => summarize_write_tool_output(output),
        _ => cap_generic_tool_output(output),
    }
}

fn cap_read_file_tool_output(output: &serde_json::Value) -> serde_json::Value {
    let mut out = output.clone();
    let Some(content) = out.get("content").and_then(|v| v.as_str()) else {
        return cap_generic_tool_output(output);
    };
    if content.chars().count() <= TOOL_RESULT_MAX_CHARS {
        return out;
    }
    let truncated: String = content.chars().take(TOOL_RESULT_MAX_CHARS).collect();
    if let Some(obj) = out.as_object_mut() {
        obj.insert(
            "content".into(),
            json!(format!(
                "{truncated}\n… [truncated — use read_file with lines:[start,end] for more]"
            )),
        );
        obj.insert("truncated".into(), json!(true));
    }
    out
}

fn summarize_patch_tool_output(output: &serde_json::Value) -> serde_json::Value {
    json!({
        "path": output.get("path"),
        "contentHash": output.get("contentHash").or_else(|| output.get("content_hash")),
        "editsApplied": output.get("editsApplied").or_else(|| output.get("edits_applied")),
        "lineCount": output.get("lineCount").or_else(|| output.get("line_count")),
        "ok": true,
    })
}

fn summarize_write_tool_output(output: &serde_json::Value) -> serde_json::Value {
    json!({
        "path": output.get("path"),
        "contentHash": output.get("contentHash").or_else(|| output.get("content_hash")),
        "lineCount": output.get("lineCount").or_else(|| output.get("line_count")),
        "created": output.get("created").unwrap_or(&json!(true)),
    })
}

fn cap_generic_tool_output(output: &serde_json::Value) -> serde_json::Value {
    let serialized = serde_json::to_string(output).unwrap_or_default();
    if serialized.chars().count() <= TOOL_RESULT_MAX_CHARS {
        return output.clone();
    }
    json!({
        "truncated": true,
        "preview": serialized.chars().take(TOOL_RESULT_MAX_CHARS).collect::<String>(),
        "hint": "output too large for follow-up — use narrower tool args",
    })
}

fn cap_tool_followup_turn_text(body: String) -> String {
    if body.chars().count() <= TOOL_RESULT_TURN_MAX_CHARS {
        return body;
    }
    let truncated: String = body.chars().take(TOOL_RESULT_TURN_MAX_CHARS).collect();
    format!(
        "{truncated}\n… [tool results truncated for context — re-read with lines/ranges if needed]"
    )
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
    pub context_limit: i64,
    pub memory_llm_summarize: bool,
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
    context_limit: i64,
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
    let mut last_tool_results: Vec<ToolExecutionResult> = Vec::new();
    let mut all_tool_results: Vec<ToolExecutionResult> = Vec::new();

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
        calls = crate::providers::prompt_format::tool_call_parse::expand_apply_patch_calls(calls);
        if calls.is_empty() {
            if tools_executed == 0
                && crate::providers::prompt_format::tool_call_parse::contains_tool_call_markup(
                    &result.text,
                )
            {
                tracing::warn!(
                    "model emitted tool/patch markup but parser extracted 0 calls (len={})",
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
        last_tool_results = tool_results.clone();
        all_tool_results.extend(tool_results.clone());

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
            context_limit,
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
        result.text = crate::providers::prompt_format::tool_call_parse::strip_assistant_wire_markup(
            &result.text,
        );
        let failures: Vec<_> = last_tool_results.iter().filter(|r| !r.ok).collect();
        if !failures.is_empty() && !result.text.contains("ERROR:") {
            let err_block = format_tool_results_for_user(
                &failures.iter().map(|r| (*r).clone()).collect::<Vec<_>>(),
            );
            if !err_block.trim().is_empty() {
                result.text = format!("{err_block}\n\n{}", result.text.trim());
            }
        }
        if let Some(hook) = memory_hook.as_mut() {
            crate::chat::index_turn_memory_after_tools(
                hook.memory,
                hook.conn,
                hook.cfg,
                hook.session_id,
                hook.context_limit,
                hook.memory_llm_summarize,
                &result.text,
                &all_tool_results,
                hook.indexed_hashes,
            )
            .await;
        }
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
                let body = serde_json::to_string_pretty(&r.output)
                    .unwrap_or_else(|_| serde_json::Value::String(r.message.clone()).to_string());
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
    context_limit: i64,
    on_token: &mut F,
    should_cancel: C,
) -> AppResult<crate::models::CompletionResult>
where
    F: FnMut(&str) + Send,
    C: Fn() -> bool + Send + Sync + Clone,
{
    let max_output = params.max_tokens.unwrap_or(256);
    let reserve_output = max_output.max(256);
    use crate::chat::completion_recovery::MAX_COMPLETION_CONTEXT_RETRIES;
    use crate::chat::{should_retry_for_context, WindowAggression};

    let mut aggression = WindowAggression::Normal;
    let mut last_result: AppResult<crate::models::CompletionResult> = Err(
        crate::utils::AppError::Validation("tool follow-up did not run".into()),
    );

    for attempt in 0..=MAX_COMPLETION_CONTEXT_RETRIES {
        if should_cancel() {
            return Err(crate::utils::AppError::Validation("cancelled".into()));
        }
        if attempt > 0 {
            aggression = aggression.next();
            tracing::warn!(
                "tool follow-up context recovery attempt {attempt}/{MAX_COMPLETION_CONTEXT_RETRIES} (aggression={aggression:?})"
            );
        }

        let window = crate::chat::plan_sliding_window_with_aggression(
            base_messages.clone(),
            context_limit,
            "",
            reserve_output,
            aggression,
        );
        let input_estimate = crate::chat::completion_recovery::estimate_completion_input_tokens(
            &window.active,
            params.system.as_deref(),
        );

        last_result = complete_stream_with_tool_auto_continue_inner(
            row,
            &base_messages,
            window.active,
            params.clone(),
            cfg,
            max_output,
            on_token,
            should_cancel.clone(),
        )
        .await;

        let retry = attempt < MAX_COMPLETION_CONTEXT_RETRIES
            && should_retry_for_context(
                last_result.as_ref().map_err(|e| e),
                input_estimate,
                context_limit,
            );
        if !retry {
            break;
        }
    }

    last_result
}

async fn complete_stream_with_tool_auto_continue_inner<F, C>(
    row: &crate::storage::repositories::ConnectionRow,
    base_messages: &[crate::models::ChatMessage],
    window_messages: Vec<crate::models::ChatMessage>,
    params: crate::models::CompletionParams,
    cfg: &crate::providers::HttpConfig,
    max_output: u32,
    on_token: &mut F,
    should_cancel: C,
) -> AppResult<crate::models::CompletionResult>
where
    F: FnMut(&str) + Send,
    C: Fn() -> bool + Send + Sync + Clone,
{
    let mut current_messages = window_messages;
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
    fn caps_read_file_in_followup_message() {
        let huge = "x".repeat(TOOL_RESULT_MAX_CHARS + 500);
        let out = cap_tool_output_for_followup(
            "read_file",
            &json!({ "path": "a.php", "content": huge }),
            true,
        );
        let content = out["content"].as_str().unwrap_or("");
        assert!(content.contains("truncated"));
        assert!(content.chars().count() < huge.chars().count());
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
        assert!(system.contains("GOOD — one-line typo fix"));
        assert!(system.contains("BAD — not executed"));
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
            memory_diagnostics: None,
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
