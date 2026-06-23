import { useEffect, useMemo, useState } from 'react';
import type { PolicyDecision } from '@shared/lib/workspaceApi';
import { computeLineDiff, diffStats } from '@shared/lib/textDiff';
import { errorMessage } from '@shared/lib/utils';

interface ApplyConfirmDialogProps {
  open: boolean;
  title: string;
  path?: string;
  before: string;
  after: string;
  decision: PolicyDecision;
  onConfirm: (rememberAllow: boolean) => Promise<void>;
  onCancel: () => void;
}

export function ApplyConfirmDialog({
  open,
  title,
  path,
  before,
  after,
  decision,
  onConfirm,
  onCancel,
}: ApplyConfirmDialogProps) {
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setApplying(false);
      setError(null);
    }
  }, [open]);

  const diffLines = useMemo(() => computeLineDiff(before, after), [before, after]);
  const stats = useMemo(() => diffStats(diffLines), [diffLines]);

  if (!open) return null;

  const blocked = decision === 'deny';
  const snippetApply = !path;
  const showRemember = Boolean(path);

  const handleConfirm = async (remember: boolean) => {
    setApplying(true);
    setError(null);
    try {
      await onConfirm(remember);
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
          width: 'min(640px, 100%)',
          maxHeight: '80vh',
          overflow: 'auto',
          background: 'var(--surface)',
          border: '.5px solid var(--border-strong)',
          borderRadius: 10,
          boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
          padding: 16,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-strong)', marginBottom: 4 }}>
          {title}
        </div>
        {path && (
          <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 12, wordBreak: 'break-all' }}>
            {path}
          </div>
        )}
        {blocked ? (
          <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 12 }}>
            Write blocked by workspace policy. Add this path to the allow-list in Settings → Workspace.
          </div>
        ) : (
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
              {stats.removed > 0 && <span style={{ color: '#ef4444' }}>−{stats.removed} removed</span>}
              {stats.added === 0 && stats.removed === 0 && (
                <span>No line changes — model may have replied without editing the snippet</span>
              )}
            </div>
            <UnifiedDiffView lines={diffLines} />
          </>
        )}
        {error && (
          <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 10 }}>{error}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button type="button" onClick={onCancel} disabled={applying} style={btnStyle(false, applying)}>
            Cancel
          </button>
          {!blocked && (
            <>
              {showRemember && (
                <button
                  type="button"
                  onClick={() => void handleConfirm(false)}
                  disabled={applying}
                  style={btnStyle(false, applying)}
                >
                  {applying ? 'Applying…' : 'Apply once'}
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleConfirm(showRemember)}
                disabled={applying}
                style={btnStyle(true, applying)}
              >
                {applying
                  ? snippetApply
                    ? 'Copying…'
                    : 'Applying…'
                  : snippetApply
                    ? 'Copy to clipboard'
                    : showRemember
                      ? 'Apply & remember'
                      : 'Apply'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function UnifiedDiffView({ lines }: { lines: ReturnType<typeof computeLineDiff> }) {
  if (lines.length === 0) {
    return (
      <pre style={diffPreStyle}>
        <span style={{ color: 'var(--fg-dim)' }}>(empty)</span>
      </pre>
    );
  }

  return (
    <pre style={diffPreStyle}>
      {lines.map((line, i) => {
        if (line.type === 'same') {
          return (
            <div key={i} style={lineStyle('same')}>
              <span style={prefixStyle('same')}> </span>
              {line.text || ' '}
            </div>
          );
        }
        if (line.type === 'add') {
          return (
            <div key={i} style={lineStyle('add')}>
              <span style={prefixStyle('add')}>+</span>
              {line.text || ' '}
            </div>
          );
        }
        return (
          <div key={i} style={lineStyle('remove')}>
            <span style={prefixStyle('remove')}>−</span>
            {line.text || ' '}
          </div>
        );
      })}
    </pre>
  );
}

const diffPreStyle: React.CSSProperties = {
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
};

function lineStyle(type: 'same' | 'add' | 'remove'): React.CSSProperties {
  if (type === 'add') {
    return {
      background: 'rgba(34, 197, 94, 0.18)',
      color: '#4ade80',
      borderRadius: 2,
      padding: '0 2px',
    };
  }
  if (type === 'remove') {
    return {
      background: 'rgba(239, 68, 68, 0.12)',
      color: '#f87171',
      textDecoration: 'line-through',
      opacity: 0.85,
      borderRadius: 2,
      padding: '0 2px',
    };
  }
  return { color: 'var(--fg)' };
}

function prefixStyle(type: 'same' | 'add' | 'remove'): React.CSSProperties {
  const color =
    type === 'add' ? '#22c55e' : type === 'remove' ? '#ef4444' : 'transparent';
  return {
    display: 'inline-block',
    width: 14,
    userSelect: 'none',
    color,
    fontWeight: 600,
  };
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
