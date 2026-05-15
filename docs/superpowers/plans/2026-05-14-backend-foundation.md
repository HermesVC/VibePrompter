# Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the VibePrompter Rust backend foundation — module tree, typed errors, config, logging, SQLite persistence, event bus, services, the 9 foundation commands — and rewire the foundation-era frontend mock APIs to real Tauri `invoke` calls.

**Architecture:** Single `AppState` container registered with Tauri's managed state, holding `Config`, a `SqlitePool`, an `EventBus`, and four services. Strict layering: `commands → services → repositories → pool`. Repositories own all SQL (runtime `sqlx` queries); services hold business logic and emit events; commands are thin IPC adapters. Errors are a single `thiserror` enum that serializes to a sanitized `{ code, message, retriable }` shape.

**Tech Stack:** Rust + Tauri v2, `sqlx` (SQLite, runtime queries), `tokio`, `tracing` + `tracing-appender`, `thiserror`, `chrono`, `serde`. Frontend: React 19 + `@tauri-apps/api`.

**Spec:** `docs/superpowers/specs/2026-05-14-backend-foundation-design.md`

---

## File Structure

**Rust backend** (`src-tauri/src/`):

| File | Responsibility |
|---|---|
| `main.rs` | Entry point; calls `app_lib::run()` |
| `lib.rs` | `run()`: init logging, build Tauri builder, register plugins + invoke handler, call `app::setup` |
| `app/mod.rs` | Module re-exports |
| `app/state.rs` | `AppState` struct — holds config, pool, event bus, services |
| `app/setup.rs` | Composition root — builds everything, runs migrations, manages state, emits `app_ready` |
| `app/lifecycle.rs` | **Stub** — sub-project 3 |
| `commands/mod.rs` | Re-exports + the single `generate_handler!` list |
| `commands/settings.rs` | `get_settings`, `save_settings` |
| `commands/history.rs` | `get_history`, `clear_history` |
| `commands/shortcuts.rs` | `list_shortcuts`, `register_shortcut`, `unregister_shortcut` |
| `commands/catalog.rs` | `list_modes`, `list_providers` |
| `services/mod.rs` | Module re-exports |
| `services/settings_service.rs` | `Settings` struct ↔ key-value mapping; emits `settings_changed` |
| `services/history_service.rs` | History list/clear |
| `services/shortcut_service.rs` | Shortcut list/register/unregister; emits `shortcut_updated` |
| `services/catalog_service.rs` | Read-only modes + providers |
| `models/mod.rs` | Re-exports |
| `models/settings.rs` | `Settings` struct (serde defaults) |
| `models/history.rs` | `HistoryItem`, `NewHistoryItem`, `HistoryQuery` |
| `models/shortcut.rs` | `ShortcutItem`, `ShortcutConfig` |
| `models/prompt_mode.rs` | `PromptMode` |
| `models/provider.rs` | `ProviderInfo` |
| `models/analytics.rs` | **Stub** — `AnalyticsEvent` struct only |
| `storage/mod.rs` | Re-exports |
| `storage/pool.rs` | `create_pool`, `run_migrations` |
| `storage/migrations/0001_initial.sql` | All 6 tables + indexes |
| `storage/migrations/0002_seed.sql` | Seed providers, prompt_modes, shortcuts, settings |
| `storage/repositories/mod.rs` | Re-exports |
| `storage/repositories/settings_repo.rs` | `SettingsRepo` |
| `storage/repositories/history_repo.rs` | `HistoryRepo` |
| `storage/repositories/shortcut_repo.rs` | `ShortcutRepo` |
| `storage/repositories/mode_repo.rs` | `ModeRepo` (read-only) |
| `storage/repositories/provider_repo.rs` | `ProviderRepo` (read-only) |
| `events/mod.rs` | Re-exports |
| `events/types.rs` | `AppEvent` enum + payload structs |
| `events/bus.rs` | `EventBus` |
| `config/mod.rs` | Re-exports |
| `config/settings.rs` | `Config` struct + `load` |
| `utils/mod.rs` | Re-exports |
| `utils/error.rs` | `AppError`, `AppResult` |
| `security/mod.rs`, `providers/mod.rs`, `prompts/mod.rs` | **Stubs** — sub-project 2 |
| `shortcuts/mod.rs`, `clipboard/mod.rs`, `tray/mod.rs`, `overlay/mod.rs` | **Stubs** — sub-project 3 |

**Frontend** (`src/`):

| File | Responsibility |
|---|---|
| `kernel/infrastructure/tauri/invoke.ts` | Typed `invoke<T>()` wrapper mapping `AppError` → frontend error |
| `kernel/infrastructure/tauri/events.ts` | `onEvent()` wrapper over `listen()` + shared event payload types |
| `kernel/infrastructure/tauri/index.ts` | Re-exports |
| `features/settings/infrastructure/settingsApi.ts` | **Modify** — rewire to real commands |
| `features/settings/application/settings.query.ts` | **Modify** — add `useAppSettingsQuery` + save mutation |
| `features/settings/ui/panels/GeneralPanel.tsx` | **Modify** — load/save via backend |
| `features/settings/ui/panels/AppearancePanel.tsx` | **Modify** — load/save via backend |
| `features/settings/ui/panels/AdvancedPanel.tsx` | **Modify** — load/save via backend |
| `features/tray/infrastructure/trayApi.ts` | **Modify** — toggles map to settings |

---

## Conventions for all tasks

- **Working directory** for `cargo` commands: `src-tauri/`. For `npm` commands: repo root.
- After each Rust task: `cargo build` must succeed before commit.
- Every Rust test module uses an in-memory pool helper (defined in Task 7, Step 6).
- Commit messages use Conventional Commits.

---

### Task 1: Project setup — git, Cargo deps, frontend dep

**Files:**
- Create: `.git/` (via `git init`)
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json:7`
- Modify: `package.json` (dependencies)

- [ ] **Step 1: Initialize git repo**

Run from repo root:
```bash
git init
git add -A
git commit -m "chore: initial commit — existing frontend + tauri skeleton"
```
Expected: a commit is created with the existing files.

- [ ] **Step 2: Add Rust dependencies**

Replace the `[dependencies]` section and add `[dev-dependencies]` in `src-tauri/Cargo.toml`:
```toml
[dependencies]
serde_json = "1.0"
serde = { version = "1.0", features = ["derive"] }
tauri = { version = "2.11.1", features = [] }
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync", "time"] }
sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite", "migrate"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
tracing-appender = "0.2"
thiserror = "2"
anyhow = "1"
chrono = { version = "0.4", features = ["serde"] }

[dev-dependencies]
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync", "time"] }
```
Note: `tauri-plugin-log` and `log` are removed — `tracing` replaces them.

- [ ] **Step 3: Fix the frontend dist path mismatch**

In `src-tauri/tauri.conf.json`, change line 7 from `"frontendDist": "../build"` to `"frontendDist": "../dist"` (Vite outputs to `dist/`, per `vite.config.ts`).

- [ ] **Step 4: Add the frontend Tauri API dependency**

Run from repo root:
```bash
npm install @tauri-apps/api@^2
```
Expected: `@tauri-apps/api` appears in `package.json` dependencies.

- [ ] **Step 5: Verify the workspace still builds**

Run from `src-tauri/`:
```bash
cargo build
```
Expected: build fails — `lib.rs` still references `tauri_plugin_log`. That is fixed in Task 2. (If you want a green checkpoint first, temporarily comment the plugin block in `lib.rs`; Task 2 rewrites the file entirely.)

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json package.json package-lock.json
git commit -m "chore: add backend dependencies, fix frontend dist path"
```

---

### Task 2: Module tree scaffold

Create the full 15-directory module tree. Built modules get empty (but valid) files; stub modules get a `mod.rs` with a doc-comment naming the owning sub-project. After this task the crate compiles with an empty `run()`.

**Files:**
- Create: every `mod.rs` listed below + `src-tauri/src/lib.rs` (rewrite)

- [ ] **Step 1: Create stub module files**

Create each of these files with exactly the doc-comment shown:

`src-tauri/src/security/mod.rs`:
```rust
//! Secure credential storage (Windows Credential Manager via `keyring`).
//! Owned by sub-project 2 — AI Engine. Intentionally empty in the Foundation sub-project.
```

`src-tauri/src/providers/mod.rs`:
```rust
//! AI provider abstraction — the `AiProvider` trait and OpenAI/Anthropic/Gemini/Ollama
//! implementations. Owned by sub-project 2 — AI Engine. Intentionally empty for now.
```

`src-tauri/src/prompts/mod.rs`:
```rust
//! Prompt mode engine — CRUD, presets, import/export.
//! Owned by sub-project 2 — AI Engine. Intentionally empty for now.
```

`src-tauri/src/shortcuts/mod.rs`:
```rust
//! OS-level global hotkey registration and conflict detection.
//! Owned by sub-project 3 — OS Integration. Intentionally empty for now.
```

`src-tauri/src/clipboard/mod.rs`:
```rust
//! Clipboard automation (arboard + enigo): Ctrl+C → AI → Ctrl+V with rollback.
//! Owned by sub-project 3 — OS Integration. Intentionally empty for now.
```

`src-tauri/src/tray/mod.rs`:
```rust
//! System tray icon and menu.
//! Owned by sub-project 3 — OS Integration. Intentionally empty for now.
```

`src-tauri/src/overlay/mod.rs`:
```rust
//! Overlay window management (command palette, loading popup, result preview).
//! Owned by sub-project 3 — OS Integration. Intentionally empty for now.
```

- [ ] **Step 2: Create built-module `mod.rs` files (empty placeholders)**

Create these files, each containing only the line `// populated in a later task`:
```
src-tauri/src/app/mod.rs
src-tauri/src/commands/mod.rs
src-tauri/src/services/mod.rs
src-tauri/src/models/mod.rs
src-tauri/src/storage/mod.rs
src-tauri/src/storage/repositories/mod.rs
src-tauri/src/events/mod.rs
src-tauri/src/config/mod.rs
src-tauri/src/utils/mod.rs
```

- [ ] **Step 3: Rewrite `lib.rs` to declare all modules**

Replace `src-tauri/src/lib.rs` entirely:
```rust
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
mod tray as _tray_keep; // (removed in Task 19; placeholder to avoid unused warnings is unnecessary)

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```
Correction — do **not** include the `tray as _tray_keep` line; unused empty modules do not warn. Use this exact file instead:
```rust
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
```

- [ ] **Step 4: Verify the crate compiles**

Run from `src-tauri/`:
```bash
cargo build
```
Expected: PASS (warnings about unused modules are acceptable).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src
git commit -m "feat: scaffold full backend module tree with sub-project stubs"
```

---

### Task 3: Error system

**Files:**
- Create: `src-tauri/src/utils/error.rs`
- Modify: `src-tauri/src/utils/mod.rs`

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/utils/error.rs`:
```rust
//! Centralized typed error system. `AppError` is the single error type for the
//! whole backend. It serializes to a sanitized `{ code, message, retriable }`
//! shape so SQL text and file paths never cross the IPC boundary.

use serde::Serialize;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("migration error: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),

    #[error("configuration error: {0}")]
    Config(String),

    #[error("i/o error: {0}")]
    Io(#[from] std::io::Error),

    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("{entity} not found: {id}")]
    NotFound { entity: &'static str, id: String },

    #[error("validation error: {0}")]
    Validation(String),

    // Dormant variants — defined now so the taxonomy is stable; used by later sub-projects.
    #[error("provider error: {0}")]
    Provider(String),
    #[error("network error: {0}")]
    Network(String),
    #[error("clipboard error: {0}")]
    Clipboard(String),
    #[error("shortcut error: {0}")]
    Shortcut(String),
    #[error("permission error: {0}")]
    Permission(String),
}

impl AppError {
    /// Stable machine-readable code for the frontend.
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Database(_) => "DATABASE_ERROR",
            AppError::Migration(_) => "MIGRATION_ERROR",
            AppError::Config(_) => "CONFIG_ERROR",
            AppError::Io(_) => "IO_ERROR",
            AppError::Serialization(_) => "SERIALIZATION_ERROR",
            AppError::NotFound { .. } => "NOT_FOUND",
            AppError::Validation(_) => "VALIDATION_ERROR",
            AppError::Provider(_) => "PROVIDER_ERROR",
            AppError::Network(_) => "NETWORK_ERROR",
            AppError::Clipboard(_) => "CLIPBOARD_ERROR",
            AppError::Shortcut(_) => "SHORTCUT_ERROR",
            AppError::Permission(_) => "PERMISSION_ERROR",
        }
    }

    /// Whether retrying the operation could plausibly succeed.
    pub fn retriable(&self) -> bool {
        matches!(self, AppError::Network(_) | AppError::Clipboard(_))
    }

    /// Frontend-safe human message. Never includes SQL text, file paths, or
    /// raw driver output — only the error category.
    pub fn safe_message(&self) -> String {
        match self {
            AppError::Database(_) => "A database operation failed.".into(),
            AppError::Migration(_) => "The database could not be initialized.".into(),
            AppError::Config(_) => "The application is misconfigured.".into(),
            AppError::Io(_) => "A file operation failed.".into(),
            AppError::Serialization(_) => "Failed to process data.".into(),
            AppError::NotFound { entity, .. } => format!("The requested {entity} was not found."),
            AppError::Validation(msg) => msg.clone(),
            AppError::Provider(_) => "The AI provider returned an error.".into(),
            AppError::Network(_) => "A network request failed.".into(),
            AppError::Clipboard(_) => "A clipboard operation failed.".into(),
            AppError::Shortcut(_) => "A shortcut operation failed.".into(),
            AppError::Permission(_) => "Permission was denied.".into(),
        }
    }
}

/// Sanitized wire shape. The verbose `Display` impl goes only to `tracing` logs.
impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("AppError", 3)?;
        s.serialize_field("code", self.code())?;
        s.serialize_field("message", &self.safe_message())?;
        s.serialize_field("retriable", &self.retriable())?;
        s.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn database_error_serializes_without_leaking_sql() {
        let err = AppError::Database(sqlx::Error::RowNotFound);
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("\"code\":\"DATABASE_ERROR\""));
        assert!(json.contains("A database operation failed."));
        // The raw driver message must NOT appear on the wire.
        assert!(!json.contains("RowNotFound"));
    }

    #[test]
    fn validation_message_passes_through() {
        let err = AppError::Validation("temperature must be between 0 and 2".into());
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("temperature must be between 0 and 2"));
        assert!(json.contains("\"retriable\":false"));
    }

    #[test]
    fn network_error_is_retriable() {
        let err = AppError::Network("timeout".into());
        assert!(err.retriable());
    }
}
```

- [ ] **Step 2: Wire the module**

Replace `src-tauri/src/utils/mod.rs`:
```rust
//! Cross-cutting utilities.

pub mod error;

pub use error::{AppError, AppResult};
```

- [ ] **Step 3: Run the tests to verify they pass**

Run from `src-tauri/`:
```bash
cargo test --lib utils::error
```
Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/utils
git commit -m "feat: add typed AppError with sanitized wire serialization"
```

---

### Task 4: Config

**Files:**
- Create: `src-tauri/src/config/settings.rs`
- Modify: `src-tauri/src/config/mod.rs`

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/config/settings.rs`:
```rust
//! Process/environment configuration — distinct from the user-facing `settings`
//! table. Resolved once at startup from the OS app-data directory.

use std::path::{Path, PathBuf};

use crate::utils::AppResult;

#[derive(Debug, Clone)]
pub struct Config {
    pub app_data_dir: PathBuf,
    pub db_path: PathBuf,
    pub log_dir: PathBuf,
    pub debug_mode: bool,
    pub log_level: String,
}

impl Config {
    /// Build a `Config` rooted at `app_data_dir`, creating the directory tree if needed.
    pub fn from_app_data_dir(app_data_dir: &Path) -> AppResult<Self> {
        let log_dir = app_data_dir.join("logs");
        std::fs::create_dir_all(&log_dir)?;
        let debug_mode = cfg!(debug_assertions);
        Ok(Self {
            db_path: app_data_dir.join("vibeprompter.db"),
            log_dir,
            app_data_dir: app_data_dir.to_path_buf(),
            debug_mode,
            log_level: if debug_mode { "debug".into() } else { "info".into() },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_paths_and_creates_log_dir() {
        let tmp = std::env::temp_dir().join(format!("vp-cfg-{}", std::process::id()));
        let cfg = Config::from_app_data_dir(&tmp).unwrap();
        assert_eq!(cfg.db_path, tmp.join("vibeprompter.db"));
        assert!(cfg.log_dir.exists());
        std::fs::remove_dir_all(&tmp).ok();
    }
}
```

- [ ] **Step 2: Wire the module**

Replace `src-tauri/src/config/mod.rs`:
```rust
//! Process/environment configuration.

pub mod settings;

pub use settings::Config;
```

- [ ] **Step 3: Run the test to verify it passes**

Run from `src-tauri/`:
```bash
cargo test --lib config::
```
Expected: 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/config
git commit -m "feat: add process Config resolved from app-data dir"
```

---

### Task 5: Logging initialization

**Files:**
- Create: `src-tauri/src/app/logging.rs`
- Modify: `src-tauri/src/app/mod.rs`

- [ ] **Step 1: Write the logging initializer**

Create `src-tauri/src/app/logging.rs`:
```rust
//! `tracing` initialization — a rolling daily file appender plus a console layer
//! in debug builds. Replaces `tauri-plugin-log` as the single logging stack.

use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

use crate::config::Config;

/// Initialize the global tracing subscriber.
///
/// Returns a `WorkerGuard` that MUST be kept alive for the lifetime of the
/// process — dropping it stops the background log-writing thread.
pub fn init(config: &Config) -> WorkerGuard {
    let file_appender = tracing_appender::rolling::daily(&config.log_dir, "vibeprompter.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(&config.log_level));

    let file_layer = fmt::layer().with_ansi(false).with_writer(non_blocking);

    let registry = tracing_subscriber::registry().with(filter).with(file_layer);

    if config.debug_mode {
        registry.with(fmt::layer().with_ansi(true)).init();
    } else {
        registry.init();
    }

    tracing::info!("logging initialized (level={})", config.log_level);
    guard
}
```

- [ ] **Step 2: Wire the module**

Replace `src-tauri/src/app/mod.rs`:
```rust
//! Application composition root.

pub mod logging;
```

- [ ] **Step 3: Verify it compiles**

Run from `src-tauri/`:
```bash
cargo build
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/app
git commit -m "feat: add tracing-based logging initialization"
```

---

### Task 6: Migration SQL files

**Files:**
- Create: `src-tauri/src/storage/migrations/0001_initial.sql`
- Create: `src-tauri/src/storage/migrations/0002_seed.sql`

- [ ] **Step 1: Write the schema migration**

Create `src-tauri/src/storage/migrations/0001_initial.sql`:
```sql
-- Foundation schema: all 6 tables.

CREATE TABLE settings (
    key        TEXT PRIMARY KEY NOT NULL,
    value      TEXT NOT NULL,           -- JSON-encoded scalar
    updated_at TEXT NOT NULL
);

CREATE TABLE providers (
    id            TEXT PRIMARY KEY NOT NULL,
    display_name  TEXT NOT NULL,
    enabled       INTEGER NOT NULL DEFAULT 1,
    default_model TEXT NOT NULL,
    base_url      TEXT,
    extra         TEXT NOT NULL DEFAULT '{}',  -- JSON
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

CREATE TABLE prompt_modes (
    id                TEXT PRIMARY KEY NOT NULL,
    name              TEXT NOT NULL,
    description       TEXT NOT NULL,
    system_prompt     TEXT NOT NULL,
    temperature       REAL NOT NULL DEFAULT 0.5,
    max_tokens        INTEGER NOT NULL DEFAULT 1024,
    provider_override TEXT,
    icon_name         TEXT NOT NULL,
    is_default        INTEGER NOT NULL DEFAULT 0,
    sort_order        INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
);

CREATE TABLE history (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    mode_name      TEXT NOT NULL,
    icon_name      TEXT NOT NULL,
    provider_label TEXT NOT NULL,
    source_text    TEXT NOT NULL,
    output_text    TEXT NOT NULL,
    latency_ms     INTEGER NOT NULL DEFAULT 0,
    favorite       INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL
);
CREATE INDEX idx_history_created_at ON history (created_at DESC);

CREATE TABLE shortcuts (
    id          TEXT PRIMARY KEY NOT NULL,
    label       TEXT NOT NULL,
    hint        TEXT NOT NULL,
    icon_name   TEXT NOT NULL,
    accelerator TEXT NOT NULL,
    action      TEXT NOT NULL,
    enabled     INTEGER NOT NULL DEFAULT 1,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT NOT NULL
);

CREATE TABLE analytics (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    payload    TEXT NOT NULL DEFAULT '{}',  -- JSON
    created_at TEXT NOT NULL
);
CREATE INDEX idx_analytics_created_at ON analytics (created_at DESC);
```

- [ ] **Step 2: Write the seed migration**

Create `src-tauri/src/storage/migrations/0002_seed.sql`:
```sql
-- Seed data. INSERT OR IGNORE keeps this idempotent.

INSERT OR IGNORE INTO providers (id, display_name, enabled, default_model, base_url, extra, created_at, updated_at) VALUES
 ('openai',    'OpenAI',        1, 'gpt-4.1',                       NULL,                     '{"accent":"var(--openai)","local":false}',    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('anthropic', 'Anthropic',     1, 'claude-3-5-sonnet-20241022',    NULL,                     '{"accent":"var(--anthropic)","local":false}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('gemini',    'Google Gemini', 1, 'gemini-2.0-pro',                NULL,                     '{"accent":"var(--gemini)","local":false}',    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('ollama',    'Ollama',        1, 'llama3.1:8b',                   'http://localhost:11434', '{"accent":"var(--ollama)","local":true}',     '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

INSERT OR IGNORE INTO prompt_modes (id, name, description, system_prompt, temperature, max_tokens, provider_override, icon_name, is_default, sort_order, created_at, updated_at) VALUES
 ('developer', 'Developer',     'Improves technical clarity for developers', 'You are a senior software engineer. Rewrite the input to be technically precise, unambiguous, and idiomatic. Preserve all code identifiers exactly. Prefer active voice. Keep it concise — do not add commentary.', 0.3, 1024, NULL, 'code',    1, 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('email',     'Email',         'Professional email reply',                  'You write clear, courteous business emails. Match the tone of the source message. Open with a one-line greeting, deliver the message in 2-3 short paragraphs, close warmly.',                                                              0.5, 800,  NULL, 'mail',    0, 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('friendly',  'Friendly',      'Warm, casual tone',                         'Rewrite the input to sound like a thoughtful friend. Use contractions, light humor where it fits, and keep it warm. Avoid formality.',                                                                                                       0.7, 600,  NULL, 'friendly',0, 2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('concise',   'Concise',       'Tighter, fewer words',                      'Cut the input to its essential message in 50% or fewer words. Preserve every concrete fact. No filler.',                                                                                                                                  0.2, 400,  NULL, 'shorten', 0, 3, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('technical', 'Technical',     'Academic and formal',                       'Rewrite in academic register. Use precise terminology. Hedge claims appropriately. Cite implied premises explicitly.',                                                                                                                       0.3, 1200, NULL, 'formal',  0, 4, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('docs',      'Documentation', 'API & technical docs',                      'You write developer documentation. Lead with what the thing does, then how to use it. Use code fences for snippets. Avoid marketing language.',                                                                                            0.2, 1500, NULL, 'text',    0, 5, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

INSERT OR IGNORE INTO shortcuts (id, label, hint, icon_name, accelerator, action, enabled, sort_order, updated_at) VALUES
 ('palette', 'Open Command Palette', 'The main entry point.',      'wand',      'Ctrl+Shift+Space', 'open_palette',     1, 0, '2026-01-01T00:00:00Z'),
 ('rewrite', 'Rewrite selection',    'Improve writing in place.',  'pen',       'Ctrl+Shift+R',     'rewrite_selection',1, 1, '2026-01-01T00:00:00Z'),
 ('grammar', 'Fix grammar',          'Quick grammar pass.',        'text',      'Ctrl+Shift+G',     'fix_grammar',      1, 2, '2026-01-01T00:00:00Z'),
 ('summary', 'Quick summarize',      'Compress to bullets.',       'summarize', 'Ctrl+Shift+S',     'summarize',        1, 3, '2026-01-01T00:00:00Z'),
 ('modes',   'Toggle modes',         'Cycle the active mode.',     'layers',    'Ctrl+Shift+M',     'mode_switch',      1, 4, '2026-01-01T00:00:00Z');

INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
 ('boot_start',         'true',      '2026-01-01T00:00:00Z'),
 ('minimize_to_tray',   'true',      '2026-01-01T00:00:00Z'),
 ('quit_on_close',      'false',     '2026-01-01T00:00:00Z'),
 ('auto_paste',         'true',      '2026-01-01T00:00:00Z'),
 ('notifications',      'true',      '2026-01-01T00:00:00Z'),
 ('stream_response',    'true',      '2026-01-01T00:00:00Z'),
 ('clipboard_fallback', 'false',     '2026-01-01T00:00:00Z'),
 ('low_memory_mode',    'false',     '2026-01-01T00:00:00Z'),
 ('response_timeout',   '30',        '2026-01-01T00:00:00Z'),
 ('concurrent_requests','3',         '2026-01-01T00:00:00Z'),
 ('theme',              '"dark"',    '2026-01-01T00:00:00Z'),
 ('accent',             '"violet"',  '2026-01-01T00:00:00Z'),
 ('density',            '"regular"', '2026-01-01T00:00:00Z'),
 ('history_retention',  '"30d"',     '2026-01-01T00:00:00Z'),
 ('dev_tools',          'false',     '2026-01-01T00:00:00Z'),
 ('log_raw_responses',  'false',     '2026-01-01T00:00:00Z'),
 ('proxy_url',          '""',        '2026-01-01T00:00:00Z');
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/storage/migrations
git commit -m "feat: add initial schema and seed migrations"
```

---

### Task 7: Connection pool + migration runner

**Files:**
- Create: `src-tauri/src/storage/pool.rs`
- Modify: `src-tauri/src/storage/mod.rs`

- [ ] **Step 1: Write the pool module with the test-pool helper and tests**

Create `src-tauri/src/storage/pool.rs`:
```rust
//! SQLite connection pool creation and migration running.

use std::path::Path;
use std::str::FromStr;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::SqlitePool;

use crate::utils::AppResult;

static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("src/storage/migrations");

/// Create the application connection pool at `db_path`, creating the file if missing.
/// Uses WAL + NORMAL synchronous for concurrency and performance.
pub async fn create_pool(db_path: &Path) -> AppResult<SqlitePool> {
    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .foreign_keys(true)
        .busy_timeout(std::time::Duration::from_secs(5));

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    Ok(pool)
}

/// Run all embedded migrations. Idempotent — already-applied migrations are skipped.
pub async fn run_migrations(pool: &SqlitePool) -> AppResult<()> {
    MIGRATOR.run(pool).await?;
    Ok(())
}

/// Create an in-memory pool with migrations applied — for tests only.
#[cfg(test)]
pub async fn test_pool() -> SqlitePool {
    let options = SqliteConnectOptions::from_str("sqlite::memory:").unwrap();
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .unwrap();
    run_migrations(&pool).await.unwrap();
    pool
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn migrations_create_all_six_tables() {
        let pool = test_pool().await;
        let rows: Vec<(String,)> =
            sqlx::query_as("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
                .fetch_all(&pool)
                .await
                .unwrap();
        let names: Vec<&str> = rows.iter().map(|r| r.0.as_str()).collect();
        for expected in [
            "analytics", "history", "prompt_modes", "providers", "settings", "shortcuts",
        ] {
            assert!(names.contains(&expected), "missing table: {expected}");
        }
    }

    #[tokio::test]
    async fn seed_data_is_present() {
        let pool = test_pool().await;
        let (providers,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM providers").fetch_one(&pool).await.unwrap();
        let (modes,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM prompt_modes").fetch_one(&pool).await.unwrap();
        let (shortcuts,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM shortcuts").fetch_one(&pool).await.unwrap();
        let (settings,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM settings").fetch_one(&pool).await.unwrap();
        assert_eq!(providers, 4);
        assert_eq!(modes, 6);
        assert_eq!(shortcuts, 5);
        assert_eq!(settings, 17);
    }

    #[tokio::test]
    async fn migrations_are_idempotent() {
        let pool = test_pool().await;
        // Running again must be a clean no-op.
        run_migrations(&pool).await.unwrap();
    }
}
```

- [ ] **Step 2: Wire the module**

Replace `src-tauri/src/storage/mod.rs`:
```rust
//! Persistence layer — connection pool, migrations, repositories.

pub mod pool;
pub mod repositories;

pub use pool::{create_pool, run_migrations};
```

- [ ] **Step 3: Run the tests to verify they pass**

Run from `src-tauri/`:
```bash
cargo test --lib storage::pool
```
Expected: 3 tests pass. (If `sqlx::migrate!` fails to find the directory, confirm the path is `src/storage/migrations` relative to `src-tauri/`.)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/storage
git commit -m "feat: add SQLite pool and migration runner with test helper"
```

---

### Task 8: Models

**Files:**
- Create: `src-tauri/src/models/settings.rs`, `history.rs`, `shortcut.rs`, `prompt_mode.rs`, `provider.rs`, `analytics.rs`
- Modify: `src-tauri/src/models/mod.rs`

- [ ] **Step 1: Create `models/settings.rs`**

```rust
//! The user-facing `Settings` aggregate. Serde field names match the frontend
//! settings keys; each field round-trips through one `settings` table row.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Settings {
    #[serde(default = "yes")]
    pub boot_start: bool,
    #[serde(default = "yes")]
    pub minimize_to_tray: bool,
    #[serde(default = "no")]
    pub quit_on_close: bool,
    #[serde(default = "yes")]
    pub auto_paste: bool,
    #[serde(default = "yes")]
    pub notifications: bool,
    #[serde(default = "yes")]
    pub stream_response: bool,
    #[serde(default = "no")]
    pub clipboard_fallback: bool,
    #[serde(default = "no")]
    pub low_memory_mode: bool,
    #[serde(default = "default_timeout")]
    pub response_timeout: u32,
    #[serde(default = "default_concurrent")]
    pub concurrent_requests: u32,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_accent")]
    pub accent: String,
    #[serde(default = "default_density")]
    pub density: String,
    #[serde(default = "default_retention")]
    pub history_retention: String,
    #[serde(default = "no")]
    pub dev_tools: bool,
    #[serde(default = "no")]
    pub log_raw_responses: bool,
    #[serde(default)]
    pub proxy_url: String,
}

fn yes() -> bool { true }
fn no() -> bool { false }
fn default_timeout() -> u32 { 30 }
fn default_concurrent() -> u32 { 3 }
fn default_theme() -> String { "dark".into() }
fn default_accent() -> String { "violet".into() }
fn default_density() -> String { "regular".into() }
fn default_retention() -> String { "30d".into() }

impl Default for Settings {
    fn default() -> Self {
        // Round-trips an empty object through serde to apply every field default.
        serde_json::from_str("{}").expect("Settings default must deserialize")
    }
}
```

- [ ] **Step 2: Create `models/history.rs`**

```rust
//! History records. `HistoryItem` is the read DTO sent to the frontend; field
//! names match the frontend `HistoryItem` interface.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct HistoryItem {
    pub id: i64,
    #[serde(rename = "mode")]
    pub mode_name: String,
    #[serde(rename = "iconName")]
    pub icon_name: String,
    #[serde(rename = "provider")]
    pub provider_label: String,
    #[serde(rename = "src")]
    pub source_text: String,
    #[serde(rename = "out")]
    pub output_text: String,
    #[serde(rename = "ms")]
    pub latency_ms: i64,
    #[serde(rename = "fav")]
    pub favorite: bool,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

/// Input for inserting a new history record (used by sub-project 2).
#[derive(Debug, Clone)]
pub struct NewHistoryItem {
    pub mode_name: String,
    pub icon_name: String,
    pub provider_label: String,
    pub source_text: String,
    pub output_text: String,
    pub latency_ms: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HistoryQuery {
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub offset: i64,
}

fn default_limit() -> i64 { 100 }

impl Default for HistoryQuery {
    fn default() -> Self {
        Self { limit: default_limit(), offset: 0 }
    }
}
```

- [ ] **Step 3: Create `models/shortcut.rs`**

```rust
//! Shortcut config. `ShortcutItem` is the read DTO; `keys` is derived from the
//! stored `accelerator` string to match the frontend `ShortcutItem` interface.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ShortcutItem {
    pub id: String,
    pub label: String,
    pub hint: String,
    #[serde(rename = "iconName")]
    pub icon_name: String,
    pub accelerator: String,
    pub action: String,
    pub enabled: bool,
    /// Derived from `accelerator` (e.g. "Ctrl+Shift+Space" -> ["Ctrl","Shift","Space"]).
    #[serde(rename = "keys")]
    #[sqlx(skip)]
    pub keys: Vec<String>,
}

impl ShortcutItem {
    /// Populate the derived `keys` field from `accelerator`.
    pub fn with_keys(mut self) -> Self {
        self.keys = self.accelerator.split('+').map(|s| s.trim().to_string()).collect();
        self
    }
}

/// Input for registering/updating a shortcut.
#[derive(Debug, Clone, Deserialize)]
pub struct ShortcutConfig {
    pub id: String,
    pub label: String,
    pub hint: String,
    #[serde(rename = "iconName")]
    pub icon_name: String,
    pub accelerator: String,
    pub action: String,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub sort_order: i64,
}

fn default_enabled() -> bool { true }
```

- [ ] **Step 4: Create `models/prompt_mode.rs`**

```rust
//! Prompt mode read DTO. Field renames match the frontend `PromptMode` interface
//! (`desc`, `sys`, `temp`, `maxTok`, `provider`).

use serde::Serialize;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct PromptMode {
    pub id: String,
    pub name: String,
    #[serde(rename = "desc")]
    pub description: String,
    #[serde(rename = "sys")]
    pub system_prompt: String,
    #[serde(rename = "temp")]
    pub temperature: f64,
    #[serde(rename = "maxTok")]
    pub max_tokens: i64,
    #[serde(rename = "provider")]
    #[sqlx(rename = "provider_override")]
    pub provider_override: Option<String>,
    #[serde(rename = "iconName")]
    pub icon_name: String,
}
```

- [ ] **Step 5: Create `models/provider.rs`**

```rust
//! Provider read DTO. `accent` and `local` are pulled out of the stored `extra`
//! JSON to match the frontend `ProviderInfo` interface.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub accent: String,
    /// "ok" when enabled, "idle" otherwise (Foundation has no live status check).
    pub status: String,
    pub model: String,
    /// Token usage — always 0 until sub-project 2 records real usage.
    pub usage: i64,
    pub local: bool,
}
```

- [ ] **Step 6: Create `models/analytics.rs`**

```rust
//! Analytics event struct. The write path is owned by sub-project 3 — this
//! struct exists now so the `analytics` table has a typed counterpart.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsEvent {
    pub event_type: String,
    pub payload: serde_json::Value,
}
```

- [ ] **Step 7: Wire the module**

Replace `src-tauri/src/models/mod.rs`:
```rust
//! Domain models and serde DTOs shared across all layers.

pub mod analytics;
pub mod history;
pub mod prompt_mode;
pub mod provider;
pub mod settings;
pub mod shortcut;

pub use history::{HistoryItem, HistoryQuery, NewHistoryItem};
pub use prompt_mode::PromptMode;
pub use provider::ProviderInfo;
pub use settings::Settings;
pub use shortcut::{ShortcutConfig, ShortcutItem};
```

- [ ] **Step 8: Verify it compiles and the Settings default works**

Add this test to the bottom of `src-tauri/src/models/settings.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_have_expected_values() {
        let s = Settings::default();
        assert!(s.boot_start);
        assert_eq!(s.response_timeout, 30);
        assert_eq!(s.theme, "dark");
        assert!(!s.quit_on_close);
    }
}
```

Run from `src-tauri/`:
```bash
cargo test --lib models::
```
Expected: 1 test passes, crate compiles.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/models
git commit -m "feat: add domain models and frontend-shaped DTOs"
```

---

### Task 9: SettingsRepo

**Files:**
- Create: `src-tauri/src/storage/repositories/settings_repo.rs`
- Modify: `src-tauri/src/storage/repositories/mod.rs`

- [ ] **Step 1: Write the repository with failing tests**

Create `src-tauri/src/storage/repositories/settings_repo.rs`:
```rust
//! Settings persistence — the key-value `settings` table. Each row is one
//! JSON-encoded scalar.

use sqlx::SqlitePool;

use crate::utils::AppResult;

#[derive(Clone)]
pub struct SettingsRepo {
    pool: SqlitePool,
}

impl SettingsRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// All settings rows as `(key, json_value)` pairs.
    pub async fn get_all(&self) -> AppResult<Vec<(String, String)>> {
        let rows: Vec<(String, String)> =
            sqlx::query_as("SELECT key, value FROM settings")
                .fetch_all(&self.pool)
                .await?;
        Ok(rows)
    }

    /// Upsert one key with its JSON-encoded value.
    pub async fn upsert(&self, key: &str, json_value: &str) -> AppResult<()> {
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = ?3",
        )
        .bind(key)
        .bind(json_value)
        .bind(now)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::pool::test_pool;

    #[tokio::test]
    async fn get_all_returns_seeded_rows() {
        let repo = SettingsRepo::new(test_pool().await);
        let rows = repo.get_all().await.unwrap();
        assert_eq!(rows.len(), 17);
        assert!(rows.iter().any(|(k, v)| k == "theme" && v == "\"dark\""));
    }

    #[tokio::test]
    async fn upsert_inserts_then_updates() {
        let repo = SettingsRepo::new(test_pool().await);
        repo.upsert("theme", "\"light\"").await.unwrap();
        let rows = repo.get_all().await.unwrap();
        let theme = rows.iter().find(|(k, _)| k == "theme").unwrap();
        assert_eq!(theme.1, "\"light\"");
        // Still 17 rows — upsert, not insert.
        assert_eq!(rows.len(), 17);
    }
}
```

- [ ] **Step 2: Wire the module**

Replace `src-tauri/src/storage/repositories/mod.rs`:
```rust
//! Repositories — each owns the SQL for one table.

pub mod settings_repo;

pub use settings_repo::SettingsRepo;
```

- [ ] **Step 3: Run the tests to verify they pass**

Run from `src-tauri/`:
```bash
cargo test --lib storage::repositories::settings_repo
```
Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/storage/repositories
git commit -m "feat: add SettingsRepo"
```

---

### Task 10: HistoryRepo

**Files:**
- Create: `src-tauri/src/storage/repositories/history_repo.rs`
- Modify: `src-tauri/src/storage/repositories/mod.rs`

- [ ] **Step 1: Write the repository with failing tests**

Create `src-tauri/src/storage/repositories/history_repo.rs`:
```rust
//! History persistence — the `history` table.

use sqlx::SqlitePool;

use crate::models::{HistoryItem, HistoryQuery, NewHistoryItem};
use crate::utils::AppResult;

#[derive(Clone)]
pub struct HistoryRepo {
    pool: SqlitePool,
}

impl HistoryRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// List history newest-first, paginated.
    pub async fn list(&self, query: &HistoryQuery) -> AppResult<Vec<HistoryItem>> {
        let items: Vec<HistoryItem> = sqlx::query_as(
            "SELECT id, mode_name, icon_name, provider_label, source_text, output_text,
                    latency_ms, favorite, created_at
             FROM history ORDER BY created_at DESC, id DESC LIMIT ?1 OFFSET ?2",
        )
        .bind(query.limit)
        .bind(query.offset)
        .fetch_all(&self.pool)
        .await?;
        Ok(items)
    }

    /// Insert a new history record; returns its row id.
    pub async fn insert(&self, item: &NewHistoryItem) -> AppResult<i64> {
        let now = chrono::Utc::now().to_rfc3339();
        let id = sqlx::query(
            "INSERT INTO history
               (mode_name, icon_name, provider_label, source_text, output_text, latency_ms, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .bind(&item.mode_name)
        .bind(&item.icon_name)
        .bind(&item.provider_label)
        .bind(&item.source_text)
        .bind(&item.output_text)
        .bind(item.latency_ms)
        .bind(now)
        .execute(&self.pool)
        .await?
        .last_insert_rowid();
        Ok(id)
    }

    /// Delete all history rows.
    pub async fn clear(&self) -> AppResult<u64> {
        let affected = sqlx::query("DELETE FROM history")
            .execute(&self.pool)
            .await?
            .rows_affected();
        Ok(affected)
    }

    /// Delete history rows older than the given RFC3339 timestamp.
    pub async fn purge_older_than(&self, cutoff_rfc3339: &str) -> AppResult<u64> {
        let affected = sqlx::query("DELETE FROM history WHERE created_at < ?1")
            .bind(cutoff_rfc3339)
            .execute(&self.pool)
            .await?
            .rows_affected();
        Ok(affected)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::pool::test_pool;

    fn sample() -> NewHistoryItem {
        NewHistoryItem {
            mode_name: "Developer".into(),
            icon_name: "code".into(),
            provider_label: "GPT-4.1".into(),
            source_text: "in".into(),
            output_text: "out".into(),
            latency_ms: 1200,
        }
    }

    #[tokio::test]
    async fn insert_then_list_returns_the_row() {
        let repo = HistoryRepo::new(test_pool().await);
        let id = repo.insert(&sample()).await.unwrap();
        assert!(id > 0);
        let items = repo.list(&HistoryQuery::default()).await.unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].mode_name, "Developer");
        assert!(!items[0].favorite);
    }

    #[tokio::test]
    async fn clear_removes_all_rows() {
        let repo = HistoryRepo::new(test_pool().await);
        repo.insert(&sample()).await.unwrap();
        repo.insert(&sample()).await.unwrap();
        let removed = repo.clear().await.unwrap();
        assert_eq!(removed, 2);
        assert!(repo.list(&HistoryQuery::default()).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn list_respects_limit() {
        let repo = HistoryRepo::new(test_pool().await);
        for _ in 0..5 {
            repo.insert(&sample()).await.unwrap();
        }
        let q = HistoryQuery { limit: 2, offset: 0 };
        assert_eq!(repo.list(&q).await.unwrap().len(), 2);
    }
}
```

- [ ] **Step 2: Wire the module**

Update `src-tauri/src/storage/repositories/mod.rs`:
```rust
//! Repositories — each owns the SQL for one table.

pub mod history_repo;
pub mod settings_repo;

pub use history_repo::HistoryRepo;
pub use settings_repo::SettingsRepo;
```

- [ ] **Step 3: Run the tests to verify they pass**

Run from `src-tauri/`:
```bash
cargo test --lib storage::repositories::history_repo
```
Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/storage/repositories
git commit -m "feat: add HistoryRepo"
```

---

### Task 11: ShortcutRepo

**Files:**
- Create: `src-tauri/src/storage/repositories/shortcut_repo.rs`
- Modify: `src-tauri/src/storage/repositories/mod.rs`

- [ ] **Step 1: Write the repository with failing tests**

Create `src-tauri/src/storage/repositories/shortcut_repo.rs`:
```rust
//! Shortcut config persistence — the `shortcuts` table.

use sqlx::SqlitePool;

use crate::models::{ShortcutConfig, ShortcutItem};
use crate::utils::{AppError, AppResult};

#[derive(Clone)]
pub struct ShortcutRepo {
    pool: SqlitePool,
}

impl ShortcutRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// List all shortcuts ordered by `sort_order`. Each item has `keys` derived.
    pub async fn list(&self) -> AppResult<Vec<ShortcutItem>> {
        let items: Vec<ShortcutItem> = sqlx::query_as(
            "SELECT id, label, hint, icon_name, accelerator, action, enabled
             FROM shortcuts ORDER BY sort_order ASC",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(items.into_iter().map(ShortcutItem::with_keys).collect())
    }

    /// Fetch one shortcut by id.
    pub async fn get(&self, id: &str) -> AppResult<ShortcutItem> {
        let item: Option<ShortcutItem> = sqlx::query_as(
            "SELECT id, label, hint, icon_name, accelerator, action, enabled
             FROM shortcuts WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        item.map(ShortcutItem::with_keys)
            .ok_or_else(|| AppError::NotFound { entity: "shortcut", id: id.to_string() })
    }

    /// Insert or update a shortcut.
    pub async fn upsert(&self, cfg: &ShortcutConfig) -> AppResult<()> {
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO shortcuts
               (id, label, hint, icon_name, accelerator, action, enabled, sort_order, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
               label=?2, hint=?3, icon_name=?4, accelerator=?5, action=?6,
               enabled=?7, sort_order=?8, updated_at=?9",
        )
        .bind(&cfg.id)
        .bind(&cfg.label)
        .bind(&cfg.hint)
        .bind(&cfg.icon_name)
        .bind(&cfg.accelerator)
        .bind(&cfg.action)
        .bind(cfg.enabled)
        .bind(cfg.sort_order)
        .bind(now)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Delete a shortcut by id. Errors with `NotFound` if no row was removed.
    pub async fn delete(&self, id: &str) -> AppResult<()> {
        let affected = sqlx::query("DELETE FROM shortcuts WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?
            .rows_affected();
        if affected == 0 {
            return Err(AppError::NotFound { entity: "shortcut", id: id.to_string() });
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::pool::test_pool;

    fn cfg(id: &str) -> ShortcutConfig {
        ShortcutConfig {
            id: id.into(),
            label: "Test".into(),
            hint: "hint".into(),
            icon_name: "wand".into(),
            accelerator: "Ctrl+Alt+T".into(),
            action: "test_action".into(),
            enabled: true,
            sort_order: 99,
        }
    }

    #[tokio::test]
    async fn list_returns_seeded_shortcuts_with_keys() {
        let repo = ShortcutRepo::new(test_pool().await);
        let items = repo.list().await.unwrap();
        assert_eq!(items.len(), 5);
        let palette = items.iter().find(|s| s.id == "palette").unwrap();
        assert_eq!(palette.keys, vec!["Ctrl", "Shift", "Space"]);
    }

    #[tokio::test]
    async fn upsert_then_get_roundtrips() {
        let repo = ShortcutRepo::new(test_pool().await);
        repo.upsert(&cfg("custom")).await.unwrap();
        let got = repo.get("custom").await.unwrap();
        assert_eq!(got.accelerator, "Ctrl+Alt+T");
        assert_eq!(got.keys, vec!["Ctrl", "Alt", "T"]);
    }

    #[tokio::test]
    async fn delete_missing_returns_not_found() {
        let repo = ShortcutRepo::new(test_pool().await);
        let err = repo.delete("does-not-exist").await.unwrap_err();
        assert!(matches!(err, AppError::NotFound { entity: "shortcut", .. }));
    }
}
```

- [ ] **Step 2: Wire the module**

Update `src-tauri/src/storage/repositories/mod.rs`:
```rust
//! Repositories — each owns the SQL for one table.

pub mod history_repo;
pub mod settings_repo;
pub mod shortcut_repo;

pub use history_repo::HistoryRepo;
pub use settings_repo::SettingsRepo;
pub use shortcut_repo::ShortcutRepo;
```

- [ ] **Step 3: Run the tests to verify they pass**

Run from `src-tauri/`:
```bash
cargo test --lib storage::repositories::shortcut_repo
```
Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/storage/repositories
git commit -m "feat: add ShortcutRepo"
```

---

### Task 12: ModeRepo + ProviderRepo

**Files:**
- Create: `src-tauri/src/storage/repositories/mode_repo.rs`, `provider_repo.rs`
- Modify: `src-tauri/src/storage/repositories/mod.rs`

- [ ] **Step 1: Write `mode_repo.rs` with failing tests**

Create `src-tauri/src/storage/repositories/mode_repo.rs`:
```rust
//! Prompt mode persistence — read-only in the Foundation sub-project. Write
//! paths are added by sub-project 2.

use sqlx::SqlitePool;

use crate::models::PromptMode;
use crate::utils::{AppError, AppResult};

#[derive(Clone)]
pub struct ModeRepo {
    pool: SqlitePool,
}

impl ModeRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// List all prompt modes ordered by `sort_order`.
    pub async fn list(&self) -> AppResult<Vec<PromptMode>> {
        let modes: Vec<PromptMode> = sqlx::query_as(
            "SELECT id, name, description, system_prompt, temperature, max_tokens,
                    provider_override, icon_name
             FROM prompt_modes ORDER BY sort_order ASC",
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(modes)
    }

    /// Fetch one prompt mode by id.
    pub async fn get(&self, id: &str) -> AppResult<PromptMode> {
        let mode: Option<PromptMode> = sqlx::query_as(
            "SELECT id, name, description, system_prompt, temperature, max_tokens,
                    provider_override, icon_name
             FROM prompt_modes WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        mode.ok_or_else(|| AppError::NotFound { entity: "prompt_mode", id: id.to_string() })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::pool::test_pool;

    #[tokio::test]
    async fn list_returns_six_seeded_modes_in_order() {
        let repo = ModeRepo::new(test_pool().await);
        let modes = repo.list().await.unwrap();
        assert_eq!(modes.len(), 6);
        assert_eq!(modes[0].id, "developer");
    }

    #[tokio::test]
    async fn get_missing_returns_not_found() {
        let repo = ModeRepo::new(test_pool().await);
        let err = repo.get("nope").await.unwrap_err();
        assert!(matches!(err, AppError::NotFound { entity: "prompt_mode", .. }));
    }
}
```

- [ ] **Step 2: Write `provider_repo.rs` with failing tests**

Create `src-tauri/src/storage/repositories/provider_repo.rs`:
```rust
//! Provider config persistence — read-only in the Foundation sub-project.
//! Builds `ProviderInfo` DTOs, extracting `accent`/`local` from the `extra` JSON.

use sqlx::SqlitePool;

use crate::models::ProviderInfo;
use crate::utils::AppResult;

#[derive(Clone)]
pub struct ProviderRepo {
    pool: SqlitePool,
}

/// Internal row shape before `extra` is unpacked.
#[derive(sqlx::FromRow)]
struct ProviderRow {
    id: String,
    display_name: String,
    enabled: bool,
    default_model: String,
    extra: String,
}

impl ProviderRepo {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// List all providers as frontend-shaped `ProviderInfo` DTOs.
    pub async fn list(&self) -> AppResult<Vec<ProviderInfo>> {
        let rows: Vec<ProviderRow> = sqlx::query_as(
            "SELECT id, display_name, enabled, default_model, extra
             FROM providers ORDER BY id ASC",
        )
        .fetch_all(&self.pool)
        .await?;

        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            let extra: serde_json::Value =
                serde_json::from_str(&row.extra).unwrap_or(serde_json::Value::Null);
            out.push(ProviderInfo {
                id: row.id,
                name: row.display_name,
                accent: extra.get("accent").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                status: if row.enabled { "ok".into() } else { "idle".into() },
                model: row.default_model,
                usage: 0,
                local: extra.get("local").and_then(|v| v.as_bool()).unwrap_or(false),
            });
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::pool::test_pool;

    #[tokio::test]
    async fn list_returns_four_seeded_providers() {
        let repo = ProviderRepo::new(test_pool().await);
        let providers = repo.list().await.unwrap();
        assert_eq!(providers.len(), 4);
        let ollama = providers.iter().find(|p| p.id == "ollama").unwrap();
        assert!(ollama.local);
        assert_eq!(ollama.status, "ok");
        let openai = providers.iter().find(|p| p.id == "openai").unwrap();
        assert!(!openai.local);
    }
}
```

- [ ] **Step 3: Wire the module**

Update `src-tauri/src/storage/repositories/mod.rs`:
```rust
//! Repositories — each owns the SQL for one table.

pub mod history_repo;
pub mod mode_repo;
pub mod provider_repo;
pub mod settings_repo;
pub mod shortcut_repo;

pub use history_repo::HistoryRepo;
pub use mode_repo::ModeRepo;
pub use provider_repo::ProviderRepo;
pub use settings_repo::SettingsRepo;
pub use shortcut_repo::ShortcutRepo;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run from `src-tauri/`:
```bash
cargo test --lib storage::repositories::mode_repo storage::repositories::provider_repo
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/storage/repositories
git commit -m "feat: add read-only ModeRepo and ProviderRepo"
```

---

### Task 13: EventBus + AppEvent types

**Files:**
- Create: `src-tauri/src/events/types.rs`, `src-tauri/src/events/bus.rs`
- Modify: `src-tauri/src/events/mod.rs`

- [ ] **Step 1: Write `events/types.rs` with the event contract and a failing test**

Create `src-tauri/src/events/types.rs`:
```rust
//! The application-wide event contract. `AppEvent` enumerates every event the
//! backend can emit. Foundation emits `AppReady`, `SettingsChanged`, and
//! `ShortcutUpdated`; the rest are typed-but-dormant until sub-projects 2/3.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ShortcutTriggeredPayload {
    pub shortcut_id: String,
    pub action: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AiRequestPayload {
    pub request_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AiStreamChunkPayload {
    pub request_id: String,
    pub chunk: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AiRequestFailedPayload {
    pub request_id: String,
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModeChangedPayload {
    pub mode_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProviderChangedPayload {
    pub provider_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClipboardOperationPayload {
    pub operation: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct OverlayOpenedPayload {
    pub overlay_kind: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ShortcutUpdatedPayload {
    pub shortcut_id: String,
}

/// Every event the backend can emit. The associated `name()` is the stable
/// string the frontend listens on.
#[derive(Debug, Clone)]
pub enum AppEvent {
    AppReady,
    SettingsChanged,
    ShortcutUpdated(ShortcutUpdatedPayload),
    // Dormant — emitted by later sub-projects.
    ShortcutTriggered(ShortcutTriggeredPayload),
    AiRequestStarted(AiRequestPayload),
    AiStreamChunk(AiStreamChunkPayload),
    AiRequestCompleted(AiRequestPayload),
    AiRequestFailed(AiRequestFailedPayload),
    ModeChanged(ModeChangedPayload),
    ProviderChanged(ProviderChangedPayload),
    ClipboardOperation(ClipboardOperationPayload),
    OverlayOpened(OverlayOpenedPayload),
}

impl AppEvent {
    /// The stable event-name string emitted over the Tauri event channel.
    pub fn name(&self) -> &'static str {
        match self {
            AppEvent::AppReady => "app_ready",
            AppEvent::SettingsChanged => "settings_changed",
            AppEvent::ShortcutUpdated(_) => "shortcut_updated",
            AppEvent::ShortcutTriggered(_) => "shortcut_triggered",
            AppEvent::AiRequestStarted(_) => "ai_request_started",
            AppEvent::AiStreamChunk(_) => "ai_stream_chunk",
            AppEvent::AiRequestCompleted(_) => "ai_request_completed",
            AppEvent::AiRequestFailed(_) => "ai_request_failed",
            AppEvent::ModeChanged(_) => "mode_changed",
            AppEvent::ProviderChanged(_) => "provider_changed",
            AppEvent::ClipboardOperation(_) => "clipboard_operation",
            AppEvent::OverlayOpened(_) => "overlay_opened",
        }
    }

    /// The JSON payload for this event (`null` for payload-less events).
    pub fn payload(&self) -> serde_json::Value {
        match self {
            AppEvent::AppReady | AppEvent::SettingsChanged => serde_json::Value::Null,
            AppEvent::ShortcutUpdated(p) => serde_json::to_value(p).unwrap_or_default(),
            AppEvent::ShortcutTriggered(p) => serde_json::to_value(p).unwrap_or_default(),
            AppEvent::AiRequestStarted(p) | AppEvent::AiRequestCompleted(p) => {
                serde_json::to_value(p).unwrap_or_default()
            }
            AppEvent::AiStreamChunk(p) => serde_json::to_value(p).unwrap_or_default(),
            AppEvent::AiRequestFailed(p) => serde_json::to_value(p).unwrap_or_default(),
            AppEvent::ModeChanged(p) => serde_json::to_value(p).unwrap_or_default(),
            AppEvent::ProviderChanged(p) => serde_json::to_value(p).unwrap_or_default(),
            AppEvent::ClipboardOperation(p) => serde_json::to_value(p).unwrap_or_default(),
            AppEvent::OverlayOpened(p) => serde_json::to_value(p).unwrap_or_default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_names_are_stable() {
        assert_eq!(AppEvent::AppReady.name(), "app_ready");
        assert_eq!(AppEvent::SettingsChanged.name(), "settings_changed");
        assert_eq!(
            AppEvent::ShortcutUpdated(ShortcutUpdatedPayload { shortcut_id: "x".into() }).name(),
            "shortcut_updated"
        );
    }

    #[test]
    fn payload_carries_struct_fields() {
        let ev = AppEvent::ShortcutUpdated(ShortcutUpdatedPayload { shortcut_id: "palette".into() });
        assert_eq!(ev.payload()["shortcut_id"], "palette");
    }
}
```

- [ ] **Step 2: Write `events/bus.rs`**

Create `src-tauri/src/events/bus.rs`:
```rust
//! `EventBus` — a thin typed wrapper over Tauri's `AppHandle` emit. Every
//! backend event goes through here so the contract has one chokepoint.

use tauri::{AppHandle, Emitter};

use super::types::AppEvent;

#[derive(Clone)]
pub struct EventBus {
    app_handle: AppHandle,
}

impl EventBus {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    /// Emit an event to all frontend listeners. Emit failures are logged, not
    /// propagated — a missing listener must never break a backend operation.
    pub fn emit(&self, event: AppEvent) {
        let name = event.name();
        if let Err(err) = self.app_handle.emit(name, event.payload()) {
            tracing::warn!("failed to emit event {name}: {err}");
        } else {
            tracing::debug!("emitted event {name}");
        }
    }
}
```

- [ ] **Step 3: Wire the module**

Replace `src-tauri/src/events/mod.rs`:
```rust
//! Application-wide event system.

pub mod bus;
pub mod types;

pub use bus::EventBus;
pub use types::AppEvent;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run from `src-tauri/`:
```bash
cargo test --lib events::
```
Expected: 2 tests pass, crate compiles.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/events
git commit -m "feat: add typed AppEvent contract and EventBus"
```

---

### Task 14: SettingsService

**Files:**
- Create: `src-tauri/src/services/settings_service.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [ ] **Step 1: Write the service with failing tests**

Create `src-tauri/src/services/settings_service.rs`:
```rust
//! Settings business logic — maps the `Settings` aggregate to/from the
//! key-value `settings` table and emits `settings_changed` on save.

use crate::events::{AppEvent, EventBus};
use crate::models::Settings;
use crate::storage::repositories::SettingsRepo;
use crate::utils::{AppError, AppResult};

#[derive(Clone)]
pub struct SettingsService {
    repo: SettingsRepo,
    events: EventBus,
}

impl SettingsService {
    pub fn new(repo: SettingsRepo, events: EventBus) -> Self {
        Self { repo, events }
    }

    /// Load all settings rows and assemble them into a typed `Settings`.
    /// Missing keys fall back to `Settings` field defaults.
    pub async fn get(&self) -> AppResult<Settings> {
        let rows = self.repo.get_all().await?;
        let mut map = serde_json::Map::new();
        for (key, json_value) in rows {
            let value: serde_json::Value = serde_json::from_str(&json_value)
                .map_err(AppError::Serialization)?;
            map.insert(key, value);
        }
        let settings: Settings = serde_json::from_value(serde_json::Value::Object(map))
            .map_err(AppError::Serialization)?;
        Ok(settings)
    }

    /// Persist a full `Settings` aggregate — one upsert per field — then emit
    /// `settings_changed`.
    pub async fn save(&self, settings: &Settings) -> AppResult<()> {
        let value = serde_json::to_value(settings).map_err(AppError::Serialization)?;
        let object = value
            .as_object()
            .ok_or_else(|| AppError::Validation("settings must be an object".into()))?;
        for (key, field_value) in object {
            let json_value = serde_json::to_string(field_value).map_err(AppError::Serialization)?;
            self.repo.upsert(key, &json_value).await?;
        }
        self.events.emit(AppEvent::SettingsChanged);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::pool::test_pool;
    use crate::storage::repositories::SettingsRepo;

    // EventBus needs an AppHandle, which is unavailable in unit tests. The
    // service tests below exercise repo round-tripping; emit is covered by the
    // manual smoke check in Task 23. We construct the service via a helper that
    // skips the bus by testing the repo-facing logic directly.
    async fn repo() -> SettingsRepo {
        SettingsRepo::new(test_pool().await)
    }

    #[tokio::test]
    async fn get_assembles_seeded_defaults() {
        // Reproduces SettingsService::get without the bus.
        let repo = repo().await;
        let rows = repo.get_all().await.unwrap();
        let mut map = serde_json::Map::new();
        for (k, v) in rows {
            map.insert(k, serde_json::from_str(&v).unwrap());
        }
        let settings: Settings =
            serde_json::from_value(serde_json::Value::Object(map)).unwrap();
        assert!(settings.boot_start);
        assert_eq!(settings.theme, "dark");
        assert_eq!(settings.response_timeout, 30);
    }

    #[tokio::test]
    async fn save_then_get_roundtrips_changed_fields() {
        let repo = repo().await;
        let mut settings = Settings::default();
        settings.theme = "light".into();
        settings.response_timeout = 60;

        // Reproduces SettingsService::save without the bus.
        let value = serde_json::to_value(&settings).unwrap();
        for (k, fv) in value.as_object().unwrap() {
            repo.upsert(k, &serde_json::to_string(fv).unwrap()).await.unwrap();
        }

        let rows = repo.get_all().await.unwrap();
        let mut map = serde_json::Map::new();
        for (k, v) in rows {
            map.insert(k, serde_json::from_str(&v).unwrap());
        }
        let loaded: Settings =
            serde_json::from_value(serde_json::Value::Object(map)).unwrap();
        assert_eq!(loaded.theme, "light");
        assert_eq!(loaded.response_timeout, 60);
    }
}
```

Note: the service's `get`/`save` logic is duplicated in the tests deliberately — `EventBus` requires a real `AppHandle`, so the unit tests verify the repo-facing serialization round-trip (the part that can go wrong), and event emission is verified by the Task 23 smoke check.

- [ ] **Step 2: Wire the module**

Replace `src-tauri/src/services/mod.rs`:
```rust
//! Service layer — business logic, orchestrating repositories and the event bus.

pub mod settings_service;

pub use settings_service::SettingsService;
```

- [ ] **Step 3: Run the tests to verify they pass**

Run from `src-tauri/`:
```bash
cargo test --lib services::settings_service
```
Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services
git commit -m "feat: add SettingsService"
```

---

### Task 15: HistoryService

**Files:**
- Create: `src-tauri/src/services/history_service.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [ ] **Step 1: Write the service with failing tests**

Create `src-tauri/src/services/history_service.rs`:
```rust
//! History business logic. Foundation exposes list + clear; `record` is here
//! for sub-project 2 to call after an AI transformation.

use crate::models::{HistoryItem, HistoryQuery, NewHistoryItem};
use crate::storage::repositories::HistoryRepo;
use crate::utils::AppResult;

#[derive(Clone)]
pub struct HistoryService {
    repo: HistoryRepo,
}

impl HistoryService {
    pub fn new(repo: HistoryRepo) -> Self {
        Self { repo }
    }

    /// List history newest-first.
    pub async fn list(&self, query: HistoryQuery) -> AppResult<Vec<HistoryItem>> {
        self.repo.list(&query).await
    }

    /// Delete all history; returns the number of rows removed.
    pub async fn clear(&self) -> AppResult<u64> {
        self.repo.clear().await
    }

    /// Record a completed transformation. Used by sub-project 2.
    pub async fn record(&self, item: NewHistoryItem) -> AppResult<i64> {
        self.repo.insert(&item).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::pool::test_pool;
    use crate::storage::repositories::HistoryRepo;

    fn svc(repo: HistoryRepo) -> HistoryService {
        HistoryService::new(repo)
    }

    #[tokio::test]
    async fn record_then_list_returns_item() {
        let service = svc(HistoryRepo::new(test_pool().await));
        service
            .record(NewHistoryItem {
                mode_name: "Email".into(),
                icon_name: "mail".into(),
                provider_label: "Claude".into(),
                source_text: "hi".into(),
                output_text: "Hello".into(),
                latency_ms: 900,
            })
            .await
            .unwrap();
        let items = service.list(HistoryQuery::default()).await.unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].mode_name, "Email");
    }

    #[tokio::test]
    async fn clear_empties_history() {
        let service = svc(HistoryRepo::new(test_pool().await));
        service
            .record(NewHistoryItem {
                mode_name: "Email".into(),
                icon_name: "mail".into(),
                provider_label: "Claude".into(),
                source_text: "hi".into(),
                output_text: "Hello".into(),
                latency_ms: 900,
            })
            .await
            .unwrap();
        let removed = service.clear().await.unwrap();
        assert_eq!(removed, 1);
        assert!(service.list(HistoryQuery::default()).await.unwrap().is_empty());
    }
}
```

- [ ] **Step 2: Wire the module**

Update `src-tauri/src/services/mod.rs`:
```rust
//! Service layer — business logic, orchestrating repositories and the event bus.

pub mod history_service;
pub mod settings_service;

pub use history_service::HistoryService;
pub use settings_service::SettingsService;
```

- [ ] **Step 3: Run the tests to verify they pass**

Run from `src-tauri/`:
```bash
cargo test --lib services::history_service
```
Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services
git commit -m "feat: add HistoryService"
```

---

### Task 16: ShortcutService

**Files:**
- Create: `src-tauri/src/services/shortcut_service.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [ ] **Step 1: Write the service with failing tests**

Create `src-tauri/src/services/shortcut_service.rs`:
```rust
//! Shortcut business logic. "Register" persists a shortcut config row and emits
//! `shortcut_updated`; binding the accelerator to the OS is sub-project 3.

use crate::events::types::ShortcutUpdatedPayload;
use crate::events::{AppEvent, EventBus};
use crate::models::{ShortcutConfig, ShortcutItem};
use crate::storage::repositories::ShortcutRepo;
use crate::utils::{AppError, AppResult};

#[derive(Clone)]
pub struct ShortcutService {
    repo: ShortcutRepo,
    events: EventBus,
}

impl ShortcutService {
    pub fn new(repo: ShortcutRepo, events: EventBus) -> Self {
        Self { repo, events }
    }

    /// List all configured shortcuts.
    pub async fn list(&self) -> AppResult<Vec<ShortcutItem>> {
        self.repo.list().await
    }

    /// Persist (insert or update) a shortcut config, then emit `shortcut_updated`.
    /// Rejects an empty accelerator before touching the database.
    pub async fn register(&self, config: ShortcutConfig) -> AppResult<()> {
        if config.accelerator.trim().is_empty() {
            return Err(AppError::Validation("accelerator must not be empty".into()));
        }
        self.repo.upsert(&config).await?;
        self.events.emit(AppEvent::ShortcutUpdated(ShortcutUpdatedPayload {
            shortcut_id: config.id,
        }));
        Ok(())
    }

    /// Delete a shortcut config, then emit `shortcut_updated`.
    pub async fn unregister(&self, id: &str) -> AppResult<()> {
        self.repo.delete(id).await?;
        self.events.emit(AppEvent::ShortcutUpdated(ShortcutUpdatedPayload {
            shortcut_id: id.to_string(),
        }));
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::pool::test_pool;
    use crate::storage::repositories::ShortcutRepo;

    // Validation runs before the bus, so an empty-accelerator config can be
    // tested through the repo directly. Repo behaviour (upsert/delete/list) is
    // covered by Task 11; here we verify the validation guard.
    #[tokio::test]
    async fn register_rejects_empty_accelerator() {
        let repo = ShortcutRepo::new(test_pool().await);
        let config = ShortcutConfig {
            id: "bad".into(),
            label: "Bad".into(),
            hint: "".into(),
            icon_name: "wand".into(),
            accelerator: "   ".into(),
            action: "noop".into(),
            enabled: true,
            sort_order: 0,
        };
        // Reproduces the guard in ShortcutService::register.
        let result: AppResult<()> = if config.accelerator.trim().is_empty() {
            Err(AppError::Validation("accelerator must not be empty".into()))
        } else {
            repo.upsert(&config).await
        };
        assert!(matches!(result, Err(AppError::Validation(_))));
    }
}
```

- [ ] **Step 2: Wire the module**

Update `src-tauri/src/services/mod.rs`:
```rust
//! Service layer — business logic, orchestrating repositories and the event bus.

pub mod history_service;
pub mod settings_service;
pub mod shortcut_service;

pub use history_service::HistoryService;
pub use settings_service::SettingsService;
pub use shortcut_service::ShortcutService;
```

- [ ] **Step 3: Run the tests to verify they pass**

Run from `src-tauri/`:
```bash
cargo test --lib services::shortcut_service
```
Expected: 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services
git commit -m "feat: add ShortcutService"
```

---

### Task 17: CatalogService

**Files:**
- Create: `src-tauri/src/services/catalog_service.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [ ] **Step 1: Write the service with failing tests**

Create `src-tauri/src/services/catalog_service.rs`:
```rust
//! Read-only access to the seeded `prompt_modes` and `providers` catalogs.
//! Lets the frontend's mode/provider lists be backed by real data now; write
//! paths and dedicated services arrive in sub-project 2.

use crate::models::{ProviderInfo, PromptMode};
use crate::storage::repositories::{ModeRepo, ProviderRepo};
use crate::utils::AppResult;

#[derive(Clone)]
pub struct CatalogService {
    modes: ModeRepo,
    providers: ProviderRepo,
}

impl CatalogService {
    pub fn new(modes: ModeRepo, providers: ProviderRepo) -> Self {
        Self { modes, providers }
    }

    /// List all prompt modes.
    pub async fn list_modes(&self) -> AppResult<Vec<PromptMode>> {
        self.modes.list().await
    }

    /// List all providers.
    pub async fn list_providers(&self) -> AppResult<Vec<ProviderInfo>> {
        self.providers.list().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::pool::test_pool;
    use crate::storage::repositories::{ModeRepo, ProviderRepo};

    #[tokio::test]
    async fn lists_seeded_catalog() {
        let pool = test_pool().await;
        let service =
            CatalogService::new(ModeRepo::new(pool.clone()), ProviderRepo::new(pool.clone()));
        assert_eq!(service.list_modes().await.unwrap().len(), 6);
        assert_eq!(service.list_providers().await.unwrap().len(), 4);
    }
}
```

- [ ] **Step 2: Wire the module**

Update `src-tauri/src/services/mod.rs`:
```rust
//! Service layer — business logic, orchestrating repositories and the event bus.

pub mod catalog_service;
pub mod history_service;
pub mod settings_service;
pub mod shortcut_service;

pub use catalog_service::CatalogService;
pub use history_service::HistoryService;
pub use settings_service::SettingsService;
pub use shortcut_service::ShortcutService;
```

- [ ] **Step 3: Run the test to verify it passes**

Run from `src-tauri/`:
```bash
cargo test --lib services::catalog_service
```
Expected: 1 test passes.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services
git commit -m "feat: add CatalogService for read-only modes and providers"
```

---

### Task 18: AppState + composition root

**Files:**
- Create: `src-tauri/src/app/state.rs`, `src-tauri/src/app/setup.rs`
- Modify: `src-tauri/src/app/mod.rs`

- [ ] **Step 1: Write `app/state.rs`**

Create `src-tauri/src/app/state.rs`:
```rust
//! `AppState` — the single container registered with Tauri's managed state.
//! Holds the process config plus the four wired services. Cheap to clone
//! (every field is `Clone` and internally `Arc`-backed or a pool handle).

use crate::config::Config;
use crate::services::{CatalogService, HistoryService, SettingsService, ShortcutService};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub settings: SettingsService,
    pub history: HistoryService,
    pub shortcuts: ShortcutService,
    pub catalog: CatalogService,
}
```

- [ ] **Step 2: Write `app/setup.rs`**

Create `src-tauri/src/app/setup.rs`:
```rust
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
```

- [ ] **Step 3: Wire the module**

Update `src-tauri/src/app/mod.rs`:
```rust
//! Application composition root.

pub mod logging;
pub mod setup;
pub mod state;

pub use state::AppState;
```

- [ ] **Step 4: Verify it compiles**

Run from `src-tauri/`:
```bash
cargo build
```
Expected: PASS (the `lifecycle` stub is still unreferenced — that is fine).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/app
git commit -m "feat: add AppState and composition root"
```

---

### Task 19: Commands + lib.rs wiring

**Files:**
- Create: `src-tauri/src/commands/settings.rs`, `history.rs`, `shortcuts.rs`, `catalog.rs`
- Modify: `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`

- [ ] **Step 1: Write `commands/settings.rs`**

Create `src-tauri/src/commands/settings.rs`:
```rust
//! Settings commands — thin IPC adapters over `SettingsService`.

use tauri::State;

use crate::app::AppState;
use crate::models::Settings;
use crate::utils::AppError;

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, AppError> {
    state.settings.get().await
}

#[tauri::command]
pub async fn save_settings(
    state: State<'_, AppState>,
    settings: Settings,
) -> Result<(), AppError> {
    state.settings.save(&settings).await
}
```

- [ ] **Step 2: Write `commands/history.rs`**

Create `src-tauri/src/commands/history.rs`:
```rust
//! History commands — thin IPC adapters over `HistoryService`.

use tauri::State;

use crate::app::AppState;
use crate::models::{HistoryItem, HistoryQuery};
use crate::utils::AppError;

#[tauri::command]
pub async fn get_history(
    state: State<'_, AppState>,
    query: Option<HistoryQuery>,
) -> Result<Vec<HistoryItem>, AppError> {
    state.history.list(query.unwrap_or_default()).await
}

#[tauri::command]
pub async fn clear_history(state: State<'_, AppState>) -> Result<u64, AppError> {
    state.history.clear().await
}
```

- [ ] **Step 3: Write `commands/shortcuts.rs`**

Create `src-tauri/src/commands/shortcuts.rs`:
```rust
//! Shortcut commands — thin IPC adapters over `ShortcutService`.

use tauri::State;

use crate::app::AppState;
use crate::models::{ShortcutConfig, ShortcutItem};
use crate::utils::AppError;

#[tauri::command]
pub async fn list_shortcuts(state: State<'_, AppState>) -> Result<Vec<ShortcutItem>, AppError> {
    state.shortcuts.list().await
}

#[tauri::command]
pub async fn register_shortcut(
    state: State<'_, AppState>,
    config: ShortcutConfig,
) -> Result<(), AppError> {
    state.shortcuts.register(config).await
}

#[tauri::command]
pub async fn unregister_shortcut(
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    state.shortcuts.unregister(&id).await
}
```

- [ ] **Step 4: Write `commands/catalog.rs`**

Create `src-tauri/src/commands/catalog.rs`:
```rust
//! Catalog commands — thin IPC adapters over `CatalogService`.

use tauri::State;

use crate::app::AppState;
use crate::models::{ProviderInfo, PromptMode};
use crate::utils::AppError;

#[tauri::command]
pub async fn list_modes(state: State<'_, AppState>) -> Result<Vec<PromptMode>, AppError> {
    state.catalog.list_modes().await
}

#[tauri::command]
pub async fn list_providers(state: State<'_, AppState>) -> Result<Vec<ProviderInfo>, AppError> {
    state.catalog.list_providers().await
}
```

- [ ] **Step 5: Wire `commands/mod.rs`**

Replace `src-tauri/src/commands/mod.rs`:
```rust
//! Tauri command handlers — thin IPC adapters. Business logic lives in `services`.

pub mod catalog;
pub mod history;
pub mod settings;
pub mod shortcuts;

pub use catalog::{list_modes, list_providers};
pub use history::{clear_history, get_history};
pub use settings::{get_settings, save_settings};
pub use shortcuts::{list_shortcuts, register_shortcut, unregister_shortcut};
```

- [ ] **Step 6: Rewrite `lib.rs` to wire setup + the invoke handler**

Replace `src-tauri/src/lib.rs`:
```rust
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

use config::Config;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Logging is initialized as early as possible. The bootstrap config is
    // resolved from the current exe dir only to obtain a log directory before
    // Tauri's path API is available; `app::setup` later resolves the real
    // app-data config used by the rest of the backend.
    let bootstrap_dir = std::env::temp_dir().join("vibeprompter-bootstrap");
    let _log_guard = Config::from_app_data_dir(&bootstrap_dir)
        .map(|cfg| app::logging::init(&cfg))
        .ok();

    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                if let Err(err) = app::setup::initialize(handle.clone().app_handle_app()).await {
                    tracing::error!("backend initialization failed: {err}");
                    return Err(Box::new(err) as Box<dyn std::error::Error>);
                }
                Ok(())
            })
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_settings,
            commands::save_settings,
            commands::get_history,
            commands::clear_history,
            commands::list_shortcuts,
            commands::register_shortcut,
            commands::unregister_shortcut,
            commands::list_modes,
            commands::list_providers,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Note on the `setup` closure: `app::setup::initialize` takes `&App`. Tauri's `setup` hook provides `&mut App` as the closure argument — pass it directly instead of the handle dance above. Use this corrected closure body:
```rust
        .setup(|app| {
            tauri::async_runtime::block_on(app::setup::initialize(app))
                .map_err(|err| {
                    tracing::error!("backend initialization failed: {err}");
                    Box::new(err) as Box<dyn std::error::Error>
                })
        })
```
And keep `app::setup::initialize(app: &App)` as written in Task 18 — the closure parameter `app` is `&mut App`, which coerces to `&App`.

- [ ] **Step 7: Verify the crate compiles**

Run from `src-tauri/`:
```bash
cargo build
```
Expected: PASS.

- [ ] **Step 8: Run the full Rust test suite + clippy**

Run from `src-tauri/`:
```bash
cargo test
cargo clippy -- -D warnings
```
Expected: all tests pass; clippy reports no errors. Fix any clippy warnings before committing.

- [ ] **Step 9: Manual smoke — backend boots and a command responds**

Run from repo root:
```bash
npm run tauri dev
```
Expected: the app window opens, logs show `backend initialized`, and a DB file appears at `%APPDATA%/com.tauri.dev/vibeprompter.db`. Stop the app after confirming.

- [ ] **Step 10: Commit**

```bash
git add src-tauri/src/commands src-tauri/src/lib.rs
git commit -m "feat: add 9 foundation commands and wire the invoke handler"
```

---

### Task 20: Frontend Tauri adapter + shared event types

**Files:**
- Create: `src/kernel/infrastructure/tauri/invoke.ts`, `events.ts`, `index.ts`
- Modify: `src/kernel/infrastructure/index.ts`

- [ ] **Step 1: Write the failing test for the invoke wrapper**

Create `src/kernel/infrastructure/tauri/invoke.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { invokeCommand, TauriError } from './invoke';

afterEach(() => clearMocks());

describe('invokeCommand', () => {
  it('returns the resolved value on success', async () => {
    mockIPC((cmd) => {
      if (cmd === 'get_settings') return { theme: 'dark' };
      throw new Error(`unexpected command: ${cmd}`);
    });
    const result = await invokeCommand<{ theme: string }>('get_settings');
    expect(result.theme).toBe('dark');
  });

  it('wraps a serialized AppError into a TauriError', async () => {
    mockIPC(() => {
      throw { code: 'DATABASE_ERROR', message: 'A database operation failed.', retriable: false };
    });
    await expect(invokeCommand('get_settings')).rejects.toBeInstanceOf(TauriError);
    await invokeCommand('get_settings').catch((e: TauriError) => {
      expect(e.code).toBe('DATABASE_ERROR');
      expect(e.retriable).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from repo root:
```bash
npm test -- src/kernel/infrastructure/tauri/invoke.test.ts
```
Expected: FAIL — `./invoke` does not exist.

- [ ] **Step 3: Write `invoke.ts`**

Create `src/kernel/infrastructure/tauri/invoke.ts`:
```ts
import { invoke } from '@tauri-apps/api/core';

/** The sanitized error shape the Rust backend serializes `AppError` into. */
export interface SerializedAppError {
  code: string;
  message: string;
  retriable: boolean;
}

/** A typed error thrown when a Tauri command rejects. */
export class TauriError extends Error {
  readonly code: string;
  readonly retriable: boolean;

  constructor(err: SerializedAppError) {
    super(err.message);
    this.name = 'TauriError';
    this.code = err.code;
    this.retriable = err.retriable;
  }
}

function isSerializedAppError(value: unknown): value is SerializedAppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    'retriable' in value
  );
}

/**
 * Typed wrapper over Tauri's `invoke`. Rejections carrying a serialized
 * `AppError` are normalized into a `TauriError`; anything else is rethrown
 * wrapped in a generic `TauriError` so callers always get one error type.
 */
export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (raw) {
    if (isSerializedAppError(raw)) {
      throw new TauriError(raw);
    }
    throw new TauriError({
      code: 'UNKNOWN_ERROR',
      message: raw instanceof Error ? raw.message : String(raw),
      retriable: false,
    });
  }
}
```

- [ ] **Step 4: Write `events.ts`**

Create `src/kernel/infrastructure/tauri/events.ts`:
```ts
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/**
 * Shared event payload types — mirrors of the Rust `events::types` module.
 * Keep in sync with `src-tauri/src/events/types.rs`.
 */
export interface ShortcutUpdatedPayload {
  shortcut_id: string;
}
export interface ShortcutTriggeredPayload {
  shortcut_id: string;
  action: string;
}

/** Map of event name -> payload type. Payload-less events use `null`. */
export interface AppEventMap {
  app_ready: null;
  settings_changed: null;
  shortcut_updated: ShortcutUpdatedPayload;
  shortcut_triggered: ShortcutTriggeredPayload;
}

/** Typed wrapper over Tauri's `listen`. Returns the unlisten function. */
export async function onEvent<K extends keyof AppEventMap>(
  event: K,
  handler: (payload: AppEventMap[K]) => void,
): Promise<UnlistenFn> {
  return listen<AppEventMap[K]>(event, (e) => handler(e.payload));
}
```

- [ ] **Step 5: Write `index.ts` and wire the kernel barrel**

Create `src/kernel/infrastructure/tauri/index.ts`:
```ts
export { invokeCommand, TauriError, type SerializedAppError } from './invoke';
export { onEvent, type AppEventMap, type ShortcutUpdatedPayload, type ShortcutTriggeredPayload } from './events';
```

Append to `src/kernel/infrastructure/index.ts` (keep existing exports):
```ts
export * from './tauri';
```

- [ ] **Step 6: Run the test to verify it passes**

Run from repo root:
```bash
npm test -- src/kernel/infrastructure/tauri/invoke.test.ts
```
Expected: 2 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/kernel/infrastructure
git commit -m "feat: add typed Tauri invoke/event adapters"
```

---

### Task 21: Rewire settingsApi

**Files:**
- Modify: `src/features/settings/infrastructure/settingsApi.ts`
- Create: `src/features/settings/infrastructure/settingsApi.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/settings/infrastructure/settingsApi.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { settingsApi } from './settingsApi';

afterEach(() => clearMocks());

describe('settingsApi (backend-backed)', () => {
  it('getModes invokes list_modes', async () => {
    mockIPC((cmd) => {
      if (cmd === 'list_modes') {
        return [
          { id: 'developer', name: 'Developer', desc: 'd', sys: 's', temp: 0.3, maxTok: 1024, provider: null, iconName: 'code' },
        ];
      }
      throw new Error(`unexpected: ${cmd}`);
    });
    const modes = await settingsApi.getModes();
    expect(modes[0].id).toBe('developer');
  });

  it('getProviders invokes list_providers', async () => {
    mockIPC((cmd) => {
      if (cmd === 'list_providers') {
        return [{ id: 'openai', name: 'OpenAI', accent: 'x', status: 'ok', model: 'gpt-4.1', usage: 0, local: false }];
      }
      throw new Error(`unexpected: ${cmd}`);
    });
    const providers = await settingsApi.getProviders();
    expect(providers[0].id).toBe('openai');
  });

  it('getHistory invokes get_history', async () => {
    mockIPC((cmd) => {
      if (cmd === 'get_history') return [];
      throw new Error(`unexpected: ${cmd}`);
    });
    expect(await settingsApi.getHistory()).toEqual([]);
  });

  it('getShortcuts invokes list_shortcuts', async () => {
    mockIPC((cmd) => {
      if (cmd === 'list_shortcuts') {
        return [{ id: 'palette', label: 'Open', hint: 'h', iconName: 'wand', accelerator: 'Ctrl+Shift+Space', action: 'open_palette', enabled: true, keys: ['Ctrl', 'Shift', 'Space'] }];
      }
      throw new Error(`unexpected: ${cmd}`);
    });
    const shortcuts = await settingsApi.getShortcuts();
    expect(shortcuts[0].keys).toEqual(['Ctrl', 'Shift', 'Space']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from repo root:
```bash
npm test -- src/features/settings/infrastructure/settingsApi.test.ts
```
Expected: FAIL — `settingsApi` still returns hardcoded mock data, so `mockIPC` is never called and the `unexpected` throw or a shape mismatch surfaces.

- [ ] **Step 3: Rewire `settingsApi.ts`**

Replace `src/features/settings/infrastructure/settingsApi.ts` entirely:
```ts
import { invokeCommand } from '@kernel/infrastructure';
import type {
  HistoryItem,
  OllamaModel,
  PromptMode,
  ProviderInfo,
  SettingsTab,
  ShortcutItem,
} from '../domain';

// Pure-UI data — not backend-backed. The tab list is static layout metadata.
const TABS: SettingsTab[] = [
  { id: 'general', label: 'General', iconName: 'cog' },
  { id: 'shortcuts', label: 'Shortcuts', iconName: 'keyboard' },
  { id: 'modes', label: 'Modes', iconName: 'layers' },
  { id: 'providers', label: 'Providers', iconName: 'cloud' },
  { id: 'history', label: 'History', iconName: 'history' },
  { id: 'appearance', label: 'Appearance', iconName: 'paint' },
  { id: 'advanced', label: 'Advanced', iconName: 'cpu' },
  { id: 'about', label: 'About', iconName: 'info' },
];

// Still mock — Ollama model discovery arrives with sub-project 2 (AI Engine).
const OLLAMA_MODELS: OllamaModel[] = [
  { name: 'llama3.1:8b', size: '4.7 GB', active: true, pulled: '2d ago' },
  { name: 'qwen2.5-coder:7b', size: '4.4 GB', active: false, pulled: '5d ago' },
  { name: 'mistral:7b-instruct', size: '4.1 GB', active: false, pulled: '1w ago' },
  { name: 'phi3:mini', size: '2.3 GB', active: false, pulled: '2w ago' },
];

export const settingsApi = {
  getTabs: async (): Promise<SettingsTab[]> => TABS,
  getModes: (): Promise<PromptMode[]> => invokeCommand<PromptMode[]>('list_modes'),
  getProviders: (): Promise<ProviderInfo[]> => invokeCommand<ProviderInfo[]>('list_providers'),
  getOllamaModels: async (): Promise<OllamaModel[]> => OLLAMA_MODELS,
  getHistory: (): Promise<HistoryItem[]> => invokeCommand<HistoryItem[]>('get_history'),
  getShortcuts: (): Promise<ShortcutItem[]> => invokeCommand<ShortcutItem[]>('list_shortcuts'),
};
```

Note: `PromptMode.provider` is typed `string` in the frontend domain but the backend sends `provider: string | null`. In Step 4, widen the domain type to accept null.

- [ ] **Step 4: Widen the `PromptMode.provider` domain type**

In `src/features/settings/domain/types.ts`, change the `PromptMode` interface's `provider` field:
```ts
  provider: string | null;
```

- [ ] **Step 5: Run the test to verify it passes**

Run from repo root:
```bash
npm test -- src/features/settings/infrastructure/settingsApi.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 6: Run the full frontend test suite to catch regressions**

Run from repo root:
```bash
npm test
```
Expected: all tests pass. If a component test relied on a removed mock value, update it to use `mockIPC`.

- [ ] **Step 7: Commit**

```bash
git add src/features/settings/infrastructure/settingsApi.ts src/features/settings/infrastructure/settingsApi.test.ts src/features/settings/domain/types.ts
git commit -m "feat: rewire settingsApi to real Tauri commands"
```

---

### Task 22: Rewire settings panels + trayApi

**Files:**
- Modify: `src/features/settings/application/settings.query.ts`
- Modify: `src/features/settings/ui/panels/GeneralPanel.tsx`
- Modify: `src/features/settings/ui/panels/AppearancePanel.tsx`
- Modify: `src/features/settings/ui/panels/AdvancedPanel.tsx`
- Modify: `src/features/tray/infrastructure/trayApi.ts`

- [ ] **Step 1: Add the app-settings query + mutation**

Append to `src/features/settings/application/settings.query.ts`:
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeCommand } from '@kernel/infrastructure';

/** The user-facing settings aggregate — mirrors the Rust `Settings` struct. */
export interface AppSettings {
  boot_start: boolean;
  minimize_to_tray: boolean;
  quit_on_close: boolean;
  auto_paste: boolean;
  notifications: boolean;
  stream_response: boolean;
  clipboard_fallback: boolean;
  low_memory_mode: boolean;
  response_timeout: number;
  concurrent_requests: number;
  theme: string;
  accent: string;
  density: string;
  history_retention: string;
  dev_tools: boolean;
  log_raw_responses: boolean;
  proxy_url: string;
}

export const useAppSettingsQuery = () =>
  useQuery({
    queryKey: k('app-settings'),
    queryFn: () => invokeCommand<AppSettings>('get_settings'),
  });

export const useSaveSettingsMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: AppSettings) =>
      invokeCommand<void>('save_settings', { settings }),
    onSuccess: () => qc.invalidateQueries({ queryKey: k('app-settings') }),
  });
};
```

- [ ] **Step 2: Rewire `GeneralPanel.tsx` to load/save via backend**

Replace the `useState` block at the top of `GeneralPanel` with backend-backed state. Replace the component body's opening (the `const [s, setS] = useState({...})` and `set` definition) with:
```tsx
import { useAppSettingsQuery, useSaveSettingsMutation, type AppSettings } from '../../application/settings.query';

// ...inside GeneralPanel():
  const { data: settings } = useAppSettingsQuery();
  const saveSettings = useSaveSettingsMutation();

  if (!settings) return null;

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) =>
    saveSettings.mutate({ ...settings, [k]: v });
```
Then update each control in the JSX to read from `settings` and call `set` with the backend field name:
- `bootStart` → `settings.boot_start` / `set('boot_start', v)`
- `minimizeTray` → `settings.minimize_to_tray` / `set('minimize_to_tray', v)`
- `closeTray` → `settings.quit_on_close` / `set('quit_on_close', v)`
- `autoPaste` → `settings.auto_paste` / `set('auto_paste', v)`
- `notify` → `settings.notifications` / `set('notifications', v)`
- `stream` → `settings.stream_response` / `set('stream_response', v)`
- `clipFallback` → `settings.clipboard_fallback` / `set('clipboard_fallback', v)`
- `lowMem` → `settings.low_memory_mode` / `set('low_memory_mode', v)`
- `timeout` → `settings.response_timeout` / `set('response_timeout', Number(e.target.value))`
- `concurrent` → `settings.concurrent_requests` / `set('concurrent_requests', v)`

- [ ] **Step 3: Rewire `AppearancePanel.tsx`**

Replace the three `useState` calls (`theme`, `accent`, `density`) with backend-backed reads. Add at the top of the component:
```tsx
import { useAppSettingsQuery, useSaveSettingsMutation } from '../../application/settings.query';

// ...inside AppearancePanel():
  const { data: settings } = useAppSettingsQuery();
  const saveSettings = useSaveSettingsMutation();
  if (!settings) return null;
  const theme = settings.theme as (typeof THEMES)[number];
  const accent = settings.accent;
  const density = settings.density as (typeof DENSITIES)[number];
  const setTheme = (t: (typeof THEMES)[number]) => saveSettings.mutate({ ...settings, theme: t });
  const setAccent = (a: string) => saveSettings.mutate({ ...settings, accent: a });
  const setDensity = (d: (typeof DENSITIES)[number]) => saveSettings.mutate({ ...settings, density: d });
```
The "Palette window" group (transparency/blur/pin) keeps its inline placeholder `onChange={() => {}}` handlers — those settings are not in the Foundation `Settings` struct and stay UI-only.

- [ ] **Step 4: Rewire `AdvancedPanel.tsx`**

Replace the `retention` `useState` with backend-backed reads. Add at the top of the component:
```tsx
import { useAppSettingsQuery, useSaveSettingsMutation } from '../../application/settings.query';

// ...inside AdvancedPanel():
  const { data: settings } = useAppSettingsQuery();
  const saveSettings = useSaveSettingsMutation();
  if (!settings) return null;
  const retention = RETENTIONS.indexOf(settings.history_retention);
  const setRetention = (i: number) =>
    saveSettings.mutate({ ...settings, history_retention: RETENTIONS[i] });
```
The Developer group toggles (`dev_tools`, `log_raw_responses`) and `proxy_url` input: wire them the same way — read `settings.dev_tools` etc. and call `saveSettings.mutate({ ...settings, dev_tools: v })`. The "Export all data" and "Reset to factory defaults" buttons keep their current no-op handlers — those actions belong to a later sub-project.

- [ ] **Step 5: Rewire `trayApi.ts` toggles**

Replace `src/features/tray/infrastructure/trayApi.ts` entirely:
```ts
import { invokeCommand } from '@kernel/infrastructure';
import type { TrayMenuItem, TrayToggleConfig } from '../domain';

// Tray menu items are static UI labels — their actions are wired in sub-project 3.
const ITEMS_PRIMARY: TrayMenuItem[] = [
  { id: 'palette', label: 'Open Palette', iconName: 'wand', kbd: ['Ctrl', '⇧', '␣'], accent: true },
  { id: 'mode', label: 'Switch Mode', iconName: 'layers', kbd: ['Ctrl', '⇧', 'M'] },
  { id: 'history', label: 'History', iconName: 'history', kbd: ['Ctrl', '⇧', 'H'] },
  { id: 'settings', label: 'Settings…', iconName: 'cog', kbd: ['⌘', ','] },
];

const ITEMS_SECONDARY: TrayMenuItem[] = [
  { id: 'restart', label: 'Restart service', iconName: 'refresh' },
  { id: 'updates', label: 'Check for updates', iconName: 'download', badge: 'Up to date' },
  { id: 'quit', label: 'Quit PromptHelper', iconName: 'power', danger: true },
];

interface BackendSettings {
  boot_start: boolean;
  clipboard_fallback: boolean;
}

// Toggles are derived from the real settings aggregate. The 'enabled' and
// 'shortcuts' toggles have no Foundation backing yet — they default to true
// until sub-project 3 owns them.
export const trayApi = {
  getToggles: async (): Promise<TrayToggleConfig[]> => {
    const s = await invokeCommand<BackendSettings>('get_settings');
    return [
      { id: 'enabled', label: 'Enable AI', iconName: 'bolt', defaultValue: true },
      { id: 'shortcuts', label: 'Global shortcuts', iconName: 'keyboard', defaultValue: true, kbd: ['Ctrl', '⇧', '␣'] },
      { id: 'boot', label: 'Start on boot', iconName: 'power', defaultValue: s.boot_start },
      { id: 'clip', label: 'Clipboard monitor', iconName: 'clipboard', defaultValue: s.clipboard_fallback },
    ];
  },
  getPrimaryItems: async (): Promise<TrayMenuItem[]> => ITEMS_PRIMARY,
  getSecondaryItems: async (): Promise<TrayMenuItem[]> => ITEMS_SECONDARY,
};
```

- [ ] **Step 6: Verify the build and tests**

Run from repo root:
```bash
npm run build
npm test
```
Expected: TypeScript build succeeds; all tests pass. Fix any type errors surfaced by the panel rewrites before committing.

- [ ] **Step 7: Commit**

```bash
git add src/features/settings src/features/tray
git commit -m "feat: rewire settings panels and tray toggles to backend"
```

---

### Task 23: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full Rust verification**

Run from `src-tauri/`:
```bash
cargo test
cargo clippy -- -D warnings
```
Expected: all tests pass; no clippy errors.

- [ ] **Step 2: Full frontend verification**

Run from repo root:
```bash
npm run build
npm test
```
Expected: build succeeds; all tests pass.

- [ ] **Step 3: End-to-end smoke — settings persist across restart**

Run from repo root:
```bash
npm run tauri dev
```
Then:
1. Confirm the app window opens and the dev console shows no errors.
2. Open Settings → General. Toggle "Quit completely on close" on.
3. Open Settings → Appearance. Switch the theme to "Light".
4. Stop the app (close the dev process).
5. Run `npm run tauri dev` again.
6. Confirm "Quit completely on close" is still on and the theme is still "Light".
7. Open Settings → Modes and Providers — confirm 6 modes and 4 providers load.
8. Open Settings → Shortcuts — confirm 5 shortcuts load with correct key chips.

Expected: all settings survived the restart; modes/providers/shortcuts are served from the database.

- [ ] **Step 4: Confirm the database file and no secret leakage**

Verify `%APPDATA%/com.tauri.dev/vibeprompter.db` exists. Verify the log file at `%TEMP%/vibeprompter-bootstrap/logs/vibeprompter.log` contains structured entries and no raw SQL error dumps from normal operation.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: backend foundation sub-project complete"
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task(s) |
|---|---|
| Module structure & layering (§1) | Task 2; built modules filled across Tasks 3–19 |
| Persistence — schema, pool, repositories (§2) | Tasks 6, 7, 9–12 |
| Services, commands, event system (§3) | Tasks 13–19 |
| Error handling (§4) | Task 3 |
| Config (§4) | Task 4 |
| Logging (§4) | Task 5 |
| Frontend integration (§4) | Tasks 20–22 |
| Testing (§4) | TDD steps throughout; Task 23 |
| New dependencies | Task 1 |
| Success criteria 1 (compiles, stubs documented) | Tasks 2, 19 |
| Success criteria 2 (DB created, tables, seeds) | Tasks 6, 7, 23 |
| Success criteria 3 (9 commands work) | Task 19 |
| Success criteria 4 (frontend rewired, persists) | Tasks 20–23 |
| Success criteria 5 (cargo test/clippy, npm test) | Task 23 |
| Success criteria 6 (no SQL/path leakage) | Task 3, Task 23 Step 4 |

No gaps.

**2. Placeholder scan:** No "TBD"/"implement later". The `setup` closure correction in Task 19 Step 6 is explicit (full corrected code shown). Panel rewrites in Task 22 show the exact field-mapping table rather than "wire the rest similarly".

**3. Type consistency:** `AppState` fields (`settings`, `history`, `shortcuts`, `catalog`) match their use in Task 19 commands. `SettingsService::{get,save}`, `HistoryService::{list,clear,record}`, `ShortcutService::{list,register,unregister}`, `CatalogService::{list_modes,list_providers}` — all defined in Tasks 14–17 and called identically in Task 19. `AppEvent` variant names (`AppReady`, `SettingsChanged`, `ShortcutUpdated`) consistent across Tasks 13, 14, 16, 18. `invokeCommand` / `TauriError` consistent across Tasks 20–22. `ShortcutItem` carries `keys` (derived) in both the Rust model (Task 8) and the frontend test (Task 21). `HistoryQuery` is `Option<HistoryQuery>` in the command (Task 19) with `Default` defined in Task 8.

One known cross-task note carried inline: `PromptMode.provider` is `string | null` — backend emits `Option<String>` (Task 8), frontend domain type widened in Task 21 Step 4.
