-- Optional chat mode for scoped multi-file work (pairs with Developer modifier).

INSERT OR IGNORE INTO prompt_modes
  (id, name, description, system_prompt, temperature, max_tokens,
   provider_override, icon_name, variables, enabled, is_system, is_default,
   sort_order, created_at, updated_at)
VALUES
 ('chat-developer', 'Developer', 'Scoped workspace development. Enable the Developer modifier for PLAN.md step-by-step workflow.',
   '- Answer in Russian unless the user writes in another language.
- You work inside the attached workspace scope (file, folder, or tree). Refer to paths from scope.
- For questions: answer in plain language. For code changes: use file fences with workspace-relative paths.
- Large multi-step features: user enables Developer modifier — then follow the PLAN.md workflow injected into this prompt.',
   0.35, 8192, NULL, 'code', '{}', 1, 0, 0, 5,
   '2026-06-23T00:00:00Z', '2026-06-23T00:00:00Z');
