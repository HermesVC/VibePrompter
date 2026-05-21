import { useMemo } from 'react';
import { PhInput } from '@shared/ui';
import { Field } from './Field';
import { extractPlaceholders, parseVarsJson } from './placeholders';
import type { Mode } from './types';

/**
 * Renders one input row per `{{variable}}` discovered in the mode's
 * system prompt. The user types the default value once; every run of
 * this mode (via hotkey, dashboard, or per-connection override) gets
 * the placeholder substituted at call time on the Rust side. Editing
 * the prompt to add a new placeholder automatically grows this section
 * to include it (and removing a placeholder strips its stored value on
 * the next save by virtue of only rendering rows for present names).
 */
export function VariablesEditor({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  const placeholders = useMemo(() => extractPlaceholders(mode.sys), [mode.sys]);
  if (placeholders.length === 0) return null;
  const current = parseVarsJson(mode.variables);
  const setValue = (name: string, value: string) => {
    const next = { ...current, [name]: value };
    // Don't persist keys for placeholders that no longer exist in the
    // prompt — keeps the JSON tidy and the editor predictable.
    const filtered: Record<string, string> = {};
    for (const k of placeholders) {
      filtered[k] = next[k] ?? '';
    }
    onChange({ ...mode, variables: JSON.stringify(filtered) });
  };
  return (
    <Field label="Variable defaults">
      <div
        className="rounded-md p-3 flex flex-col gap-2"
        style={{
          background: 'var(--bg-2)',
          border: '.5px solid var(--border)',
        }}
      >
        {placeholders.map((name) => (
          <div key={name} className="flex items-center gap-2.5">
            <code
              className="ph-mono text-[11.5px] px-2 py-1 rounded flex-shrink-0"
              style={{
                background: 'var(--surface)',
                color: 'var(--accent)',
                border: '.5px solid var(--accent-tint-2)',
                minWidth: 110,
              }}
              title={`Placeholder {{${name}}} in the prompt above`}
            >
              {`{{${name}}}`}
            </code>
            <PhInput
              value={current[name] ?? ''}
              onChange={(v) => setValue(name, v)}
              placeholder={`default value for ${name}`}
            />
          </div>
        ))}
        <span className="text-[11px] text-fg-dim mt-0.5">
          Every run substitutes these values into the prompt. Leave blank to send an
          empty string. Delete the placeholder from the prompt to remove a row.
        </span>
      </div>
    </Field>
  );
}
