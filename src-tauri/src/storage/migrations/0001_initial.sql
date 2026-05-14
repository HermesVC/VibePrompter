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
