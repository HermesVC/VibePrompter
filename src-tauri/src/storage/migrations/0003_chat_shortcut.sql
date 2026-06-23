-- Seed the persistent chat window shortcut for existing installs.

INSERT OR IGNORE INTO shortcuts (id, label, hint, icon_name, accelerator, action, enabled, sort_order, updated_at) VALUES
 ('chat', 'Open chat', 'Talk directly with your LLM.', 'mail', 'Ctrl+Alt+C', 'open_chat', 1, 5, '2026-01-01T00:00:00Z');
