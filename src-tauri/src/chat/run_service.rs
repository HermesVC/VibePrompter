//! Reusable chat run pipeline.
//!
//! Tauri commands and future headless/debug runners should call this module
//! instead of owning the agent loop directly.

use std::collections::HashSet;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::app::AppState;
use crate::models::{ChatMessage, CompletionParams, CompletionResult, NewHistoryItem};
use crate::utils::AppError;

const MAX_CONTEXT_RETRIES: usize = 2;
const MAX_AUTO_CONTINUES: usize = 3;
const CONTINUATION_TAIL_CHARS: usize = 6_000;
const STITCH_OVERLAP_CHARS: usize = 2_000;

const FILE_ARTIFACT_PROTOCOL: &str = r#"When the user asks you to create or modify code that naturally spans multiple files, output each file as a separate markdown fence using exactly this header:
```file relative/path/from/workspace.ext
file contents
```
Use one fence per file. Put no prose inside file fences. Use stable relative workspace paths. Do not merge multiple files into one fence. If only one file is needed, you may still use one file fence.
For plans, notes, and markdown context files (.md), use clear filenames (e.g. PLAN.md, notes/context.md) — the app remembers these paths in semantic memory."#;

const DIAGNOSTIC_INSPECTION_PROTOCOL: &str = r#"Diagnostic/debug request in workspace scope:
- First inspect the relevant files with workspace tool_call blocks. Do not output generated file fences, rewrites, or replacement code before tool results.
- If you cannot call tools, say which exact files you need to read; do not invent file contents.
- After tool results, explain the likely root cause first. Only then provide a minimal patch if the user explicitly asked to fix it."#;

pub struct ChatRunRequest {
    pub messages: Vec<ChatMessage>,
    pub mode_id: Option<String>,
    pub connection_id: Option<String>,
    pub chat_context: Option<crate::workspace::ChatContextPayload>,
    pub session_summary: Option<String>,
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRunStatus {
    pub phase: String,
    pub generation: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attempt: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRunMemoryUpdate {
    pub session_summary: String,
    pub context_window_size: i64,
}

pub trait ChatRunEventSink {
    fn status(&mut self, status: ChatRunStatus);
    fn token(&mut self, generation: u32, delta: &str);
    fn memory(&mut self, update: ChatRunMemoryUpdate);
}

struct AutoContinueOutput {
    result: CompletionResult,
    continuations: usize,
}

pub async fn run_chat<E>(
    state: &AppState,
    mut request: ChatRunRequest,
    cancel_flag: Arc<AtomicBool>,
    events: &mut E,
) -> Result<CompletionResult, AppError>
where
    E: ChatRunEventSink + Send,
{
    if let Some(ctx) = request.chat_context.as_mut() {
        crate::workspace::normalize_chat_context(ctx);
    }

    validate_messages(&request.messages)?;

    let mut messages = request.messages;
    if let Some(ctx) = request.chat_context.as_ref() {
        augment_messages_with_scope(&mut messages, ctx);
    }

    let (mut system_prompt, mode_name, mode_icon, temperature, max_tokens) =
        resolve_mode_context(state, request.mode_id.as_deref()).await?;

    if let Some(ctx) = request.chat_context.as_ref() {
        let base = system_prompt.unwrap_or_default();
        system_prompt = Some(state.workspace.compose_system(&base, ctx));
    }
    append_file_artifact_protocol(&mut system_prompt);
    append_diagnostic_inspection_protocol(
        &mut system_prompt,
        &messages,
        request.chat_context.as_ref(),
    );

    let row = resolve_chat_connection_row(
        state,
        request.connection_id.clone(),
        request.mode_id.clone(),
    )
    .await?;

    if let Some(ctx) = request.chat_context.as_ref() {
        crate::chat::augment_system_for_tools(&mut system_prompt, &row.prompt_format, &ctx.scope);
    }

    let cfg = state.connections.http_config().await;
    let context_limit = resolve_context_limit(&row, &cfg).await;

    let mut memory = request.session_summary.unwrap_or_default();
    let initial_memory = memory.clone();
    let reserve_output = max_tokens.max(256) as u32;
    let mut aggression = crate::chat::WindowAggression::Normal;
    let mut memory_compressed = false;
    let mut evicted_count = 0u32;
    let mut stream_generation = 0u32;
    let mut auto_continuations_used = 0usize;
    let session_id = request.session_id.unwrap_or_default();
    let mut retrieved_preview: Option<String> = None;
    let mut vector_chunks_used: Option<u32> = None;
    let mut vector_memory_compressed = false;
    let mut indexed_chunk_hashes: HashSet<String> = if session_id.trim().is_empty() {
        HashSet::new()
    } else {
        state
            .chat_memory
            .list_content_hashes(&session_id)
            .await
            .unwrap_or_default()
            .into_iter()
            .collect()
    };
    let mut compressed_evicted_keys: HashSet<String> = HashSet::new();
    let mut query_emb_cache: Option<Vec<f32>> = None;

    let _permit = state.connections.acquire_permit().await;
    let mut result: Result<CompletionResult, AppError> =
        Err(AppError::Validation("chat stream did not run".into()));
    let mut successful_attempt = 0usize;

    for attempt in 0..=MAX_CONTEXT_RETRIES {
        if cancel_flag.load(Ordering::SeqCst) {
            result = Err(AppError::Validation("cancelled".into()));
            break;
        }

        if attempt > 0 {
            stream_generation += 1;
            aggression = aggression.next();
            events.status(ChatRunStatus {
                phase: "recovering".into(),
                generation: stream_generation,
                kind: None,
                attempt: None,
            });
            tracing::warn!(
                "context recovery attempt {attempt}/{MAX_CONTEXT_RETRIES} (aggression={aggression:?})"
            );
        }

        let window_plan = crate::chat::plan_sliding_window_with_aggression(
            messages.clone(),
            context_limit,
            &memory,
            reserve_output,
            aggression,
        );
        evicted_count = window_plan.evicted.len() as u32;

        if crate::chat::session_memory_needs_compression(&memory, context_limit) {
            events.status(ChatRunStatus {
                phase: "compressing_memory".into(),
                generation: stream_generation,
                kind: Some("rolling".into()),
                attempt: None,
            });
            match crate::chat::compress_session_memory(&row, &cfg, &memory, context_limit).await {
                Ok(compressed) => {
                    memory = compressed;
                    memory_compressed = true;
                }
                Err(e) => {
                    tracing::warn!("rolling memory compression failed: {e}");
                    memory = crate::chat::fallback_compress_session_memory(&memory, context_limit);
                    memory_compressed = true;
                }
            }
            emit_chat_memory_update(events, &memory, context_limit);
        }

        let evicted_for_compression: Vec<ChatMessage> = window_plan
            .evicted
            .iter()
            .filter(|m| !compressed_evicted_keys.contains(&message_memory_key(m)))
            .cloned()
            .collect();

        if !evicted_for_compression.is_empty() {
            events.status(ChatRunStatus {
                phase: "compressing_memory".into(),
                generation: stream_generation,
                kind: None,
                attempt: None,
            });
            match crate::chat::compress_evicted_turns(
                &row,
                &cfg,
                &memory,
                &evicted_for_compression,
                context_limit,
            )
            .await
            {
                Ok(merged) => {
                    memory = merged;
                    memory_compressed = true;
                }
                Err(e) => {
                    tracing::warn!("memory compression failed: {e}, using truncated fallback");
                    memory = crate::chat::fallback_merge_memory(
                        &memory,
                        &evicted_for_compression,
                        context_limit,
                    );
                    memory_compressed = true;
                }
            }
            for m in &evicted_for_compression {
                compressed_evicted_keys.insert(message_memory_key(m));
            }
            emit_chat_memory_update(events, &memory, context_limit);

            if crate::chat::session_memory_needs_compression(&memory, context_limit) {
                events.status(ChatRunStatus {
                    phase: "compressing_memory".into(),
                    generation: stream_generation,
                    kind: Some("rolling".into()),
                    attempt: None,
                });
                match crate::chat::compress_session_memory(&row, &cfg, &memory, context_limit).await
                {
                    Ok(compressed) => {
                        memory = compressed;
                        memory_compressed = true;
                    }
                    Err(e) => {
                        tracing::warn!("rolling memory post-merge compression failed: {e}");
                        memory =
                            crate::chat::fallback_compress_session_memory(&memory, context_limit);
                        memory_compressed = true;
                    }
                }
                emit_chat_memory_update(events, &memory, context_limit);
            }
        }

        if !window_plan.evicted.is_empty()
            && !session_id.trim().is_empty()
            && crate::chat::index_evicted_messages(
                &state.chat_memory,
                &row,
                &cfg,
                &session_id,
                &window_plan.evicted,
                &mut indexed_chunk_hashes,
            )
            .await
        {
            vector_memory_compressed = true;
        }

        let api_messages = window_plan.active;
        let query_text = messages
            .last()
            .filter(|m| m.role == "user")
            .map(|m| m.content.as_str())
            .unwrap_or("");
        let retrieved = if session_id.trim().is_empty() {
            Vec::new()
        } else {
            crate::chat::retrieve_relevant(
                &state.chat_memory,
                &row,
                &cfg,
                &session_id,
                query_text,
                context_limit,
                &mut query_emb_cache,
            )
            .await
        };
        let retrieved_block = crate::chat::format_retrieved_for_system(&retrieved);
        retrieved_preview = if retrieved.is_empty() {
            None
        } else {
            Some(retrieved_block.clone())
        };
        vector_chunks_used = if retrieved.is_empty() {
            None
        } else {
            Some(retrieved.len() as u32)
        };

        let input_estimate = estimate_chat_input_tokens(
            &api_messages,
            system_prompt.as_deref(),
            &memory,
            &retrieved_block,
        );
        let effective_max_tokens =
            effective_chat_max_tokens(max_tokens, input_estimate, context_limit);

        let mut request_system = system_prompt.clone();
        if let Some(sys) = request_system.as_mut() {
            crate::chat::append_memory_to_system(sys, Some(&memory), context_limit);
            crate::chat::append_retrieved_to_system(sys, &retrieved_block);
        } else {
            let mut sys = String::new();
            crate::chat::append_memory_to_system(&mut sys, Some(&memory), context_limit);
            crate::chat::append_retrieved_to_system(&mut sys, &retrieved_block);
            request_system = Some(sys);
        }

        let params = CompletionParams {
            model: None,
            temperature: Some(temperature),
            max_tokens: Some(effective_max_tokens),
            system: request_system.filter(|s| !s.trim().is_empty()),
            ..Default::default()
        };

        let mut stream_out = complete_stream_with_auto_continue(
            events,
            &row,
            api_messages.clone(),
            params.clone(),
            &cfg,
            stream_generation,
            cancel_flag.clone(),
            effective_max_tokens,
        )
        .await;

        if let Ok(ref mut out) = stream_out {
            if let Some(ctx) = request.chat_context.as_ref() {
                if crate::chat::scope_enables_tools(&ctx.scope) {
                    let scope_path = crate::chat::scope_path_for_tools(&ctx.scope);
                    events.status(ChatRunStatus {
                        phase: "tools".into(),
                        generation: stream_generation,
                        kind: None,
                        attempt: None,
                    });
                    let cancel_for_stream = cancel_flag.clone();
                    match crate::chat::run_tool_followup_loop(
                        state,
                        &row.prompt_format,
                        scope_path,
                        api_messages.clone(),
                        params.clone(),
                        &cfg,
                        &row,
                        out.result.clone(),
                        |delta| events.token(stream_generation, delta),
                        move || cancel_for_stream.load(Ordering::SeqCst),
                        if session_id.trim().is_empty() {
                            None
                        } else {
                            Some(crate::chat::ToolLoopMemoryHook {
                                session_id: &session_id,
                                memory: &state.chat_memory,
                                conn: &row,
                                cfg: &cfg,
                                indexed_hashes: &mut indexed_chunk_hashes,
                            })
                        },
                    )
                    .await
                    {
                        Ok(followup) => out.result = followup,
                        Err(e) => tracing::warn!("tool follow-up loop failed: {e}"),
                    }
                }
            }
        }

        if cancel_flag.load(Ordering::SeqCst) {
            result = Err(AppError::Validation("cancelled".into()));
            break;
        }

        let retry = attempt < MAX_CONTEXT_RETRIES
            && crate::chat::should_retry_for_context(
                stream_out.as_ref().map(|o| &o.result).map_err(|e| e),
                input_estimate,
                context_limit,
            );
        if retry {
            continue;
        }

        result = stream_out.map(|o| {
            auto_continuations_used = o.continuations;
            if o.continuations > 0 {
                tracing::info!("auto-continued chat completion {} time(s)", o.continuations);
            }
            o.result
        });
        successful_attempt = attempt;
        break;
    }

    let context_recovered = successful_attempt > 0 && result.is_ok();
    let was_cancelled =
        cancel_flag.load(Ordering::SeqCst) || result.as_ref().err().is_some_and(is_cancelled_err);
    let source_label = source_label(&messages);

    match result {
        Ok(mut r) => {
            state
                .connections
                .enrich_completion_context(&row, &mut r)
                .await;
            if context_limit > 0 {
                r.context_window_size = Some(context_limit);
            }
            if !memory.trim().is_empty() {
                r.session_summary = Some(memory.clone());
            }
            r.memory_compressed = memory_compressed;
            if memory_compressed && evicted_count > 0 {
                r.evicted_turns = Some(evicted_count);
            }
            r.context_recovered = context_recovered;
            r.retrieved_memory = retrieved_preview.clone();
            r.vector_chunks_used = vector_chunks_used;
            r.vector_memory_compressed = vector_memory_compressed;
            if let Some(ctx) = request.chat_context.as_ref() {
                use crate::workspace::ChatScope;
                let user_edit_intent = messages
                    .last()
                    .filter(|m| m.role == "user")
                    .map(|m| crate::workspace::user_requests_code_edit(&m.content))
                    .unwrap_or(false);
                r.scoped_text = match &ctx.scope {
                    ChatScope::Snippet { .. } | ChatScope::File { .. } if user_edit_intent => {
                        Some(state.workspace.extract_snippet(&r.text))
                    }
                    _ => None,
                };
            }
            if was_cancelled {
                return Err(AppError::Validation("cancelled".into()));
            }
            if !session_id.trim().is_empty() {
                if let Some(inner) =
                    crate::workspace::plan_memory::extract_plan_step_summary(&r.text)
                {
                    crate::chat::index_plan_step_summary(
                        &state.chat_memory,
                        &row,
                        &cfg,
                        &session_id,
                        &inner,
                        &mut indexed_chunk_hashes,
                    )
                    .await;
                }
            }
            state.connections.mark_used(&row.id).await;
            record_history(state, &row, &r, mode_name, mode_icon, source_label).await;
            Ok(r)
        }
        Err(e) => {
            if memory.trim() != initial_memory.trim() && !memory.trim().is_empty() {
                emit_chat_memory_update(events, &memory, context_limit);
            }
            Err(e)
        }
    }
}

fn validate_messages(messages: &[ChatMessage]) -> Result<(), AppError> {
    if messages.is_empty() {
        return Err(AppError::Validation("messages is empty".into()));
    }
    let last = messages
        .last()
        .ok_or_else(|| AppError::Validation("messages is empty".into()))?;
    if last.role != "user" {
        return Err(AppError::Validation(
            "last message must be from the user".into(),
        ));
    }
    if last.content.trim().is_empty() && last.images.is_empty() {
        return Err(AppError::Validation("last user message is empty".into()));
    }
    Ok(())
}

async fn resolve_mode_context(
    state: &AppState,
    mode_id: Option<&str>,
) -> Result<(Option<String>, String, String, f64, i64), AppError> {
    if let Some(mid) = mode_id.filter(|s| !s.trim().is_empty()) {
        let modes = state.catalog.list_modes().await?;
        let mode = modes
            .iter()
            .find(|m| m.id == mid)
            .ok_or_else(|| AppError::NotFound {
                entity: "prompt_mode",
                id: mid.to_string(),
            })?
            .clone();
        return Ok((
            Some(crate::services::prompt_template::render(
                &mode.system_prompt,
                &mode.variables,
            )),
            mode.name.clone(),
            mode.icon_name.clone(),
            mode.temperature,
            mode.max_tokens,
        ));
    }
    Ok((None, "Chat".to_string(), "mail".to_string(), 0.7, 4096))
}

async fn resolve_chat_connection_row(
    state: &AppState,
    connection_id: Option<String>,
    mode_id: Option<String>,
) -> Result<crate::storage::repositories::ConnectionRow, AppError> {
    if let Some(id) = connection_id.as_deref().filter(|s| !s.is_empty()) {
        return state.connections.get_row(id).await;
    }
    if let Some(mid) = mode_id.as_deref().filter(|s| !s.trim().is_empty()) {
        let modes = state.catalog.list_modes().await?;
        let mode = modes
            .iter()
            .find(|m| m.id == mid)
            .ok_or_else(|| AppError::NotFound {
                entity: "prompt_mode",
                id: mid.to_string(),
            })?;
        if let Some(override_id) = mode.provider_override.as_deref().filter(|s| !s.is_empty()) {
            return state.connections.get_row(override_id).await;
        }
    }
    state
        .connections
        .get_default_row()
        .await?
        .ok_or_else(|| AppError::Validation("no default connection configured".into()))
}

fn append_file_artifact_protocol(system_prompt: &mut Option<String>) {
    let mut sys = system_prompt.take().unwrap_or_default();
    if !sys.trim().is_empty() {
        sys.push_str("\n\n");
    }
    sys.push_str(FILE_ARTIFACT_PROTOCOL);
    *system_prompt = Some(sys);
}

fn append_diagnostic_inspection_protocol(
    system_prompt: &mut Option<String>,
    messages: &[ChatMessage],
    ctx: Option<&crate::workspace::ChatContextPayload>,
) {
    let Some(ctx) = ctx else {
        return;
    };
    if !scope_needs_tool_inspection(&ctx.scope) {
        return;
    }
    let Some(last_user) = messages.iter().rev().find(|m| m.role == "user") else {
        return;
    };
    if !user_requests_diagnosis(&last_user.content) {
        return;
    }

    let mut sys = system_prompt.take().unwrap_or_default();
    if !sys.trim().is_empty() {
        sys.push_str("\n\n");
    }
    sys.push_str(DIAGNOSTIC_INSPECTION_PROTOCOL);
    *system_prompt = Some(sys);
}

fn scope_needs_tool_inspection(scope: &crate::workspace::ChatScope) -> bool {
    matches!(
        scope,
        crate::workspace::ChatScope::Folder { .. } | crate::workspace::ChatScope::Workspace { .. }
    )
}

fn user_requests_diagnosis(text: &str) -> bool {
    let t = text.to_lowercase();
    const MARKERS: &[&str] = &[
        "разбер",
        "что не так",
        "почему",
        "не работает",
        "сломал",
        "сломалось",
        "баг",
        "ошибк",
        "debug",
        "diagnos",
        "what is wrong",
        "why",
        "find the problem",
        "root cause",
        "game over",
    ];
    MARKERS.iter().any(|m| t.contains(m))
}

async fn complete_stream_with_auto_continue<E>(
    events: &mut E,
    row: &crate::storage::repositories::ConnectionRow,
    api_messages: Vec<ChatMessage>,
    params: CompletionParams,
    cfg: &crate::providers::HttpConfig,
    stream_generation: u32,
    cancel_flag: Arc<AtomicBool>,
    max_output: u32,
) -> Result<AutoContinueOutput, AppError>
where
    E: ChatRunEventSink + Send,
{
    let base_messages = api_messages;
    let mut current_messages = base_messages.clone();
    let mut accumulated = String::new();
    let mut combined: Option<CompletionResult> = None;
    let mut continuations = 0usize;

    for continue_idx in 0..=MAX_AUTO_CONTINUES {
        if continue_idx > 0 {
            events.status(ChatRunStatus {
                phase: "continuing".into(),
                generation: stream_generation,
                kind: None,
                attempt: Some(continue_idx),
            });
        }

        let cancel_for_stream = cancel_flag.clone();
        let mut part = crate::providers::complete_stream(
            row,
            current_messages.clone(),
            params.clone(),
            cfg,
            |delta| events.token(stream_generation, delta),
            move || cancel_for_stream.load(Ordering::SeqCst),
        )
        .await?;
        apply_output_truncation(&mut part, max_output);

        let part_text = std::mem::take(&mut part.text);
        let before_len = accumulated.len();
        accumulated = stitch_continuation(&accumulated, &part_text);
        let visible_progress = accumulated.len() > before_len;
        merge_completion_result(&mut combined, part, &accumulated);

        let should_continue = combined
            .as_ref()
            .is_some_and(|r| should_auto_continue_completion(r, &accumulated));
        if !should_continue || !visible_progress || cancel_flag.load(Ordering::SeqCst) {
            break;
        }
        if continue_idx == MAX_AUTO_CONTINUES {
            break;
        }

        continuations += 1;
        current_messages = continuation_messages(&base_messages, &accumulated);
    }

    let result = combined.ok_or_else(|| AppError::Validation("chat stream did not run".into()))?;
    Ok(AutoContinueOutput {
        result,
        continuations,
    })
}

fn merge_completion_result(
    combined: &mut Option<CompletionResult>,
    mut part: CompletionResult,
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

fn should_auto_continue_completion(result: &CompletionResult, accumulated_text: &str) -> bool {
    result.output_truncated || continuation_context(accumulated_text).inside_fence
}

fn continuation_messages(base: &[ChatMessage], accumulated: &str) -> Vec<ChatMessage> {
    let mut messages = base.to_vec();
    let context = continuation_context(accumulated);
    messages.push(ChatMessage {
        role: "assistant".into(),
        content: tail_chars(accumulated, CONTINUATION_TAIL_CHARS),
        images: Vec::new(),
    });
    messages.push(ChatMessage {
        role: "user".into(),
        content: continuation_prompt(&context),
        images: Vec::new(),
    });
    messages
}

fn stitch_continuation(accumulated: &str, next: &str) -> String {
    if accumulated.is_empty() || next.is_empty() {
        return format!("{accumulated}{next}");
    }
    let suffix = tail_chars(accumulated, STITCH_OVERLAP_CHARS);
    let prefix: String = next.chars().take(STITCH_OVERLAP_CHARS).collect();
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

struct ContinuationContext {
    inside_fence: bool,
    fence_language: Option<String>,
    last_line: String,
}

fn continuation_context(text: &str) -> ContinuationContext {
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
    ContinuationContext {
        inside_fence,
        fence_language,
        last_line: text.lines().last().unwrap_or("").to_string(),
    }
}

fn continuation_prompt(ctx: &ContinuationContext) -> String {
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

fn apply_output_truncation(result: &mut CompletionResult, max_output: u32) {
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

fn tail_chars(s: &str, max_chars: usize) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() <= max_chars {
        return s.to_string();
    }
    chars[chars.len() - max_chars..].iter().collect()
}

fn message_memory_key(message: &ChatMessage) -> String {
    let mut hasher = Sha256::new();
    hasher.update(message.role.as_bytes());
    hasher.update(b"\0");
    hasher.update(message.content.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn augment_messages_with_scope(
    messages: &mut Vec<ChatMessage>,
    ctx: &crate::workspace::ChatContextPayload,
) {
    let block = scope_user_context_block(&ctx.scope);
    if block.is_empty() {
        return;
    }
    let Some(last) = messages.last_mut() else {
        return;
    };
    if last.role != "user" {
        return;
    }
    if last.content.contains("[Attached snippet")
        || last.content.contains("[Attached file")
        || last.content.contains("[Attached folder")
        || last.content.contains("[Workspace tree]")
    {
        return;
    }
    last.content = if last.content.trim().is_empty() {
        block
    } else {
        format!("{}\n\n{}", last.content.trim(), block)
    };
}

fn scope_user_context_block(scope: &crate::workspace::ChatScope) -> String {
    use crate::workspace::ChatScope;
    match scope {
        ChatScope::None => String::new(),
        ChatScope::Snippet { working, .. } => {
            format!("[Attached snippet for reference]\n```\n{working}\n```")
        }
        ChatScope::File {
            path,
            content,
            line_start,
            line_end,
            ..
        } => {
            format!("[Attached file: {path} (lines {line_start}-{line_end})]\n```\n{content}\n```")
        }
        ChatScope::Workspace { tree_summary } => tree_summary
            .as_deref()
            .filter(|s| !s.is_empty())
            .map(|tree| format!("[Workspace tree]\n{tree}"))
            .unwrap_or_default(),
        ChatScope::Folder {
            path,
            tree_summary,
            outline_summary,
            ..
        } => {
            format!(
                "[Attached folder: {path}]\n[Folder tree]\n{tree_summary}\n\n[Folder outline]\n{outline_summary}"
            )
        }
    }
}

fn emit_chat_memory_update<E: ChatRunEventSink>(events: &mut E, memory: &str, context_limit: i64) {
    if memory.trim().is_empty() {
        return;
    }
    events.memory(ChatRunMemoryUpdate {
        session_summary: memory.to_string(),
        context_window_size: context_limit,
    });
}

async fn resolve_context_limit(
    row: &crate::storage::repositories::ConnectionRow,
    cfg: &crate::providers::HttpConfig,
) -> i64 {
    let configured = row.context_window_size;
    let fallback = if configured > 0 { configured } else { 8192 };
    if let Some(probed) = crate::providers::lmstudio::probe_context_length(&row.base_url, cfg).await
    {
        tracing::debug!("context probe: {probed} (configured {configured})");
        if configured > 0 {
            probed.min(configured)
        } else {
            probed
        }
    } else {
        fallback
    }
}

fn estimate_chat_input_tokens(
    messages: &[ChatMessage],
    base_system: Option<&str>,
    memory: &str,
    retrieved: &str,
) -> u32 {
    let msg_tokens: u32 = messages
        .iter()
        .map(crate::chat::estimate_message_tokens)
        .sum();
    let mut sys_chars = memory.chars().count() + retrieved.chars().count();
    if let Some(s) = base_system {
        sys_chars += s.chars().count();
    }
    msg_tokens + ((sys_chars + 3) / 4) as u32
}

fn effective_chat_max_tokens(mode_floor: i64, input_estimate: u32, context_limit: i64) -> u32 {
    let ctx = context_limit.max(8192);
    let input = i64::from(input_estimate);
    let margin = 192;
    let remaining = (ctx - input - margin).max(512);
    let scaled = ((f64::from(input_estimate)) * 1.25).ceil() as i64;
    let floor = mode_floor.max(512);
    floor.max(scaled).min(remaining).min(16_000).max(256) as u32
}

fn is_cancelled_err(e: &AppError) -> bool {
    matches!(e, AppError::Validation(msg) if msg == "cancelled")
}

fn source_label(messages: &[ChatMessage]) -> String {
    let last = messages.last().expect("validated non-empty messages");
    let mut label = last.content.trim().to_string();
    if label.is_empty() {
        label = format!("[{} image(s)]", last.images.len());
    } else if !last.images.is_empty() {
        label.push_str(&format!(" (+{} image(s))", last.images.len()));
    }
    label
}

async fn record_history(
    state: &AppState,
    row: &crate::storage::repositories::ConnectionRow,
    result: &CompletionResult,
    mode_name: String,
    icon_name: String,
    source_text: String,
) {
    let provider_label = format!("{} · {}", row.label, result.model);
    let cost_micros = crate::services::pricing::cost_micros(
        &result.model,
        result.usage.input_tokens as i64,
        result.usage.output_tokens as i64,
        row.price_input_per_m,
        row.price_output_per_m,
    );
    let _ = state
        .history
        .record(NewHistoryItem {
            mode_name,
            icon_name,
            provider_label,
            source_text,
            output_text: result.text.clone(),
            latency_ms: result.latency_ms as i64,
            input_tokens: result.usage.input_tokens as i64,
            output_tokens: result.usage.output_tokens as i64,
            cost_micros,
            parent_id: None,
        })
        .await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagnostic_folder_request_requires_tool_inspection_before_file_fences() {
        let scope = crate::workspace::ChatScope::Folder {
            path: "test".into(),
            tree_summary: "index.html\njs/snake.js".into(),
            outline_summary: String::new(),
            files: vec![],
            truncated: false,
        };
        let ctx = crate::workspace::ChatContextPayload {
            scope,
            modifiers: vec!["developer".into()],
            language_id: None,
        };
        let messages = vec![ChatMessage {
            role: "user".into(),
            content: "не работает, на экране всегда game over, разберись".into(),
            images: vec![],
        }];
        let mut system = Some("base".to_string());

        append_diagnostic_inspection_protocol(&mut system, &messages, Some(&ctx));
        let system = system.unwrap();

        assert!(system.contains("Diagnostic/debug request in workspace scope"));
        assert!(system.contains("First inspect the relevant files"));
        assert!(system.contains("Do not output generated file fences"));
    }

    #[test]
    fn continuation_prompt_for_generated_file_allows_closing_fence() {
        let ctx = continuation_context("```file src/app.ts\nexport const x = ");
        let prompt = continuation_prompt(&ctx);

        assert!(prompt.contains("generated file fence"));
        assert!(prompt.contains("close the markdown fence"));
        assert!(prompt.contains("next ```file"));
    }
}
