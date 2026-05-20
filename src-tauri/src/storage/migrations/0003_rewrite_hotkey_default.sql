-- Move the default Rewrite hotkey from Ctrl+Alt+Space to Ctrl+Alt+F.
-- Space-bar binding conflicted with too many common app shortcuts and was
-- prone to misfires when the user was typing in some apps.
--
-- Only rows that still hold the previous default get updated — users who
-- customized their binding to anything else keep their choice.
UPDATE shortcuts
SET accelerator = 'Ctrl+Alt+F',
    updated_at = '2026-05-20T00:00:00Z'
WHERE id = 'rewrite'
  AND accelerator = 'Ctrl+Alt+Space';
