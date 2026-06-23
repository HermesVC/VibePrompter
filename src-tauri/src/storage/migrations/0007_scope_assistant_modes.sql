-- Scope modes: answer questions by default; code-only output on explicit edit requests.

UPDATE prompt_modes
SET system_prompt = 'You assist with code snippets attached as context. Answer questions in plain language. When the user explicitly asks to edit, fix, or rewrite the snippet, output ONLY the revised snippet — no explanation or markdown fences.',
    description = 'Snippet context — explain or edit on request.',
    updated_at = '2026-06-23T00:00:00Z'
WHERE id = 'snippet-editor';

UPDATE prompt_modes
SET system_prompt = 'You assist with files attached as context. Answer questions in plain language. When the user explicitly asks to rewrite a region, return ONLY the updated file body for that region.',
    description = 'File context — explain or edit on request.',
    updated_at = '2026-06-23T00:00:00Z'
WHERE id = 'file-assistant';
