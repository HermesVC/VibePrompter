-- Workspace-oriented chat modes (snippet + file scopes).

INSERT OR IGNORE INTO prompt_modes
  (id, name, description, system_prompt, temperature, max_tokens,
   provider_override, icon_name, variables, enabled, is_system, is_default,
   sort_order, created_at, updated_at)
VALUES
 ('snippet-editor', 'Snippet editor', 'Edit a code selection strictly within its bounds.',
   'You edit code snippets. Output ONLY the revised snippet — no explanation, no markdown fences, no text outside the snippet.',
   0.2, 4096, NULL, 'code', '{}', 1, 1, 0, -3,
   '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
 ('file-assistant', 'File assistant', 'Work on a single file or a line range.',
   'You assist with editing source files. When asked to rewrite a region, return ONLY the updated file body for that region unless a full-file rewrite is explicitly requested.',
   0.3, 8192, NULL, 'file', '{}', 1, 1, 0, -4,
   '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
