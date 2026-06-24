import { useCallback, useEffect, useState } from 'react';
import { Group, SettingRow } from '@shared/ui/SettingsLayout';
import { I } from '@shared/ui';
import {
  DEFAULT_WORKSPACE_SETTINGS,
  type ApplyPolicy,
  type PatchPolicy,
  type WorkspaceSettings,
} from '@shared/lib/chatContext';
import {
  getWorkspaceSettings,
  pickWorkspaceRoot,
  saveWorkspaceSettings,
} from '@shared/lib/workspaceApi';

const POLICIES: { id: ApplyPolicy; label: string; hint: string }[] = [
  {
    id: 'always_ask',
    label: 'Always ask',
    hint: 'Confirm every file write',
  },
  {
    id: 'always_apply',
    label: 'Always apply',
    hint: 'Auto-apply when not denied',
  },
  {
    id: 'allow_list_only',
    label: 'Allow-list only',
    hint: 'Writes only to allowed paths',
  },
];

const PATCH_POLICIES: { id: PatchPolicy; label: string; hint: string }[] = [
  {
    id: 'strict',
    label: 'Strict (minimal patches)',
    hint: 'Reject oversized apply_patch edits — agent must narrow old_text',
  },
  {
    id: 'warn',
    label: 'Warn only',
    hint: 'Apply large patches but return size warnings',
  },
  {
    id: 'off',
    label: 'Off',
    hint: 'No size limits on apply_patch',
  },
];

function linesToList(s: string): string[] {
  return s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
}

function listToLines(arr: string[]): string {
  return arr.join('\n');
}

export function WorkspacePanel() {
  const [draft, setDraft] = useState<WorkspaceSettings>(DEFAULT_WORKSPACE_SETTINGS);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWorkspaceSettings()
      .then(setDraft)
      .catch(() => setDraft(DEFAULT_WORKSPACE_SETTINGS));
  }, []);

  const update = useCallback((patch: Partial<WorkspaceSettings>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
  }, []);

  const save = useCallback(async () => {
    setError(null);
    try {
      await saveWorkspaceSettings(draft);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [draft]);

  const browseRoot = useCallback(async () => {
    const path = await pickWorkspaceRoot();
    if (path) update({ workspaceRoot: path });
  }, [update]);

  return (
    <div className="p-5 max-w-[640px]">
      <h2 className="m-0 mb-1 text-[15px] font-semibold text-fg-strong">Workspace</h2>
      <p className="m-0 mb-5 text-[12px] text-fg-mute">
        Root folder for file / workspace scopes in Chat. Paths stay inside this root on all platforms.
      </p>

      <Group title="Root">
        <SettingRow
          icon={<I.code size={14} />}
          label="Workspace folder"
          hint="Project root for file tools and scoped chat"
          control={
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                value={draft.workspaceRoot}
                onChange={(e) => update({ workspaceRoot: e.target.value })}
                placeholder="E:\Projects\my-app"
                style={inputStyle}
              />
              <button type="button" onClick={browseRoot} style={smallBtn}>
                Browse
              </button>
            </div>
          }
        />
      </Group>

      <Group title="Apply policy">
        {POLICIES.map((p) => (
          <SettingRow
            key={p.id}
            label={p.label}
            hint={p.hint}
            control={
              <input
                type="radio"
                name="applyPolicy"
                checked={draft.applyPolicy === p.id}
                onChange={() => update({ applyPolicy: p.id })}
              />
            }
          />
        ))}
      </Group>

      <Group title="Patch size (apply_patch)">
        {PATCH_POLICIES.map((p) => (
          <SettingRow
            key={p.id}
            label={p.label}
            hint={p.hint}
            control={
              <input
                type="radio"
                name="patchPolicy"
                checked={(draft.patchPolicy ?? 'strict') === p.id}
                onChange={() => update({ patchPolicy: p.id })}
              />
            }
          />
        ))}
        <SettingRow
          label="Max old_text lines"
          hint="Per edit in strict/warn mode (default 15)"
          control={
            <input
              type="number"
              min={1}
              max={200}
              value={draft.patchMaxLines ?? 15}
              onChange={(e) =>
                update({ patchMaxLines: Math.max(1, parseInt(e.target.value, 10) || 15) })
              }
              style={{ ...inputStyle, width: 72 }}
            />
          }
        />
      </Group>

      <Group title="Semantic memory">
        <SettingRow
          label="LLM turn summary"
          hint="After tool loop, extract short [bug]/[decision] bullets into vector memory (uses your connection)"
          control={
            <input
              type="checkbox"
              checked={draft.memoryLlmSummarize !== false}
              onChange={(e) => update({ memoryLlmSummarize: e.target.checked })}
            />
          }
        />
      </Group>

      <Group title="Allow list">
        <SettingRow
          label="Allowed directories"
          hint="One per line, relative to workspace root"
          control={
            <textarea
              rows={3}
              value={listToLines(draft.allowDirs)}
              onChange={(e) => update({ allowDirs: linesToList(e.target.value) })}
              style={textareaStyle}
              placeholder="service/lang/"
            />
          }
        />
        <SettingRow
          label="Allowed globs"
          hint="e.g. service/**/*.php"
          control={
            <textarea
              rows={3}
              value={listToLines(draft.allowGlobs)}
              onChange={(e) => update({ allowGlobs: linesToList(e.target.value) })}
              style={textareaStyle}
            />
          }
        />
        <SettingRow
          label="Allowed extensions"
          hint="Including the dot"
          control={
            <textarea
              rows={2}
              value={listToLines(draft.allowExtensions)}
              onChange={(e) => update({ allowExtensions: linesToList(e.target.value) })}
              style={textareaStyle}
            />
          }
        />
      </Group>

      <Group title="Deny list">
        <SettingRow
          label="Denied globs"
          hint="Always blocked (higher priority than allow)"
          control={
            <textarea
              rows={3}
              value={listToLines(draft.denyGlobs)}
              onChange={(e) => update({ denyGlobs: linesToList(e.target.value) })}
              style={textareaStyle}
            />
          }
        />
      </Group>

      {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}

      <button type="button" onClick={save} disabled={saved} style={saveBtn}>
        {saved ? 'Saved' : 'Save workspace settings'}
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: 220,
  fontSize: 12,
  padding: '4px 8px',
  borderRadius: 6,
  border: '.5px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--fg)',
};

const textareaStyle: React.CSSProperties = {
  width: 220,
  fontSize: 11,
  padding: 6,
  borderRadius: 6,
  border: '.5px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--fg)',
  resize: 'vertical',
};

const smallBtn: React.CSSProperties = {
  fontSize: 11,
  padding: '4px 8px',
  borderRadius: 6,
  border: '.5px solid var(--border)',
  background: 'var(--surface)',
  cursor: 'pointer',
};

const saveBtn: React.CSSProperties = {
  marginTop: 8,
  padding: '8px 14px',
  fontSize: 12,
  borderRadius: 8,
  border: 'none',
  background: 'var(--accent)',
  color: '#fff',
  cursor: 'pointer',
};
