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
) -> Result<CompletionResult, AppError> {
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
            Ok(r)
        }
        Err(e) => {
            let _ = app.emit(&err_event, e.to_string());
            Err(e)
        }
    }
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
