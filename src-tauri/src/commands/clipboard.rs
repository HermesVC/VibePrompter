//! Clipboard read/write for the chat window (snippet apply, attach from clipboard).

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
