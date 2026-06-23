//! Chat window commands — toggle visibility and stream multi-turn completions.

use tauri::{AppHandle, Emitter, State};

use crate::app::AppState;
use crate::models::{ChatMessage, CompletionParams, NewHistoryItem};
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
) -> Result<(), AppError> {
    if messages.is_empty() {
        return Err(AppError::Validation("messages is empty".into()));
    }
    let last = messages
        .last()
        .ok_or_else(|| AppError::Validation("messages is empty".into()))?;
    if last.role != "user" {
        return Err(AppError::Validation("last message must be from the user".into()));
    }
    if last.content.trim().is_empty() && last.images.is_empty() {
        return Err(AppError::Validation("last user message is empty".into()));
    }

    let (system_prompt, mode_name, mode_icon, temperature, max_tokens) =
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

    let params = CompletionParams {
        model: None,
        temperature: Some(temperature),
        max_tokens: Some(max_tokens as u32),
        system: system_prompt.filter(|s| !s.trim().is_empty()),
    };

    let token_event = format!("chat:{stream_id}:token");
    let done_event = format!("chat:{stream_id}:done");
    let err_event = format!("chat:{stream_id}:error");

    let registry = tauri::Manager::state::<crate::app::cancel::CancelRegistry>(&app);
    let cancel_flag = registry.register(&stream_id);
    let cancel_check = cancel_flag.clone();

    let cfg = state.connections.http_config().await;
    let _permit = state.connections.acquire_permit().await;
    let app_for_tokens = app.clone();
    let result = crate::providers::complete_stream(
        &row,
        messages.clone(),
        params,
        &cfg,
        move |delta| {
            let _ = app_for_tokens.emit(&token_event, delta);
        },
        move || cancel_check.load(std::sync::atomic::Ordering::SeqCst),
    )
    .await;
    tauri::Manager::state::<crate::app::cancel::CancelRegistry>(&app).forget(&stream_id);
    let was_cancelled = cancel_flag.load(std::sync::atomic::Ordering::SeqCst);

    let source_label = {
        let mut label = last.content.trim().to_string();
        if label.is_empty() {
            label = format!("[{} image(s)]", last.images.len());
        } else if !last.images.is_empty() {
            label.push_str(&format!(" (+{} image(s))", last.images.len()));
        }
        label
    };

    match result {
        Ok(r) => {
            if was_cancelled {
                let _ = app.emit(&err_event, "cancelled");
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
            Ok(())
        }
        Err(e) => {
            let _ = app.emit(&err_event, e.to_string());
            Err(e)
        }
    }
}
