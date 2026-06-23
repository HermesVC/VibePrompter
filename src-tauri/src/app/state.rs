//! `AppState` — the single container registered with Tauri's managed state.
//! Holds the process config plus the four wired services. Cheap to clone
//! (every field is `Clone` and internally `Arc`-backed or a pool handle).

use crate::config::Config;
use crate::services::{
    AnalyticsService, CatalogService, ChatMemoryService, ConnectionService, HistoryService,
    PromptService, SettingsService, ShortcutService, WorkspaceService,
};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub settings: SettingsService,
    pub history: HistoryService,
    pub shortcuts: ShortcutService,
    pub catalog: CatalogService,
    pub connections: ConnectionService,
    pub prompts: PromptService,
    pub analytics: AnalyticsService,
    pub workspace: WorkspaceService,
    pub chat_memory: ChatMemoryService,
    /// Captured once at startup — avoids re-probing Credential Manager on
    /// every health check, which is slow and produces spurious failures.
    pub keyring_available: bool,
}
