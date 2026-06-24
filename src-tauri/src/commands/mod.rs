//! Tauri command handlers — thin IPC adapters. Business logic lives in `services`.

pub mod agent_tools;
pub mod autonomous;
pub mod catalog;
pub mod chat;
pub mod clipboard;
pub mod connections;
pub mod diagnostics;
pub mod history;
pub mod overlay;
pub mod prompt_format;
pub mod settings;
pub mod shortcuts;
pub mod workspace;

pub use agent_tools::*;
pub use autonomous::*;
pub use catalog::*;
pub use chat::*;
pub use clipboard::*;
pub use connections::*;
pub use diagnostics::*;
pub use history::*;
pub use overlay::*;
pub use prompt_format::*;
pub use settings::*;
pub use shortcuts::*;
pub use workspace::*;
