-- VibePrompter foundation schema (consolidated).
--
-- This file replaces the previous 13-migration chain (0001 initial + 0002
-- seed + 0003–0013 incremental schema/data changes) that was squashed
-- during the development phase. The final shape of every table — including
-- every column added by later ALTERs — lives here, and the seed data has
-- been pre-cleaned (no dead settings keys, no stale shortcut accelerators).

-- ──────────────────────────────────────────────────────────────────── tables

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
    tags              TEXT NOT NULL DEFAULT '',
    enabled           INTEGER NOT NULL DEFAULT 1,
    is_system         INTEGER NOT NULL DEFAULT 0,
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
    input_tokens   INTEGER NOT NULL DEFAULT 0,
    output_tokens  INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE provider_connections (
    id            TEXT PRIMARY KEY NOT NULL,
    label         TEXT NOT NULL,
    kind          TEXT NOT NULL,                     -- 'openai' | 'anthropic'
    base_url      TEXT NOT NULL,
    api_key       TEXT NOT NULL DEFAULT '',
    default_model TEXT NOT NULL DEFAULT '',
    is_default    INTEGER NOT NULL DEFAULT 0,
    extra_headers TEXT NOT NULL DEFAULT '',
    last_used_at  TEXT NOT NULL DEFAULT '',
    notes         TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
CREATE INDEX idx_provider_connections_default
    ON provider_connections (is_default);

-- ────────────────────────────────────────────────────────────────────── seed

INSERT OR IGNORE INTO providers (id, display_name, enabled, default_model, base_url, extra, created_at, updated_at) VALUES
 ('openai',    'OpenAI',        1, 'gpt-4.1',                       NULL,                     '{"accent":"var(--openai)","local":false}',    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('anthropic', 'Anthropic',     1, 'claude-3-5-sonnet-20241022',    NULL,                     '{"accent":"var(--anthropic)","local":false}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('gemini',    'Google Gemini', 1, 'gemini-2.0-pro',                NULL,                     '{"accent":"var(--gemini)","local":false}',    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('ollama',    'Ollama',        1, 'llama3.1:8b',                   'http://localhost:11434', '{"accent":"var(--ollama)","local":true}',     '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

-- Prompt modes: 2 built-in (grammar, summarize) + 6 user-editable seeds.
-- Built-ins sit at the top via negative sort_order and have is_system=1 so
-- the UI hides Rename/Delete and the repo refuses delete attempts.
INSERT OR IGNORE INTO prompt_modes
  (id, name, description, system_prompt, temperature, max_tokens,
   provider_override, icon_name, tags, enabled, is_system, is_default,
   sort_order, created_at, updated_at)
VALUES
 ('grammar',   'Grammar',       'Fix grammar, spelling, and punctuation without changing meaning.',
   'You are a meticulous copy editor. Correct grammar, spelling, and punctuation in the user''s text. Preserve meaning, tone, voice, and formatting exactly. Do not rewrite for style. Reply with ONLY the corrected text — no preamble, no explanation, no quotes.',
   0.2, 2048, NULL, 'pen',       'writing,system', 1, 1, 0, -2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('summarize', 'Summarize',     'Tight bulleted summary of the most important points.',
   'Summarize the user''s text as a tight bulleted list of the most important points. One short bullet per idea. Preserve every concrete fact. No preamble, no closing remarks.',
   0.3, 1024, NULL, 'summarize', 'utility,system', 1, 1, 0, -1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('developer', 'Developer',     'Improves technical clarity for developers',
   'You are a senior software engineer. Rewrite the input to be technically precise, unambiguous, and idiomatic. Preserve all code identifiers exactly. Prefer active voice. Keep it concise — do not add commentary.',
   0.3, 1024, NULL, 'code',      'code',           1, 0, 1,  0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('email',     'Email',         'Professional email reply',
   'You write clear, courteous business emails. Match the tone of the source message. Open with a one-line greeting, deliver the message in 2-3 short paragraphs, close warmly.',
   0.5,  800, NULL, 'mail',      'writing',        1, 0, 0,  1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('friendly',  'Friendly',      'Warm, casual tone',
   'Rewrite the input to sound like a thoughtful friend. Use contractions, light humor where it fits, and keep it warm. Avoid formality.',
   0.7,  600, NULL, 'friendly',  'writing',        1, 0, 0,  2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('concise',   'Concise',       'Tighter, fewer words',
   'Cut the input to its essential message in 50% or fewer words. Preserve every concrete fact. No filler.',
   0.2,  400, NULL, 'shorten',   'writing,utility', 1, 0, 0,  3, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('technical', 'Technical',     'Academic and formal',
   'Rewrite in academic register. Use precise terminology. Hedge claims appropriately. Cite implied premises explicitly.',
   0.3, 1200, NULL, 'formal',    '',               1, 0, 0,  4, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('docs',      'Documentation', 'API & technical docs',
   'You write developer documentation. Lead with what the thing does, then how to use it. Use code fences for snippets. Avoid marketing language.',
   0.2, 1500, NULL, 'text',      'writing,utility', 1, 0, 0,  5, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');

-- Global shortcuts. Accelerators reflect the current defaults (formerly
-- adjusted by migration 0010).
INSERT OR IGNORE INTO shortcuts (id, label, hint, icon_name, accelerator, action, enabled, sort_order, updated_at) VALUES
 ('palette', 'Open Command Palette', 'The main entry point.',      'wand',      'Ctrl+Alt+V',     'open_palette',      1, 0, '2026-01-01T00:00:00Z'),
 ('rewrite', 'Rewrite selection',    'Improve writing in place.',  'pen',       'Ctrl+Alt+Space', 'rewrite_selection', 1, 1, '2026-01-01T00:00:00Z'),
 ('grammar', 'Fix grammar',          'Quick grammar pass.',        'text',      'Ctrl+Alt+G',     'fix_grammar',       1, 2, '2026-01-01T00:00:00Z'),
 ('summary', 'Quick summarize',      'Compress to bullets.',       'summarize', 'Ctrl+Alt+S',     'summarize',         1, 3, '2026-01-01T00:00:00Z'),
 ('modes',   'Toggle modes',         'Cycle the active mode.',     'layers',    'Ctrl+Alt+M',     'mode_switch',       1, 4, '2026-01-01T00:00:00Z');

-- Default settings. Dead keys (`auto_paste`, `clipboard_fallback`,
-- `low_memory_mode`, `concurrent_requests`) that previous migrations dropped
-- are simply not seeded here.
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
 ('boot_start',         'true',      '2026-01-01T00:00:00Z'),
 ('minimize_to_tray',   'true',      '2026-01-01T00:00:00Z'),
 ('quit_on_close',      'false',     '2026-01-01T00:00:00Z'),
 ('notifications',      'true',      '2026-01-01T00:00:00Z'),
 ('stream_response',    'true',      '2026-01-01T00:00:00Z'),
 ('response_timeout',   '30',        '2026-01-01T00:00:00Z'),
 ('theme',              '"light"',   '2026-01-01T00:00:00Z'),
 ('accent',             '"violet"',  '2026-01-01T00:00:00Z'),
 ('density',            '"regular"', '2026-01-01T00:00:00Z'),
 ('history_retention',  '"30d"',     '2026-01-01T00:00:00Z'),
 ('dev_tools',          'false',     '2026-01-01T00:00:00Z'),
 ('log_raw_responses',  'false',     '2026-01-01T00:00:00Z'),
 ('proxy_url',          '""',        '2026-01-01T00:00:00Z');
