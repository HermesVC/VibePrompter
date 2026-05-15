# VibePrompter — Sub-project 1: Backend Foundation — Design

**Date:** 2026-05-14
**Status:** Approved (design); pending implementation plan
**Scope:** Sub-project 1 of 3 in the VibePrompter backend build

---

## Context

VibePrompter is a Windows desktop AI productivity assistant (Tauri v2 + Rust backend +
React 19 frontend). The full product spec describes a system-wide AI command palette —
"Raycast for Windows" — with global shortcuts, clipboard automation, multi-provider LLM
integration, system tray, and overlay windows.

**Current state of the repo:**

- **Frontend:** a fully built React 19 UI (`command-palette`, `settings`, `overlay-mini`,
  `tray`, `onboarding`, `home` features) following a clean feature-sliced architecture.
  Every feature talks to a **mock API module** (`paletteApi`, `settingsApi`, `trayApi`,
  `overlayApi`, …) that returns hardcoded sample data.
- **Backend:** a bare Tauri v2 skeleton — `src-tauri/src/lib.rs` only registers
  `tauri-plugin-log`. No commands, no modules, no database.
- `npm run tauri dev` was fixed earlier this session (the `tauri` script was missing from
  `package.json`).

## Scope decomposition

The full product spec describes multiple independent subsystems, each large enough for its
own design → plan → implement cycle. It was decomposed into three sub-projects with
downward dependency flow:

1. **Backend Foundation** *(this document)* — module structure, typed error system,
   config, structured logging, SQLite persistence (sqlx + migrations + repositories), and
   the Tauri event bus. After this sub-project, settings/history/shortcut/catalog data is
   served from a real database and the foundation-era frontend APIs are wired to it.
2. **AI Engine** — secure credential storage (keyring), the `AiProvider` trait + 4
   providers (OpenAI, Anthropic, Gemini, Ollama) with streaming/cancellation/retry, prompt
   mode CRUD, and the in-window AI commands.
3. **OS Integration & the Magic Workflow** — global shortcuts, clipboard automation
   (Ctrl+C → AI → Ctrl+V with rollback), system tray, overlay windows, background
   lifecycle (start minimized, autostart, survive window close).

Sub-projects 2 and 3 each get their own spec, plan, and implementation cycle.

## Decisions captured during brainstorming

| Decision | Choice |
|---|---|
| Decomposition | 3 sub-projects; build Foundation first |
| Frontend integration scope | Rewire **all** foundation-era mock APIs to real `invoke` calls |
| sqlx query style | **Runtime** queries (`query`/`query_as`) — no `DATABASE_URL` / `.sqlx` cache |
| DB schema | Create **all 6 tables** in Foundation's initial migration |
| Module tree | Scaffold the **full 15-directory tree**; unused dirs get documented stubs |
| Composition architecture | **Approach A** — single `AppState` container + service layer |

---

## Section 1 — Module structure & layering

Full tree scaffolded under `src-tauri/src/`. Modules Foundation **builds** are marked ●;
modules **stubbed** (a `mod.rs` with a doc-comment naming its purpose and owning
sub-project) are marked ○.

```
src-tauri/src/
├── main.rs                    ● entry → app_lib::run()
├── lib.rs                     ● run(): init logging, build Tauri builder, register
│                                plugins, call app::setup
├── app/                       ●
│   ├── mod.rs                 ●
│   ├── setup.rs               ●  COMPOSITION ROOT — build Config → Pool → EventBus →
│   │                              AppState, run migrations, seed
│   ├── state.rs               ●  AppState { db: Pool, events: EventBus, config: Config }
│   └── lifecycle.rs           ○  (sub-project 3: tray / background lifecycle)
├── commands/                  ●  thin Tauri command handlers
│   ├── mod.rs                 ●  re-exports + the single invoke_handler! list
│   ├── settings.rs            ●  get_settings, save_settings
│   ├── history.rs             ●  get_history, clear_history
│   ├── shortcuts.rs           ●  list_shortcuts, register_shortcut, unregister_shortcut
│   └── catalog.rs             ●  list_modes, list_providers
├── services/                  ●  business logic
│   ├── mod.rs                 ●
│   ├── settings_service.rs    ●
│   ├── history_service.rs     ●
│   ├── shortcut_service.rs    ●
│   └── catalog_service.rs     ●  read-only access to seeded prompt_modes + providers
├── models/                    ●  domain structs + serde DTOs
│   ├── mod.rs                 ●
│   ├── settings.rs            ●
│   ├── history.rs             ●
│   ├── shortcut.rs            ●
│   ├── prompt_mode.rs         ●  struct + read DTO (write path → sub-project 2)
│   ├── provider.rs            ●  struct + read DTO (write path → sub-project 2)
│   └── analytics.rs           ○  struct only (write path → sub-project 3)
├── storage/                   ●
│   ├── mod.rs                 ●
│   ├── pool.rs                ●  create SqlitePool, run embedded migrations + seeds
│   ├── migrations/            ●  versioned .sql files (embedded via sqlx::migrate!())
│   │   ├── 0001_initial.sql   ●  all 6 tables + indexes
│   │   └── 0002_seed.sql      ●  seed providers, prompt_modes, shortcuts, settings
│   └── repositories/          ●
│       ├── mod.rs             ●
│       ├── settings_repo.rs   ●
│       ├── history_repo.rs    ●
│       ├── shortcut_repo.rs   ●
│       ├── mode_repo.rs       ●  read-only (list, get)
│       └── provider_repo.rs   ●  read-only (list)
├── events/                    ●
│   ├── mod.rs                 ●
│   ├── bus.rs                 ●  EventBus — typed wrapper over Tauri AppHandle emit
│   └── types.rs               ●  AppEvent enum — all 9 spec events typed now
├── config/                    ●
│   ├── mod.rs                 ●
│   └── settings.rs            ●  Config struct, app data dir paths, load/defaults
├── utils/                     ●
│   ├── mod.rs                 ●
│   └── error.rs               ●  AppError (thiserror), AppResult, frontend-safe Serialize
├── security/                  ○  (sub-project 2: keyring credential storage)
├── providers/                 ○  (sub-project 2: AiProvider trait + implementations)
├── prompts/                   ○  (sub-project 2: prompt mode CRUD + presets engine)
├── shortcuts/                  ○  (sub-project 3: OS-level global-hotkey registration)
├── clipboard/                 ○  (sub-project 3: arboard + enigo automation)
├── tray/                      ○  (sub-project 3: system tray)
└── overlay/                   ○  (sub-project 3: overlay window management)
```

### Layering rule

Enforced by what each layer is allowed to import:

```
commands  →  services  →  storage/repositories  →  SqlitePool
```

- **Commands** never touch SQL and never contain business logic.
- **Repositories** own all SQL; they never emit events and never reference Tauri types.
- **Services** hold business logic and orchestrate repositories + the event bus.
- `models/` is shared by all layers. `events/`, `config/`, `utils/` are cross-cutting.

### "Shortcut" naming clarification

Three distinct "shortcut" concerns live at different layers:

- `commands/shortcuts.rs` — Tauri command handlers.
- `services/shortcut_service.rs` — business logic + DB-backed shortcut config.
- `shortcuts/` (stubbed) — OS-level global-hotkey registration, owned by sub-project 3.

Foundation's `register_shortcut` command **persists a shortcut config row only**. Binding
the accelerator to the OS is sub-project 3's responsibility.

---

## Section 2 — Persistence layer

### Schema

`0001_initial.sql` creates all 6 tables and their indexes. `0002_seed.sql` seeds defaults
using `INSERT OR IGNORE` (idempotent). Both files are embedded via `sqlx::migrate!()` and
run at startup.

| Table | Shape | Foundation use |
|---|---|---|
| **settings** | `key TEXT PRIMARY KEY, value TEXT NOT NULL (JSON), updated_at TEXT` — key-value so new settings need no migration | `get_settings` reads all rows → typed `Settings` struct; `save_settings` writes the struct back. Seeded with General/Appearance/Advanced panel defaults |
| **providers** | `id TEXT PK, display_name TEXT, enabled INTEGER, default_model TEXT, base_url TEXT NULL, extra TEXT (JSON), created_at TEXT, updated_at TEXT` — config only, **no API keys** (keyring, sub-project 2) | Seeded with the 4 providers; read-only this sub-project |
| **prompt_modes** | `id TEXT PK, name TEXT, description TEXT, system_prompt TEXT, temperature REAL, max_tokens INTEGER, provider_override TEXT NULL, icon_name TEXT, is_default INTEGER, sort_order INTEGER, created_at TEXT, updated_at TEXT` | Seeded with the 6 preset modes; read path wired, CRUD in sub-project 2 |
| **history** | `id INTEGER PK AUTOINCREMENT, mode_name TEXT, icon_name TEXT, provider_label TEXT, source_text TEXT, output_text TEXT, latency_ms INTEGER, favorite INTEGER DEFAULT 0, created_at TEXT` | `get_history`, `clear_history`. `id` is numeric to match the frontend `HistoryItem.id: number` |
| **shortcuts** | `id TEXT PK, label TEXT, hint TEXT, icon_name TEXT, accelerator TEXT, action TEXT, enabled INTEGER DEFAULT 1, sort_order INTEGER, updated_at TEXT` | Seeded with the 5 defaults. `accelerator` (e.g. `"Ctrl+Shift+Space"`) maps to the frontend `keys: string[]` |
| **analytics** | `id INTEGER PK AUTOINCREMENT, event_type TEXT, payload TEXT (JSON), created_at TEXT` | Table created now; write path is sub-project 3 |

### Connection pool — `storage/pool.rs`

`SqlitePool` built with `SqliteConnectOptions`:

- `create_if_missing(true)`
- **WAL** journal mode + `synchronous = NORMAL` — concurrency and the performance priority
- `foreign_keys = ON`
- a busy-timeout
- small `max_connections` (~5 — desktop app)

The DB file lives at the Tauri-resolved app data dir
(`%APPDATA%/com.tauri.dev/vibeprompter.db`). Migrations + seeds run immediately after the
pool is created, inside `app::setup`.

### Repositories — `storage/repositories/`

One struct per table, each holding a cheap-cloned `SqlitePool` (the pool is `Arc` inside).
All SQL lives here, written with **runtime** `sqlx::query` / `query_as`. Methods are
`async` and return `AppResult<T>`. Repositories never emit events and never reference Tauri
types.

- `SettingsRepo` — `get_all()`, `upsert(key, value)`
- `HistoryRepo` — `list(limit, offset)`, `insert(record)`, `clear()`, `purge_older_than(ts)`
- `ShortcutRepo` — `list()`, `get(id)`, `upsert(config)`, `delete(id)`
- `ModeRepo` — `list()`, `get(id)` *(read-only)*
- `ProviderRepo` — `list()` *(read-only)*

---

## Section 3 — Services, commands & event system

### Service layer — `services/`

Constructor-injected with the repositories they need plus the `EventBus`. Wired once in
`app::setup`.

- **`SettingsService`** — `get() → Settings`, `save(Settings)`. Owns the `Settings` struct
  ↔ key-value rows mapping; emits `settings_changed` on save.
- **`HistoryService`** — `list(query) → Vec<HistoryItem>`, `clear()`. (`record(...)` is
  added in sub-project 2.)
- **`ShortcutService`** — `list()`, `register(ShortcutConfig)` (upsert + emit
  `shortcut_updated`), `unregister(id)`. "Register" persists only; OS binding is
  sub-project 3.
- **`CatalogService`** — read-only access to the seeded `prompt_modes` + `providers`
  tables (`list_modes()`, `list_providers()`). This is what lets the frontend's
  `getModes` / `getProviders` be rewired now. Write paths and full services for these two
  tables arrive in sub-project 2.

### Commands — `commands/`

Of the 14 backend APIs in the product spec, Foundation owns **9**:

`get_settings`, `save_settings`, `list_modes`, `list_providers`, `get_history`,
`clear_history`, `list_shortcuts`, `register_shortcut`, `unregister_shortcut`.

Deferred: `create_mode` / `update_mode` / `delete_mode`, `invoke_ai`,
`cancel_ai_request`, `validate_provider` (sub-project 2); `test_clipboard_flow`
(sub-project 3).

Each command is thin: `#[tauri::command] async fn` taking `State<'_, AppState>`,
deserialize input → one service call → return `Result<T, AppError>`. All commands are
registered in a single `invoke_handler!` list in `commands/mod.rs`.

### Event system — `events/`

- **`types.rs`** — an `AppEvent` enum with **all 9 product-spec events** as typed variants
  (`shortcut_triggered`, `ai_request_started`, `ai_stream_chunk`, `ai_request_completed`,
  `ai_request_failed`, `mode_changed`, `provider_changed`, `clipboard_operation`,
  `overlay_opened`) plus Foundation's own (`app_ready`, `settings_changed`,
  `shortcut_updated`). Each variant carries a typed payload struct. This is the single
  source of truth for the whole event contract.
- **`bus.rs`** — `EventBus` wraps `AppHandle`; `emit(AppEvent)` maps each variant to a
  stable event-name string and emits the serialized payload.
- Foundation **emits** `app_ready`, `settings_changed`, `shortcut_updated`. The other
  variants are typed-but-dormant until sub-projects 2/3 fill them.
- The frontend mirrors these payload types in a shared TS file so `listen()` calls are
  type-safe.

---

## Section 4 — Error handling, config, logging, frontend integration & testing

### Error handling — `utils/error.rs`

- `AppError` enum via `thiserror`, with the **full taxonomy from product-spec §12 defined
  now** so the type is stable: `Database`, `Migration`, `Config`, `Io`, `Serialization`,
  `NotFound`, `Validation`, plus dormant `Provider`, `Network`, `Clipboard`, `Shortcut`,
  `Permission` variants for later sub-projects.
- `AppResult<T> = Result<T, AppError>`.
- **Frontend-safe by construction:** `AppError` implements `Serialize` producing
  `{ code, message, retriable }` — a sanitized shape. The verbose `Display` impl (SQL
  text, file paths) goes only to `tracing` logs, never across the IPC boundary. This
  satisfies both "frontend-safe messages" and "sanitize logs".
- The `retriable` flag seeds the retry strategy that later sub-projects build on.

### Config — `config/`

A `Config` struct resolved once at startup from Tauri's path resolver: `app_data_dir`,
`db_path`, `log_dir`, `debug_mode`, `log_level`. This is *process / environment* config,
explicitly distinct from the user-facing `settings` table. `Config::load(app_handle) →
AppResult<Config>`.

### Logging

Replace the bare `tauri-plugin-log` with a single `tracing` stack:

- `tracing-subscriber` + `tracing-appender` — a rolling daily file in `log_dir`, plus a
  console layer when `debug_mode` is set.
- Initialized first thing in `lib.rs::run()`, before anything else.
- `#[tracing::instrument]` on service methods provides the "performance timing" the
  product spec asks for.

### Frontend integration — rewire all foundation-era APIs

- Add `@tauri-apps/api` to the frontend dependencies.
- Create a `kernel/infrastructure/tauri/` adapter: a typed `invoke<T>()` wrapper that maps
  the serialized `AppError` shape into a frontend error type, and an `onEvent()` wrapper
  over `listen()`.
- Rewire the mock API **bodies** to real commands (the `*Api.ts` files stay as the seam —
  only their implementations change):
  - `settingsApi.getModes` → `list_modes`, `getProviders` → `list_providers`,
    `getHistory` → `get_history`, `getShortcuts` → `list_shortcuts`.
  - General / Appearance / Advanced panels load via `get_settings` and save (debounced)
    via `save_settings`, through a TanStack Query hook + mutation.
  - `trayApi` toggles that correspond to settings map to `get_settings` / `save_settings`.
- **Stays mock** until sub-projects 2/3: `settingsApi.getOllamaModels`,
  `paletteApi.getSampleResponse`, tray menu actions. `settingsApi.getTabs` and
  `paletteApi.getQuickActions` stay static (pure UI data).
- Backend DTO return types are shaped to **match the existing TS interfaces exactly**
  (`HistoryItem`, `ProviderInfo`, `PromptMode`, `ShortcutItem`). `#[serde(rename)]` on the
  Rust DTOs bridges Rust snake_case to the TS field names (e.g. `sys`, `maxTok`, `temp`).
  The rewire is a body swap, not a frontend refactor.

### Testing

- **Rust**
  - Repositories tested against an in-memory SQLite pool (`sqlite::memory:`) with
    migrations applied — real SQL, no mocks.
  - Services tested by constructing them with a test pool and a no-op `EventBus`.
  - A migration test asserts `migrate!()` runs clean on a fresh DB, is idempotent, and
    that the seed rows are present.
  - A couple of `tauri::test` mock-runtime integration tests cover the `get_settings` /
    `save_settings` happy path.
- **Frontend**
  - Rewired API modules tested with `@tauri-apps/api`'s `mockIPC`.
  - Existing component tests keep passing because the API shapes are unchanged.
- **Verification gate** — `cargo test`, `cargo clippy`, `npm test`, and a manual
  `npm run tauri dev` smoke check: a settings round-trip persists across an app restart.

---

## New dependencies

### `src-tauri/Cargo.toml`

- `tokio` (with `rt-multi-thread`, `macros`, `sync`, `time`)
- `sqlx` (with `runtime-tokio`, `sqlite`, `migrate`)
- `tracing`, `tracing-subscriber`, `tracing-appender`
- `thiserror`, `anyhow`
- `serde` / `serde_json` (already present)
- (removed) `tauri-plugin-log`

### Frontend `package.json`

- `@tauri-apps/api`

---

## Out of scope (deferred to later sub-projects)

- Secure credential storage / keyring — sub-project 2
- `AiProvider` trait + OpenAI / Anthropic / Gemini / Ollama implementations — sub-project 2
- Prompt mode CRUD, import/export, presets engine — sub-project 2
- `invoke_ai`, `cancel_ai_request`, `validate_provider` commands, streaming — sub-project 2
- Global shortcut OS registration, conflict detection — sub-project 3
- Clipboard automation (arboard + enigo), `test_clipboard_flow` — sub-project 3
- System tray, overlay windows — sub-project 3
- Background lifecycle: start minimized, autostart, survive window close — sub-project 3
- Analytics write path — sub-project 3
- Provider fallback, rate limiting — sub-project 2 polish

## Success criteria

1. `src-tauri` compiles with the full 15-directory module tree; stubbed modules carry
   doc-comments naming their owning sub-project.
2. On first launch the SQLite DB is created, all 6 tables exist, and seed data is present;
   on subsequent launches the migration runner is a clean no-op.
3. The 9 Foundation commands work end-to-end against the real database.
4. The frontend's foundation-era mock APIs are rewired to real `invoke` calls; the
   Settings panels load from and persist to SQLite, surviving an app restart.
5. `cargo test`, `cargo clippy`, and `npm test` all pass.
6. `AppError` never leaks SQL text or file paths across the IPC boundary.
