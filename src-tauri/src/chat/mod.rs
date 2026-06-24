//! Persistent chat window — free-form multi-turn LLM conversation.
//!
//! Unlike `refine-overlay`, this window is meant to stay open: no selection
//! capture, no blur-to-dismiss, no clipboard handoff. The frontend owns the
//! message history; the backend only streams completions.

mod agent_tools;
mod context_recovery;
mod memory_compress;
mod session_summary;
mod sliding_window;
mod vector_memory;

pub use agent_tools::{
    augment_system_for_tools, run_tool_followup_loop, scope_enables_tools, scope_path_for_tools,
    ToolLoopMemoryHook,
};
pub use context_recovery::should_retry_for_context;
pub use memory_compress::{
    compress_session_memory, fallback_compress_session_memory, session_memory_needs_compression,
};
pub use session_summary::append_memory_to_system;
pub use sliding_window::{
    compress_evicted_turns, estimate_message_tokens, fallback_merge_memory,
    plan_sliding_window_with_aggression, WindowAggression,
};
pub use vector_memory::{
    append_retrieved_to_system, format_retrieved_for_system, index_context_artifacts,
    index_evicted_messages, index_folder_outline, index_plan_step_summary, index_tool_results,
    retrieve_relevant,
};

use tauri::{AppHandle, Emitter, Manager};

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

pub fn hide_chat_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("chat-window") {
        let _ = win.hide();
    }
}
