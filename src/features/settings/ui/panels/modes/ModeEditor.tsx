import { useMemo, useState } from 'react';
import { I, PhButton, PhInput, Pill } from '@shared/ui';
import { invokeCommand } from '@kernel/infrastructure/tauri';
import { errorMessage } from '@shared/lib/utils';
import { Field } from './Field';
import { VariablesEditor } from './VariablesEditor';
import { ICON_CHOICES, type Connection, type Mode } from './types';

export function ModeEditor({
  mode,
  onChange,
  connections,
  isNew,
  busy,
  onCancel,
  onSave,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  connections: Connection[];
  isNew: boolean;
  busy: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const icons = useMemo(() => ICON_CHOICES, []);
  const locked = mode.isSystem; // Built-ins: prompt + sampling + provider only.
  const [previewInput, setPreviewInput] = useState('');
  const [previewOutput, setPreviewOutput] = useState<string | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const runPreview = async () => {
    if (!previewInput.trim() || previewBusy) return;
    setPreviewBusy(true);
    setPreviewErr(null);
    setPreviewOutput('');
    try {
      const args = {
        id: mode.provider ?? undefined,
        messages: [{ role: 'user', content: previewInput }],
        params: { temperature: mode.temp, maxTokens: mode.maxTok, system: mode.sys },
      };
      const cmd = mode.provider ? 'complete' : 'complete_default';
      const result = await invokeCommand<{ text: string; model: string; latencyMs: number }>(cmd, args);
      setPreviewOutput(`${result.text}\n\n— ${result.model} · ${result.latencyMs}ms`);
    } catch (e) {
      setPreviewErr(errorMessage(e));
      setPreviewOutput(null);
    } finally {
      setPreviewBusy(false);
    }
  };

  return (
    <div
      className="rounded-lg p-5 flex flex-col gap-4"
      style={{ background: 'var(--surface)', border: '.5px solid var(--border)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <PhButton
            size="sm"
            variant="ghost"
            icon={<I.chevL size={12} />}
            onClick={onCancel}
            title="Discard unsaved changes and return to the mode list"
          >
            Back
          </PhButton>
          <h3 className="m-0 text-[14px] font-semibold text-fg-strong truncate">
            {isNew ? 'New mode' : `${locked ? 'Configure' : 'Edit'} · ${mode.name || mode.id}`}
          </h3>
          {locked && <Pill>built-in</Pill>}
        </div>
      </div>

      {!locked && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <PhInput value={mode.name} onChange={(v) => onChange({ ...mode, name: v })} placeholder="Code Review" />
          </Field>
          <Field label={isNew ? 'ID (auto from name)' : 'ID (immutable)'}>
            <PhInput
              value={mode.id}
              onChange={(v) => onChange({ ...mode, id: v })}
              placeholder="code-review"
              disabled={!isNew}
            />
          </Field>
        </div>
      )}

      {!locked && (
        <Field label="Short description">
          <PhInput
            value={mode.desc}
            onChange={(v) => onChange({ ...mode, desc: v })}
            placeholder="Critique code for bugs, style, and readability."
          />
        </Field>
      )}

      <Field label="System prompt">
        <textarea
          value={mode.sys}
          onChange={(e) => onChange({ ...mode, sys: e.target.value })}
          rows={6}
          className="w-full text-[13px] resize-y rounded-md px-3 py-2 outline-none"
          style={{
            background: 'var(--bg-2)',
            border: '.5px solid var(--border-strong)',
            color: 'var(--fg)',
            fontFamily: 'var(--sans)',
            minHeight: 120,
          }}
          placeholder="You are a senior code reviewer. Focus on…"
        />
        <span className="text-[11px] text-fg-dim mt-1">
          Use{' '}
          <code className="ph-mono text-[10.5px]">{`{{variable_name}}`}</code> for
          placeholders. Set their default values just below — every run uses them.
        </span>
      </Field>

      <VariablesEditor mode={mode} onChange={onChange} />

      <div className="grid grid-cols-3 gap-3">
        <Field label="Temperature">
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={mode.temp}
            onChange={(e) => onChange({ ...mode, temp: Number(e.target.value) })}
            className="w-full text-[13px] rounded-md px-3 py-2 outline-none"
            style={{ background: 'var(--bg-2)', border: '.5px solid var(--border-strong)', color: 'var(--fg)' }}
          />
        </Field>
        <Field label="Max tokens">
          <input
            type="number"
            min={1}
            max={32768}
            value={mode.maxTok}
            onChange={(e) => onChange({ ...mode, maxTok: Number(e.target.value) })}
            className="w-full text-[13px] rounded-md px-3 py-2 outline-none"
            style={{ background: 'var(--bg-2)', border: '.5px solid var(--border-strong)', color: 'var(--fg)' }}
          />
        </Field>
        <Field label="Default connection">
          <select
            value={mode.provider ?? ''}
            onChange={(e) =>
              onChange({ ...mode, provider: e.target.value === '' ? null : e.target.value })
            }
            className="w-full text-[13px] rounded-md px-3 py-2 outline-none"
            style={{ background: 'var(--bg-2)', border: '.5px solid var(--border-strong)', color: 'var(--fg)' }}
          >
            <option value="">(use default connection)</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {!locked && (
        <Field label="Icon">
          <div className="flex flex-wrap gap-1.5">
            {icons.map((name) => {
              const IconCmp = I[name];
              const picked = mode.iconName === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onChange({ ...mode, iconName: name })}
                  className="w-9 h-9 rounded-md flex items-center justify-center transition-colors"
                  style={{
                    background: picked ? 'var(--accent-tint)' : 'var(--surface-2)',
                    color: picked ? 'var(--accent)' : 'var(--fg)',
                    border: `.5px solid ${picked ? 'var(--accent-tint-2)' : 'var(--border)'}`,
                    cursor: 'pointer',
                  }}
                  title={name}
                >
                  <IconCmp size={16} />
                </button>
              );
            })}
          </div>
        </Field>
      )}

      <div
        className="flex flex-col gap-2 pt-3"
        style={{ borderTop: '.5px solid var(--divider)' }}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-[10.5px] uppercase tracking-[0.10em] text-fg-dim font-semibold">
            Preview
          </span>
          <span className="text-[11px] text-fg-dim">
            Runs against your unsaved settings. Not recorded to history.
          </span>
        </div>
        <textarea
          value={previewInput}
          onChange={(e) => setPreviewInput(e.target.value)}
          rows={2}
          placeholder="Paste sample text here, then click Preview…"
          className="w-full text-[12.5px] resize-y rounded-md px-3 py-2 outline-none"
          style={{
            background: 'var(--bg-2)',
            border: '.5px solid var(--border-strong)',
            color: 'var(--fg)',
            fontFamily: 'var(--sans)',
            minHeight: 56,
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              runPreview();
            }
          }}
        />
        {previewErr && (
          <div
            className="rounded-md px-3 py-2 text-[12px]"
            style={{
              background: 'rgba(248,113,113,0.08)',
              color: 'var(--danger)',
              border: '.5px solid rgba(248,113,113,0.30)',
            }}
          >
            {previewErr}
          </div>
        )}
        {previewOutput !== null && previewOutput !== '' && (
          <pre
            className="text-[12.5px] m-0 rounded-md p-3"
            style={{
              background: 'var(--bg-2)',
              border: '.5px solid var(--border)',
              color: 'var(--fg-strong)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 240,
              overflow: 'auto',
              fontFamily: 'var(--sans)',
            }}
          >
            {previewOutput}
          </pre>
        )}
        <div className="flex justify-end">
          <PhButton
            size="sm"
            variant="ghost"
            icon={<I.bolt size={12} />}
            onClick={runPreview}
            disabled={previewBusy || !previewInput.trim() || !mode.sys.trim()}
            title="Run a one-shot completion with the current draft settings (Ctrl+Enter)"
          >
            {previewBusy ? 'Running…' : 'Preview'}
          </PhButton>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2" style={{ borderTop: '.5px solid var(--divider)' }}>
        <span className="flex-1" />
        <PhButton variant="ghost" size="md" onClick={onCancel}>
          Cancel
        </PhButton>
        <PhButton
          variant="primary"
          size="md"
          icon={<I.check size={14} />}
          onClick={onSave}
          disabled={busy}
        >
          {busy ? 'Saving…' : isNew ? 'Create mode' : 'Save'}
        </PhButton>
      </div>
    </div>
  );
}
