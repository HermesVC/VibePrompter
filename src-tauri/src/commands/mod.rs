//! Tauri command handlers — thin IPC adapters. Business logic lives in `services`.

pub mod catalog;
pub mod chat;
pub mod clipboard;
pub mod connections;
pub mod diagnostics;
pub mod history;
pub mod overlay;
pub mod settings;
pub mod shortcuts;
pub mod workspace;

pub use catalog::*;
pub use workspace::*;
pub use chat::*;
pub use clipboard::*;
pub use connections::*;
pub use diagnostics::*;
pub use history::*;
pub use overlay::*;
pub use settings::*;
pub use shortcuts::*;
