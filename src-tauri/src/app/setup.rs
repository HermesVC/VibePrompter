//! Composition root. Builds `Config` → `SqlitePool` → `EventBus` → repositories
//! → services → `AppState`, runs migrations, registers managed state, and emits
//! `app_ready`. Called from `lib.rs` inside the Tauri `setup` hook.

use tauri::{App, Manager};

use crate::app::state::AppState;
use crate::config::Config;
use crate::events::{AppEvent, EventBus};
use crate::services::{CatalogService, HistoryService, SettingsService, ShortcutService};
use crate::storage::repositories::{
    HistoryRepo, ModeRepo, ProviderRepo, SettingsRepo, ShortcutRepo,
};
use crate::storage::{create_pool, run_migrations};
use crate::utils::{AppError, AppResult};

/// Build and register all backend state. Runs on the Tauri setup hook.
pub async fn initialize(app: &App) -> AppResult<()> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Config(format!("cannot resolve app data dir: {e}")))?;
    std::fs::create_dir_all(&app_data_dir)?;

    let config = Config::from_app_data_dir(&app_data_dir)?;
    tracing::info!("app data dir: {}", config.app_data_dir.display());

    let pool = create_pool(&config.db_path).await?;
    run_migrations(&pool).await?;
    tracing::info!("database ready at {}", config.db_path.display());

    let events = EventBus::new(app.handle().clone());

    let settings = SettingsService::new(SettingsRepo::new(pool.clone()), events.clone());
    let history = HistoryService::new(HistoryRepo::new(pool.clone()));
    let shortcuts = ShortcutService::new(ShortcutRepo::new(pool.clone()), events.clone());
    let catalog = CatalogService::new(ModeRepo::new(pool.clone()), ProviderRepo::new(pool.clone()));

    app.manage(AppState { config, settings, history, shortcuts, catalog });

    events.emit(AppEvent::AppReady);
    tracing::info!("backend initialized");
    Ok(())
}
