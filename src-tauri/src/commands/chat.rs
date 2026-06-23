//! Chat window commands — toggle visibility and stream multi-turn completions.

use tauri::{AppHandle, Emitter, State};

use crate::app::AppState;
use crate::models::{ChatMessage, CompletionParams, CompletionResult, NewHistoryItem};
use crate::utils::AppError;

#[tauri::command]
pub async fn chat_toggle(app: AppHandle) -> Result<(), AppError> {
    crate::chat::toggle_chat_window(&app);
    Ok(())
}

#[tauri::command]
pub async fn chat_hide(app: AppHandle) -> Result<(), AppError> {
    crate::chat::hide_chat_window(&app);
    Ok(())
}

/// Stream a multi-turn chat completion. Emits `chat:{streamId}:token`,
/// `chat:{streamId}:done`, and `chat:{streamId}:error`. The frontend keeps
/// the full `messages` history; images ride on individual user turns via
/// `ChatMessage::images`.
#[tauri::command]
pub async fn chat_complete_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    stream_id: String,
    messages: Vec<ChatMessage>,
    mode_id: Option<String>,
    connection_id: Option<String>,
    chat_context: Option<crate::workspace::ChatContextPayload>,
    session_summary: Option<String>,
) -> Result<CompletionResult, AppError> {
    let mut chat_context = chat_context;
    if let Some(ctx) = chat_context.as_mut() {
        crate::workspace::normalize_chat_context(ctx);
    }

    if messages.is_empty() {
        return Err(AppError::Validation("messages is empty".into()));
    }
    {
        let last = messages
            .last()
            .ok_or_else(|| AppError::Validation("messages is empty".into()))?;
        if last.role != "user" {
            return Err(AppError::Validation("last message must be from the user".into()));
        }
        if last.content.trim().is_empty() && last.images.is_empty() {
            return Err(AppError::Validation("last user message is empty".into()));
        }
    }

    let mut messages = messages;
    if let Some(ctx) = chat_context.as_ref() {
        augment_messages_with_scope(&mut messages, ctx);
    }

    let (mut system_prompt, mode_name, mode_icon, temperature, max_tokens) =
        if let Some(mid) = mode_id.as_deref().filter(|s| !s.trim().is_empty()) {
            let modes = state.catalog.list_modes().await?;
            let mode = modes
                .iter()
                .find(|m| m.id == mid)
                .ok_or_else(|| AppError::NotFound {
                    entity: "prompt_mode",
                    id: mid.to_string(),
                })?
                .clone();
            (
                Some(crate::services::prompt_template::render(
                    &mode.system_prompt,
                    &mode.variables,
                )),
                mode.name.clone(),
                mode.icon_name.clone(),
                mode.temperature,
                mode.max_tokens,
            )
        } else {
            (None, "Chat".to_string(), "mail".to_string(), 0.7, 4096_i64)
        };

    if let Some(ctx) = chat_context.as_ref() {
        let base = system_prompt.unwrap_or_default();
        system_prompt = Some(state.workspace.compose_system(&base, ctx));
    }

    let resolved = connection_id.clone();
    let row = match resolved.as_deref().filter(|s| !s.is_empty()) {
        Some(id) => state.connections.get_row(id).await?,
        None => {
            if let Some(mid) = mode_id.as_deref().filter(|s| !s.trim().is_empty()) {
                let modes = state.catalog.list_modes().await?;
                let mode = modes
                    .iter()
                    .find(|m| m.id == mid)
                    .ok_or_else(|| AppError::NotFound {
                        entity: "prompt_mode",
                        id: mid.to_string(),
                    })?;
                if let Some(override_id) = mode.provider_override.as_deref().filter(|s| !s.is_empty())
                {
                    state.connections.get_row(override_id).await?
                } else {
                    state
                        .connections
                        .get_default_row()
                        .await?
                        .ok_or_else(|| {
                            AppError::Validation("no default connection configured".into())
                        })?
                }
            } else {
                state
                    .connections
                    .get_default_row()
                    .await?
                    .ok_or_else(|| AppError::Validation("no default connection configured".into()))?
            }
        }
    };

    let cfg = state.connections.http_config().await;
    let context_limit = resolve_context_limit(&row, &cfg).await;

    let mut memory = session_summary.unwrap_or_default();
    let initial_memory = memory.clone();
    let reserve_output = max_tokens.max(256) as u32;
    let mut aggression = crate::chat::WindowAggression::Normal;
    let mut memory_compressed = false;
    let mut evicted_count = 0u32;
    let mut stream_generation = 0u32;

    let token_event = format!("chat:{stream_id}:token");
    let done_event = format!("chat:{stream_id}:done");
    let err_event = format!("chat:{stream_id}:error");
    let status_event = format!("chat:{stream_id}:status");
    let memory_event = format!("chat:{stream_id}:memory");

    let registry = tauri::Manager::state::<crate::app::cancel::CancelRegistry>(&app);
    let cancel_flag = registry.register(&stream_id);
    let cancel_check = cancel_flag.clone();

    let _permit = state.connections.acquire_permit().await;

    const MAX_CONTEXT_RETRIES: usize = 2;
    let mut result: Result<CompletionResult, AppError> =
        Err(AppError::Validation("chat stream did not run".into()));
    let mut successful_attempt = 0usize;

    for attempt in 0..=MAX_CONTEXT_RETRIES {
        if cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
            result = Err(AppError::Validation("cancelled".into()));
            break;
        }

        if attempt > 0 {
            stream_generation += 1;
            aggression = aggression.next();
            let _ = app.emit(
                &status_event,
                serde_json::json!({
                    "phase": "recovering",
                    "generation": stream_generation,
                }),
            );
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

        if !window_plan.evicted.is_empty() {
            match crate::chat::compress_evicted_turns(
                &row,
                &cfg,
                &memory,
                &window_plan.evicted,
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
                        &window_plan.evicted,
                        context_limit,
                    );
                    memory_compressed = true;
                }
            }
            emit_chat_memory_update(&app, &memory_event, &memory, context_limit);
        }

        let api_messages = window_plan.active;
        let input_estimate = estimate_chat_input_tokens(
            &api_messages,
            system_prompt.as_deref(),
            &memory,
        );

        let mut request_system = system_prompt.clone();
        if let Some(sys) = request_system.as_mut() {
            crate::chat::append_memory_to_system(sys, Some(&memory), context_limit);
        } else {
            let mut sys = String::new();
            crate::chat::append_memory_to_system(&mut sys, Some(&memory), context_limit);
            request_system = Some(sys);
        }

        let params = CompletionParams {
            model: None,
            temperature: Some(temperature),
            max_tokens: Some(max_tokens as u32),
            system: request_system.filter(|s| !s.trim().is_empty()),
        };

        let app_for_tokens = app.clone();
        let tokens_for_stream = token_event.clone();
        let cancel_for_stream = cancel_check.clone();
        let gen_for_stream = stream_generation;
        let stream_out = crate::providers::complete_stream(
            &row,
            api_messages,
            params,
            &cfg,
            move |delta| {
                let _ = app_for_tokens.emit(
                    &tokens_for_stream,
                    serde_json::json!({
                        "generation": gen_for_stream,
                        "delta": delta,
                    }),
                );
            },
            move || cancel_for_stream.load(std::sync::atomic::Ordering::SeqCst),
        )
        .await;

        if cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
            result = Err(AppError::Validation("cancelled".into()));
            break;
        }

        let retry = attempt < MAX_CONTEXT_RETRIES
            && crate::chat::should_retry_for_context(
                stream_out.as_ref().map_err(|e| e),
                input_estimate,
                context_limit,
            );

        if retry {
            continue;
        }

        result = stream_out;
        successful_attempt = attempt;
        break;
    }

    let context_recovered = successful_attempt > 0 && result.is_ok();

    tauri::Manager::state::<crate::app::cancel::CancelRegistry>(&app).forget(&stream_id);
    let was_cancelled = cancel_flag.load(std::sync::atomic::Ordering::SeqCst)
        || result.as_ref().err().is_some_and(is_cancelled_err);

    let source_label = {
        let last = messages.last().expect("validated non-empty messages");
        let mut label = last.content.trim().to_string();
        if label.is_empty() {
            label = format!("[{} image(s)]", last.images.len());
        } else if !last.images.is_empty() {
            label.push_str(&format!(" (+{} image(s))", last.images.len()));
        }
        label
    };

    match result {
        Ok(mut r) => {
            state.connections.enrich_completion_context(&row, &mut r).await;
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
            if let Some(ctx) = chat_context.as_ref() {
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
                let _ = app.emit(&err_event, "cancelled");
                return Err(AppError::Validation("cancelled".into()));
            } else {
                let _ = app.emit(&done_event, &r);
                state.connections.mark_used(&row.id).await;
            }
            let provider_label = format!("{} · {}", row.label, r.model);
            let cost_micros = crate::services::pricing::cost_micros(
                &r.model,
                r.usage.input_tokens as i64,
                r.usage.output_tokens as i64,
                row.price_input_per_m,
                row.price_output_per_m,
            );
            let _ = state
                .history
                .record(NewHistoryItem {
                    mode_name,
                    icon_name: mode_icon,
                    provider_label,
                    source_text: source_label,
                    output_text: r.text.clone(),
                    latency_ms: r.latency_ms as i64,
                    input_tokens: r.usage.input_tokens as i64,
                    output_tokens: r.usage.output_tokens as i64,
                    cost_micros,
                    parent_id: None,
                })
                .await;
            Ok(r)
        }
        Err(e) => {
            if memory.trim() != initial_memory.trim() && !memory.trim().is_empty() {
                emit_chat_memory_update(&app, &memory_event, &memory, context_limit);
            }
            if is_cancelled_err(&e) {
                let _ = app.emit(&err_event, "cancelled");
            } else {
                let _ = app.emit(&err_event, e.to_string());
            }
            Err(e)
        }
    }
}

fn is_cancelled_err(e: &AppError) -> bool {
    matches!(e, AppError::Validation(msg) if msg == "cancelled")
}

/// Read files dropped onto the chat window from OS paths (Tauri drag-drop).
#[tauri::command]
pub fn read_chat_attachment_paths(paths: Vec<String>) -> Result<Vec<ChatDroppedFile>, AppError> {
    const MAX_IMAGE: usize = 4 * 1024 * 1024;
    const MAX_TEXT: usize = 512 * 1024;

    let mut out = Vec::new();
    for path in paths {
        let p = std::path::Path::new(&path);
        let name = p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file")
            .to_string();
        let ext = p
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();

        let meta = std::fs::metadata(p)
            .map_err(|e| AppError::Validation(format!("{name}: {e}")))?;
        if meta.is_dir() {
            continue;
        }

        let bytes = std::fs::read(p).map_err(|e| AppError::Validation(format!("{name}: {e}")))?;

        if is_image_ext(&ext) {
            if bytes.len() > MAX_IMAGE {
                return Err(AppError::Validation(format!(
                    "{name}: images must be under 4 MB"
                )));
            }
            out.push(ChatDroppedFile {
                name,
                mime_type: image_mime(&ext),
                data_base64: Some(base64::Engine::encode(
                    &base64::engine::general_purpose::STANDARD,
                    &bytes,
                )),
                text: None,
            });
        } else if is_text_ext(&ext) {
            if bytes.len() > MAX_TEXT {
                return Err(AppError::Validation(format!(
                    "{name}: text files must be under 512 KB"
                )));
            }
            let text = String::from_utf8(bytes)
                .map_err(|_| AppError::Validation(format!("{name}: not valid UTF-8 text")))?;
            out.push(ChatDroppedFile {
                name,
                mime_type: "text/plain".into(),
                data_base64: None,
                text: Some(text),
            });
        } else {
            return Err(AppError::Validation(format!(
                "Unsupported file: {name} (images or text files only)"
            )));
        }
    }
    Ok(out)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatDroppedFile {
    pub name: String,
    pub mime_type: String,
    pub data_base64: Option<String>,
    pub text: Option<String>,
}

fn is_image_ext(ext: &str) -> bool {
    matches!(ext, "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "ico")
}

fn is_text_ext(ext: &str) -> bool {
    matches!(
        ext,
        "txt" | "md"
            | "markdown"
            | "json"
            | "csv"
            | "xml"
            | "yaml"
            | "yml"
            | "log"
            | "ts"
            | "tsx"
            | "js"
            | "jsx"
            | "py"
            | "php"
            | "phtml"
            | "inc"
            | "rs"
            | "html"
            | "css"
            | "toml"
            | "ini"
            | "env"
    )
}

fn image_mime(ext: &str) -> String {
    match ext {
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "jpg" | "jpeg" => "image/jpeg",
        _ => "image/png",
    }
    .into()
}

fn augment_messages_with_scope(messages: &mut Vec<ChatMessage>, ctx: &crate::workspace::ChatContextPayload) {
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
        } => format!(
            "[Attached file: {path} (lines {line_start}-{line_end})]\n```\n{content}\n```"
        ),
        ChatScope::Workspace { tree_summary } => tree_summary
            .as_deref()
            .filter(|s| !s.is_empty())
            .map(|tree| format!("[Workspace tree]\n{tree}"))
            .unwrap_or_default(),
    }
}

fn emit_chat_memory_update(
    app: &AppHandle,
    memory_event: &str,
    memory: &str,
    context_limit: i64,
) {
    if memory.trim().is_empty() {
        return;
    }
    let _ = app.emit(
        memory_event,
        serde_json::json!({
            "sessionSummary": memory,
            "contextWindowSize": context_limit,
        }),
    );
}

async fn resolve_context_limit(
    row: &crate::storage::repositories::ConnectionRow,
    cfg: &crate::providers::HttpConfig,
) -> i64 {
    let configured = row.context_window_size;
    let fallback = if configured > 0 { configured } else { 8192 };
    if let Some(probed) =
        crate::providers::lmstudio::probe_context_length(&row.base_url, cfg).await
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
) -> u32 {
    let msg_tokens: u32 = messages
        .iter()
        .map(crate::chat::estimate_message_tokens)
        .sum();
    let mut sys_chars = memory.chars().count();
    if let Some(s) = base_system {
        sys_chars += s.chars().count();
    }
    msg_tokens + ((sys_chars + 3) / 4) as u32
}
