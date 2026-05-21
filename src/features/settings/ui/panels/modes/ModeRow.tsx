import { I, PhButton, Pill, Toggle } from '@shared/ui';
import type { Mode } from './types';

interface ModeRowProps {
  mode: Mode;
  /** Index within `list` for user modes; omit for built-in rows. */
  idx?: number;
  /** The filtered list this row belongs to, for honest first/last math. */
  list?: Mode[];
  isActive: boolean;
  /** Label of the pinned connection, or null if none. */
  pinned: string | null;
  busy: boolean;
  onToggleEnabled: (m: Mode, next: boolean) => void;
  onReorder: (id: string, direction: 'up' | 'down') => void;
  onEdit: (m: Mode) => void;
  onRemove: (m: Mode) => void;
}

export function ModeRow({
  mode: m,
  idx,
  list,
  isActive,
  pinned,
  busy,
  onToggleEnabled,
  onReorder,
  onEdit,
  onRemove,
}: ModeRowProps) {
  const Icon =
    (I as Record<string, React.ComponentType<{ size?: number }>>)[m.iconName] ?? I.bolt;
  // Reorder controls only show on user rows that have a neighbor in
  // the matching direction. `list` comes from the caller so the
  // "first / last" math is honest to filtered views (search applied).
  const canMoveUp = !m.isSystem && idx !== undefined && idx > 0;
  const canMoveDown =
    !m.isSystem && idx !== undefined && list !== undefined && idx + 1 < list.length;
  return (
    <div
      className="rounded-lg p-4 flex items-center gap-3"
      style={{
        background: 'var(--surface)',
        border: `.5px solid ${isActive ? 'var(--accent-tint-2)' : 'var(--border)'}`,
        opacity: m.enabled ? 1 : 0.55,
      }}
    >
      <span
        className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ background: 'var(--accent-tint)', color: 'var(--accent)' }}
      >
        <Icon size={16} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[14px] font-semibold text-fg-strong truncate">{m.name}</span>
          {isActive && <Pill tone="accent">active</Pill>}
          {m.isSystem && <Pill>built-in</Pill>}
          {!m.enabled && <Pill>disabled</Pill>}
          {pinned && <Pill>{pinned}</Pill>}
        </div>
        <div className="text-[12px] text-fg-mute mt-0.5 truncate">{m.desc}</div>
        <div className="text-[11px] text-fg-dim mt-1 ph-mono">
          temp {m.temp} · max {m.maxTok} tok
        </div>
      </div>
      {!m.isSystem && (
        <Toggle
          value={m.enabled}
          onChange={(v) => onToggleEnabled(m, v)}
          disabled={busy || isActive}
        />
      )}
      {!m.isSystem && (
        <div
          className="flex flex-col"
          style={{ gap: 1 }}
          title="Reorder this mode"
        >
          <button
            type="button"
            onClick={() => onReorder(m.id, 'up')}
            disabled={!canMoveUp || busy}
            aria-label="Move up"
            className="w-6 h-4 flex items-center justify-center rounded-t transition-colors"
            style={{
              background: 'var(--surface-2)',
              border: '.5px solid var(--border)',
              color: canMoveUp ? 'var(--fg-mute)' : 'var(--fg-dim)',
              cursor: canMoveUp ? 'pointer' : 'default',
              opacity: canMoveUp ? 1 : 0.4,
              fontSize: 10,
              lineHeight: 1,
            }}
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => onReorder(m.id, 'down')}
            disabled={!canMoveDown || busy}
            aria-label="Move down"
            className="w-6 h-4 flex items-center justify-center rounded-b transition-colors"
            style={{
              background: 'var(--surface-2)',
              border: '.5px solid var(--border)',
              color: canMoveDown ? 'var(--fg-mute)' : 'var(--fg-dim)',
              cursor: canMoveDown ? 'pointer' : 'default',
              opacity: canMoveDown ? 1 : 0.4,
              fontSize: 10,
              lineHeight: 1,
            }}
          >
            ▼
          </button>
        </div>
      )}
      <PhButton
        size="sm"
        variant="ghost"
        onClick={() => onEdit(m)}
      >
        {m.isSystem ? 'Configure' : 'Edit'}
      </PhButton>
      {!m.isSystem && (
        <PhButton
          size="sm"
          variant="ghost"
          icon={<I.trash size={12} />}
          onClick={() => onRemove(m)}
          disabled={busy}
        >
          {''}
        </PhButton>
      )}
    </div>
  );
}
