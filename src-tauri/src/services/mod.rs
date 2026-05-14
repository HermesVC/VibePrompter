//! Service layer — business logic, orchestrating repositories and the event bus.

pub mod history_service;
pub mod settings_service;
pub mod shortcut_service;

pub use history_service::HistoryService;
pub use settings_service::SettingsService;
pub use shortcut_service::ShortcutService;
