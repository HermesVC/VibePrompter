//! Service layer — business logic, orchestrating repositories and the event bus.

pub mod analytics_service;
pub mod catalog_service;
pub mod chat_memory_service;
pub mod connection_service;
pub mod history_service;
pub mod prompt_service;
pub mod pricing;
pub mod prompt_template;
pub mod settings_service;
pub mod shortcut_service;
pub mod workspace_service;

pub use analytics_service::AnalyticsService;
pub use catalog_service::CatalogService;
pub use chat_memory_service::ChatMemoryService;
pub use connection_service::ConnectionService;
pub use history_service::HistoryService;
pub use prompt_service::PromptService;
pub use settings_service::SettingsService;
pub use shortcut_service::ShortcutService;
pub use workspace_service::WorkspaceService;
