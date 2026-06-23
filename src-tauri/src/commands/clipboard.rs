//! Clipboard read/write and editor selection capture for the chat window.

use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::utils::AppError;

#[tauri::command]
pub fn write_clipboard_text(app: AppHandle, text: String) -> Result<(), AppError> {
    app.clipboard()
        .write_text(text)
        .map_err(|e| AppError::Clipboard(e.to_string()))
}

#[tauri::command]
pub fn read_clipboard_text(app: AppHandle) -> Result<String, AppError> {
    app.clipboard()
        .read_text()
        .map_err(|e| AppError::Clipboard(e.to_string()))
}

/// Capture highlighted text from the focused editor (same path as Refine).
#[tauri::command]
pub async fn capture_editor_selection(app: AppHandle) -> Result<String, AppError> {
    let app2 = app.clone();
    tokio::task::spawn_blocking(move || crate::overlay::capture_editor_selection(&app2))
        .await
        .map_err(|e| AppError::Config(format!("capture task: {e}")))?
}
