//! Headless AppState bootstrap for debug binaries (memory probe, etc.).

use std::path::PathBuf;
use std::sync::Arc;

use crate::app::AppState;
use crate::config::Config;
use crate::events::EventBus;
use crate::services::{
    AnalyticsService, CatalogService, ChatMemoryService, ConnectionService, HistoryService,
    PromptService, SettingsService, ShortcutService, WorkspaceService,
};
use crate::storage::repositories::{
    AnalyticsRepo, ConnectionRepo, HistoryRepo, MemoryRepo, ModeRepo, ProviderRepo, SettingsRepo,
    ShortcutRepo,
};
use crate::storage::{create_pool, run_migrations};
use crate::utils::AppResult;

/// Resolve the same app data directory the desktop app uses.
pub fn default_app_data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("VIBEPROMPTER_APP_DATA") {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir);
        }
    }
    #[cfg(windows)]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            return PathBuf::from(appdata).join("com.vibeprompter.app");
        }
    }
    PathBuf::from(".vibeprompter-data")
}

/// Build `AppState` without starting the desktop shell (uses the real SQLite DB).
pub async fn build_probe_state() -> AppResult<AppState> {
    let app_data_dir = default_app_data_dir();
    std::fs::create_dir_all(&app_data_dir)?;
    let config = Config::from_app_data_dir(&app_data_dir)?;
    let pool = create_pool(&config.db_path).await?;
    run_migrations(&pool).await?;

    let events = EventBus::noop();
    let settings = SettingsService::new(SettingsRepo::new(pool.clone()), events.clone());
    let history = HistoryService::with_events(HistoryRepo::new(pool.clone()), events.clone());
    let shortcuts = ShortcutService::new(ShortcutRepo::new(pool.clone()), events.clone());
    let catalog = CatalogService::new(ModeRepo::new(pool.clone()), ProviderRepo::new(pool.clone()));
    let secrets: Arc<dyn crate::security::SecretStore> = crate::security::init().into();
    let connections = ConnectionService::new(
        ConnectionRepo::new(pool.clone()),
        secrets,
        settings.clone(),
        4,
    );
    let analytics = AnalyticsService::new(AnalyticsRepo::new(pool.clone()));
    let chat_memory = ChatMemoryService::new(MemoryRepo::new(pool.clone()));
    let workspace = WorkspaceService::new(SettingsRepo::new(pool.clone()));
    let prompts = PromptService::new(catalog.clone(), connections.clone(), history.clone())
        .with_analytics(analytics.clone());

    Ok(AppState {
        config,
        settings,
        history,
        shortcuts,
        catalog,
        connections,
        analytics,
        chat_memory,
        workspace,
        prompts,
        keyring_available: crate::security::KeyringStore::new().is_available(),
    })
}
