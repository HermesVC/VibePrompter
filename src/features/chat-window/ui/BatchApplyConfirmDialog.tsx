import { useEffect, useMemo, useState } from 'react';
import type { PolicyDecision } from '@shared/lib/workspaceApi';
import { computeLineDiff, diffStats } from '@shared/lib/textDiff';
import { errorMessage } from '@shared/lib/utils';

export interface BatchApplyItem {
  path: string;
  before: string;
  after: string;
  decision: PolicyDecision;
}

interface BatchApplyConfirmDialogProps {
  open: boolean;
  items: BatchApplyItem[];
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

function worstDecision(items: BatchApplyItem[]): PolicyDecision {
  if (items.some((i) => i.decision === 'deny')) return 'deny';
  if (items.some((i) => i.decision === 'ask')) return 'ask';
  return 'allow';
}

export function BatchApplyConfirmDialog({
  open,
  items,
  onConfirm,
  onCancel,
}: BatchApplyConfirmDialogProps) {
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePath, setActivePath] = useState(items[0]?.path ?? '');

  useEffect(() => {
    if (open) {
      setApplying(false);
      setError(null);
      setActivePath(items[0]?.path ?? '');
    }
  }, [open, items]);

  const active = items.find((i) => i.path === activePath) ?? items[0];
  const decision = worstDecision(items);
  const diffLines = useMemo(
    () => (active ? computeLineDiff(active.before, active.after) : []),
    [active]
  );
  const stats = useMemo(() => diffStats(diffLines), [diffLines]);

  if (!open || items.length === 0) return null;

  const blocked = decision === 'deny';

  const handleConfirm = async () => {
    setApplying(true);
    setError(null);
    try {
      await onConfirm();
      onCancel();
    } catch (e) {
      setError(errorMessage(e));
      setApplying(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10_000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={applying ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 100%)',
          maxHeight: '85vh',
          overflow: 'auto',
          background: 'var(--surface)',
          border: '.5px solid var(--border-strong)',
          borderRadius: 10,
          boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
          padding: 16,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-strong)', marginBottom: 4 }}>
          Apply {items.length} generated files
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 12 }}>
          Review each file, then apply all at once.
        </div>
        {blocked ? (
          <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 12 }}>
            At least one path is blocked by workspace policy.
          </div>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
          {items.map((item) => {
            const selected = item.path === active?.path;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => setActivePath(item.path)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  gap: 8,
                  alignItems: 'center',
                  width: '100%',
                  padding: '5px 8px',
                  borderRadius: 6,
                  border: '.5px solid var(--border)',
                  background: selected ? 'var(--accent-tint)' : 'var(--surface)',
                  color: selected ? 'var(--accent)' : 'var(--fg)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 11,
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.path}
                </span>
                <span style={{ fontSize: 10, color: 'var(--fg-dim)' }}>
                  {item.before ? 'modify' : 'create'}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color:
                      item.decision === 'deny'
                        ? 'var(--danger)'
                        : item.decision === 'ask'
                          ? 'var(--warn)'
                          : 'var(--fg-dim)',
                  }}
                >
                  {item.decision}
                </span>
              </button>
            );
          })}
        </div>
        {active && !blocked ? (
          <>
            <div
              style={{
                display: 'flex',
                gap: 10,
                fontSize: 10.5,
                color: 'var(--fg-dim)',
                marginBottom: 6,
              }}
            >
              <span style={{ color: '#22c55e' }}>+{stats.added} added</span>
              {stats.removed > 0 && (
                <span style={{ color: '#ef4444' }}>−{stats.removed} removed</span>
              )}
            </div>
            <pre
              style={{
                margin: 0,
                padding: 8,
                fontSize: 10.5,
                lineHeight: 1.45,
                maxHeight: 280,
                overflow: 'auto',
                background: 'var(--bg-2)',
                border: '.5px solid var(--border)',
                borderRadius: 6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {diffLines.map((line, i) => (
                <div key={i}>{line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  '}{line.text}</div>
              ))}
            </pre>
          </>
        ) : null}
        {error && (
          <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 10 }}>{error}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button type="button" onClick={onCancel} disabled={applying} style={btnStyle(false, applying)}>
            Cancel
          </button>
          {!blocked && (
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={applying}
              style={btnStyle(true, applying)}
            >
              {applying ? 'Applying…' : `Apply all (${items.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function btnStyle(primary: boolean, disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 12px',
    fontSize: 12,
    borderRadius: 6,
    border: primary ? 'none' : '.5px solid var(--border-strong)',
    background: primary ? 'var(--accent)' : 'transparent',
    color: primary ? '#fff' : 'var(--fg)',
    cursor: disabled ? 'wait' : 'pointer',
    opacity: disabled ? 0.65 : 1,
  };
}
