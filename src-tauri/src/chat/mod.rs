//! Persistent chat window — free-form multi-turn LLM conversation.
//!
//! Unlike `refine-overlay`, this window is meant to stay open: no selection
//! capture, no blur-to-dismiss, no clipboard handoff. The frontend owns the
//! message history; the backend only streams completions.

use tauri::{AppHandle, Emitter, Manager};

use crate::utils::AppResult;

pub fn toggle_chat_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("chat-window") {
        let visible = win.is_visible().unwrap_or(false);
        let focused = win.is_focused().unwrap_or(false);
        if visible && focused {
            let _ = win.hide();
            return;
        }
        let _ = win.show();
        let _ = win.set_always_on_top(true);
        let _ = win.set_focus();
        let _ = app.emit("chat:opened", ());
    }
}

pub fn show_chat_window(app: &AppHandle) -> AppResult<()> {
    let win = app
        .get_webview_window("chat-window")
        .ok_or_else(|| crate::utils::AppError::Config("chat-window not configured".into()))?;
    win.show()
        .map_err(|e| crate::utils::AppError::Config(format!("show chat-window: {e}")))?;
    let _ = win.set_always_on_top(true);
    let _ = win.set_focus();
    let _ = app.emit("chat:opened", ());
    Ok(())
}

pub fn hide_chat_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("chat-window") {
        let _ = win.hide();
    }
}
