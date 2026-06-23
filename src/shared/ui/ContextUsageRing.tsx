import { useState } from 'react';
import {
  contextFillPercent,
  formatTokenCount,
  type TokenUsage,
} from '@shared/lib/contextUsage';

export interface ContextUsageRingProps {
  usedTokens: number;
  contextWindowSize: number;
  usage?: TokenUsage | null;
  /** Shown in tooltip when usage is estimated rather than reported. */
  estimated?: boolean;
  /** Limit was guessed from provider URL, not set on the connection. */
  limitInferred?: boolean;
  streaming?: boolean;
}

/**
 * Cursor-style circular context fill indicator.
 * With no configured or inferred limit, shows token count only (muted ring).
 */
export function ContextUsageRing({
  usedTokens,
  contextWindowSize,
  usage,
  estimated = false,
  limitInferred = false,
  streaming = false,
}: ContextUsageRingProps) {
  const [hover, setHover] = useState(false);

  const hasLimit = contextWindowSize > 0;
  const rawPercent = hasLimit ? (contextFillPercent(usedTokens, contextWindowSize) ?? 0) : 0;
  const percent =
    hasLimit && usedTokens > 0 && rawPercent === 0 ? 2 : rawPercent;
  const r = 8;
  const stroke = 2.5;
  const size = (r + stroke) * 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - percent / 100);
  const ringColor =
    percent >= 90 ? 'var(--danger)' : percent >= 70 ? 'var(--warn)' : 'var(--accent)';

  const out = usage?.outputTokens ?? 0;
  const usedLabel = estimated ? `~${formatTokenCount(usedTokens)}` : formatTokenCount(usedTokens);

  let tooltip: string;
  if (!hasLimit) {
    tooltip =
      usedTokens > 0
        ? `${usedLabel} tokens used · Set context window in Providers for usage %`
        : 'Set context window in Providers to track fill %';
  } else if (estimated) {
    tooltip = `~${percent}% · ~${formatTokenCount(usedTokens)} / ${formatTokenCount(contextWindowSize)} context (estimated)`;
  } else {
    tooltip = `${percent}% · ${formatTokenCount(usedTokens)} / ${formatTokenCount(contextWindowSize)} context`;
  }
  if (limitInferred && hasLimit) {
    tooltip += ' · default for this provider';
  }
  if (out > 0 && hasLimit && !estimated) {
    tooltip += ` · ${formatTokenCount(out)} out`;
  }

  return (
    <div
      data-no-drag
      style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-label={tooltip}
        style={{
          display: 'block',
          transform: 'rotate(-90deg)',
          opacity: streaming ? 0.85 : 1,
        }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--border-strong)"
          strokeWidth={stroke}
        />
        {hasLimit && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={ringColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.25s ease, stroke 0.2s ease' }}
          />
        )}
      </svg>
      {hover && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 20,
            padding: '5px 8px',
            borderRadius: 6,
            fontSize: 10.5,
            lineHeight: 1.35,
            whiteSpace: 'nowrap',
            maxWidth: 280,
            color: 'var(--fg)',
            background: 'var(--surface)',
            border: '.5px solid var(--border-strong)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
            pointerEvents: 'none',
          }}
        >
          {tooltip}
        </div>
      )}
    </div>
  );
}
