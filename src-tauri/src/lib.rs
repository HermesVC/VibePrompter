//! VibePrompter backend library crate.

mod app;
mod commands;
mod config;
mod events;
mod models;
mod services;
mod storage;
mod utils;

// Stub modules — populated by later sub-projects.
mod clipboard;
mod overlay;
mod prompts;
mod providers;
mod security;
mod shortcuts;
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
