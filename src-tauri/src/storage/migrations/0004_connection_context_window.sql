-- Per-connection context window size for the session usage ring in chat/refine UI.
-- 0 = unknown — the indicator stays hidden until the user sets a limit.

ALTER TABLE provider_connections ADD COLUMN context_window_size INTEGER NOT NULL DEFAULT 0;
