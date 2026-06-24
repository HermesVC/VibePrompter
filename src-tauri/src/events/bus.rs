//! `EventBus` — a thin typed wrapper over Tauri's `AppHandle` emit. Every
//! backend event goes through here so the contract has one chokepoint.

use tauri::{AppHandle, Emitter};

use super::types::AppEvent;

#[derive(Clone)]
pub struct EventBus {
    app_handle: Option<AppHandle>,
}

impl EventBus {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle: Some(app_handle),
        }
    }

    /// Headless runners (memory probe CLI) — emit is a no-op.
    pub fn noop() -> Self {
        Self { app_handle: None }
    }

    /// Emit an event to all frontend listeners. Emit failures are logged, not
    /// propagated — a missing listener must never break a backend operation.
    pub fn emit(&self, event: AppEvent) {
        let Some(app_handle) = self.app_handle.as_ref() else {
            tracing::debug!("noop event bus skipped emit {}", event.name());
            return;
        };
        let name = event.name();
        if let Err(err) = app_handle.emit(name, event.payload()) {
            tracing::warn!("failed to emit event {name}: {err}");
        } else {
            tracing::debug!("emitted event {name}");
        }
    }
}
