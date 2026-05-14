//! Repositories — each owns the SQL for one table.

pub mod history_repo;
pub mod settings_repo;

pub use history_repo::HistoryRepo;
pub use settings_repo::SettingsRepo;
