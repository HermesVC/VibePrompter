import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** Small icon rendered inside the rounded surface. */
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  /** Optional CTAs (e.g. a `<PhButton>`). */
  action?: ReactNode;
  /** Compact variant for inline use (e.g. inside a list card). */
  compact?: boolean;
}

/**
 * Calm, minimal empty state. Centered, generous whitespace, soft typography —
 * designed to communicate "nothing here yet, here's what to do" rather than
 * "something went wrong".
 *
 * Animates in with `ph-anim-fade-in` so it doesn't snap when a query resolves.
 */
export function EmptyState({ icon, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div
      role="status"
      className="ph-anim-fade-in flex flex-col items-center justify-center text-center mx-auto"
      style={{
        padding: compact ? '32px 20px' : '56px 24px',
        maxWidth: compact ? 360 : 440,
        color: 'var(--fg-mute)',
      }}
    >
      <div
        aria-hidden="true"
        className="flex items-center justify-center"
        style={{
          width: compact ? 44 : 56,
          height: compact ? 44 : 56,
          borderRadius: 14,
          background: 'var(--surface)',
          border: '.5px solid var(--border-strong)',
          color: 'var(--fg-mute)',
          marginBottom: compact ? 12 : 16,
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {icon}
      </div>
      <div
        className="text-fg-strong"
        style={{
          fontSize: compact ? 14 : 15,
          fontWeight: 500,
          letterSpacing: '-0.01em',
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      {description && (
        <div
          className="text-fg-mute"
          style={{
            fontSize: compact ? 12 : 12.5,
            lineHeight: 1.55,
            marginBottom: action ? 16 : 0,
          }}
        >
          {description}
        </div>
      )}
      {action && <div className="flex items-center gap-2 mt-1">{action}</div>}
    </div>
  );
}
