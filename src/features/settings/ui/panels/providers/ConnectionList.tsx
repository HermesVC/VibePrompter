import { I, PhButton, Pill } from '@shared/ui';
import { relativeTimeAgo } from '@shared/lib/date';
import type { Connection } from './connection';

interface ConnectionListProps {
  connections: Connection[];
  selected: Set<string>;
  tagFilter: string | null;
  busy: string | null;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  onRemoveSelected: () => void;
  onSetTagFilter: (tag: string | null) => void;
  onTest: (id: string) => void;
  onSetDefault: (id: string) => void;
  onEdit: (c: Connection) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onImport: () => void;
  onExport: () => void;
}

export function ConnectionList({
  connections,
  selected,
  tagFilter,
  busy,
  onToggleAll,
  onToggleOne,
  onRemoveSelected,
  onSetTagFilter,
  onTest,
  onSetDefault,
  onEdit,
  onRemove,
  onAdd,
  onImport,
  onExport,
}: ConnectionListProps) {
  return (
    <div className="flex flex-col gap-2">
      {connections.length === 0 && (
        <div
          className="rounded-lg px-5 py-6 text-[12.5px] text-fg-dim text-center"
          style={{ background: 'var(--surface)', border: '.5px dashed var(--border)' }}
        >
          No connections yet. Add one to start running real prompts.
        </div>
      )}
      {connections.length > 0 && (
        <div className="flex items-center gap-2 px-1 mb-1">
          <input
            type="checkbox"
            checked={selected.size > 0 && selected.size === connections.length}
            ref={(el) => {
              if (el) el.indeterminate = selected.size > 0 && selected.size < connections.length;
            }}
            onChange={onToggleAll}
            title="Select all"
          />
          <span className="text-[11.5px] text-fg-dim">
            {selected.size > 0
              ? `${selected.size} selected`
              : `${connections.length} connection${connections.length === 1 ? '' : 's'}`}
          </span>
          {selected.size > 0 && (
            <PhButton
              size="sm"
              variant="danger"
              icon={<I.trash size={12} />}
              onClick={onRemoveSelected}
              disabled={busy === 'bulk:del'}
            >
              {busy === 'bulk:del' ? 'Deleting…' : `Delete ${selected.size}`}
            </PhButton>
          )}
        </div>
      )}
      {connections.length > 1 && (() => {
        const allTags = Array.from(
          new Set(
            connections
              .flatMap((c) => (c.tags ?? '').split(',').map((t) => t.trim()))
              .filter((t) => t.length > 0)
          )
        ).sort();
        if (allTags.length === 0) return null;
        return (
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-[11px] text-fg-dim mr-1">Filter:</span>
            <button
              type="button"
              onClick={() => onSetTagFilter(null)}
              className="text-[11px] px-2 py-1 rounded transition-colors"
              style={{
                background: tagFilter === null ? 'var(--accent-tint)' : 'var(--surface-2)',
                color: tagFilter === null ? 'var(--accent)' : 'var(--fg-mute)',
                border: `.5px solid ${tagFilter === null ? 'var(--accent-tint-2)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
            >
              All ({connections.length})
            </button>
            {allTags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onSetTagFilter(t)}
                className="text-[11px] px-2 py-1 rounded transition-colors"
                style={{
                  background: tagFilter === t ? 'var(--accent-tint)' : 'var(--surface-2)',
                  color: tagFilter === t ? 'var(--accent)' : 'var(--fg)',
                  border: `.5px solid ${tagFilter === t ? 'var(--accent-tint-2)' : 'var(--border)'}`,
                  cursor: 'pointer',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        );
      })()}
      {connections
        .filter((c) => {
          if (!tagFilter) return true;
          return (c.tags ?? '')
            .split(',')
            .map((t) => t.trim())
            .includes(tagFilter);
        })
        .map((c) => (
        <div
          key={c.id}
          className="rounded-lg p-4 flex items-center gap-3"
          style={{
            background: selected.has(c.id) ? 'var(--accent-tint)' : 'var(--surface)',
            border: `.5px solid ${selected.has(c.id) ? 'var(--accent-tint-2)' : 'var(--border)'}`,
          }}
        >
          <input
            type="checkbox"
            checked={selected.has(c.id)}
            onChange={() => onToggleOne(c.id)}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] font-semibold text-fg-strong truncate">
                {c.label}
              </span>
              <Pill>{c.kind}</Pill>
              {c.isDefault && <Pill tone="accent">default</Pill>}
              {!c.hasKey && <Pill tone="warn">no key</Pill>}
              {(c.tags ?? '')
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
                .map((t) => (
                  <Pill key={t}>{t}</Pill>
                ))}
            </div>
            <div className="text-[11.5px] text-fg-dim mt-1 ph-mono truncate">
              {c.baseUrl} · {c.defaultModel || '(no default model)'}{' '}
              {c.hasKey && `· key ${c.apiKeyTail}`}
              {c.lastUsedAt && ` · used ${relativeTimeAgo(c.lastUsedAt)}`}
            </div>
            {c.notes && (
              <div
                className="text-[11.5px] text-fg-mute mt-1"
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              >
                {c.notes}
              </div>
            )}
          </div>
          <PhButton
            size="sm"
            variant="ghost"
            onClick={() => onTest(c.id)}
            icon={<I.bolt size={12} />}
            disabled={busy === `test:${c.id}`}
          >
            {busy === `test:${c.id}` ? 'Testing…' : 'Test'}
          </PhButton>
          {!c.isDefault && (
            <PhButton
              size="sm"
              variant="ghost"
              onClick={() => onSetDefault(c.id)}
              disabled={busy === `def:${c.id}`}
            >
              Set default
            </PhButton>
          )}
          <PhButton size="sm" variant="ghost" onClick={() => onEdit(c)}>
            Edit
          </PhButton>
          <PhButton
            size="sm"
            variant="ghost"
            onClick={() => onRemove(c.id)}
            disabled={busy === `del:${c.id}`}
            icon={<I.trash size={12} />}
          >
            {''}
          </PhButton>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <PhButton
          variant="primary"
          size="md"
          icon={<I.plus size={14} />}
          onClick={onAdd}
        >
          Add connection
        </PhButton>
        <span className="flex-1" />
        <PhButton
          variant="ghost"
          size="md"
          icon={<I.upload size={14} />}
          onClick={onImport}
          title="Import a connections JSON file (API keys not included)"
        >
          Import
        </PhButton>
        <PhButton
          variant="ghost"
          size="md"
          icon={<I.download size={14} />}
          onClick={onExport}
          disabled={connections.length === 0}
          title="Download a JSON file of all connections (API keys excluded)"
        >
          Export
        </PhButton>
      </div>
    </div>
  );
}
