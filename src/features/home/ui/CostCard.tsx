import { useMemo, useState } from 'react';
import { formatCost } from './helpers';
import type { CostBreakdown, CostSummary } from './types';

/**
 * Cost card — surfaces the cost data we already record per run so the user
 * can see "how much have I spent this month" + which connection drives
 * the spend + a 30-day trend. Renders only when there's something to
 * show (skipping it on a fresh install keeps the dashboard clean).
 *
 * Visualization choices:
 *  - 30-day bar chart, inline SVG (no chart library): bars scale to the
 *    max-day in the window so the shape is readable regardless of total
 *    spend. Tooltip per bar via a custom hovered-bar overlay.
 *  - Per-connection breakdown as a sparkbar list, with each row scaled
 *    against the highest-spend connection so the user can spot the
 *    biggest contributor at a glance.
 */
export function CostCard({
  cost,
  breakdown,
}: {
  cost: CostSummary;
  breakdown: CostBreakdown;
}) {
  const days = breakdown.days;
  // Build a dense per-day array (zero-fill gaps) so the bars align with
  // calendar days, not just days where the user ran prompts.
  const denseByDay = useMemo(() => {
    const map = new Map(breakdown.byDay.map((r) => [r.day, r]));
    const arr: Array<{ day: string; micros: number; runs: number }> = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      arr.push(map.get(key) ?? { day: key, micros: 0, runs: 0 });
    }
    return arr;
  }, [breakdown.byDay, days]);
  const maxDayMicros = Math.max(1, ...denseByDay.map((d) => d.micros));
  const maxConnMicros = Math.max(1, ...breakdown.byConnection.map((c) => c.micros));
  const dailyAvg = cost.monthMicros / Math.max(1, days);

  const [hoveredBar, setHoveredBar] = useState<{ day: string; micros: number; runs: number; pctX: number } | null>(null);

  // SVG chart dims. Width scales to container via viewBox; we just need
  // an aspect ratio that reads as "trend, not single value."
  const chartW = 600;
  const chartH = 80;
  const gap = 2;
  const barW = (chartW - gap * (denseByDay.length - 1)) / denseByDay.length;

  return (
    <section
      className="rounded-xl p-5 flex flex-col gap-4"
      style={{ background: 'var(--surface)', border: '.5px solid var(--border)' }}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h2 className="m-0 text-[13px] font-semibold text-fg uppercase tracking-[0.10em]">
            Spend · last {days} days
          </h2>
          <span className="text-[11.5px] text-fg-dim">
            Estimated from your local token usage × per-model pricing. Authoritative invoice
            is your vendor's.
          </span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-[24px] font-semibold text-fg-strong ph-mono">
            {formatCost(cost.monthMicros)}
          </span>
          <span className="text-[11.5px] text-fg-mute">
            ≈ {formatCost(dailyAvg)} / day
          </span>
        </div>
      </div>

      {/* Daily bar chart */}
      <div style={{ width: '100%', position: 'relative' }}>
        {hoveredBar && (
          <div
            className="absolute rounded px-2.5 py-1.5 text-[11px] font-medium transition-all duration-100 ease-out pointer-events-none select-none"
            style={{
              background: 'var(--surface-3)',
              border: '.5px solid var(--border-strong)',
              boxShadow: 'var(--shadow-md)',
              color: 'var(--fg-strong)',
              bottom: '90px',
              left: `${hoveredBar.pctX}%`,
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
              zIndex: 10,
            }}
          >
            <div className="font-semibold text-center text-fg-strong">{formatCost(hoveredBar.micros)}</div>
            <div className="text-[10px] text-fg-dim text-center mt-0.5">
              {hoveredBar.day} · {hoveredBar.runs} run{hoveredBar.runs === 1 ? '' : 's'}
            </div>
          </div>
        )}
        <svg
          viewBox={`0 0 ${chartW} ${chartH}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: 80, display: 'block', overflow: 'visible' }}
          role="img"
          aria-label={`Daily cost trend over the last ${days} days`}
        >
          {/* Average daily baseline */}
          {cost.monthMicros > 0 && (
            <line
              x1="0"
              y1={chartH - Math.max(1, (dailyAvg / maxDayMicros) * (chartH - 4))}
              x2={chartW}
              y2={chartH - Math.max(1, (dailyAvg / maxDayMicros) * (chartH - 4))}
              stroke="var(--accent)"
              strokeWidth="0.75"
              strokeDasharray="3 3"
              opacity="0.35"
            />
          )}

          {denseByDay.map((d, i) => {
            const h = d.micros === 0 ? 1 : Math.max(1, (d.micros / maxDayMicros) * (chartH - 4));
            const x = i * (barW + gap);
            const y = chartH - h;
            const isHovered = hoveredBar?.day === d.day;
            return (
              <rect
                key={d.day}
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={1}
                fill={isHovered ? 'var(--accent-2)' : d.micros === 0 ? 'var(--surface-3)' : 'var(--accent)'}
                opacity={isHovered ? 1 : d.micros === 0 ? 0.4 : 0.9}
                style={{
                  transition: 'fill 150ms ease-out, opacity 150ms ease-out',
                  cursor: 'pointer',
                }}
                onMouseEnter={() => {
                  setHoveredBar({
                    day: d.day,
                    micros: d.micros,
                    runs: d.runs,
                    pctX: ((x + barW / 2) / chartW) * 100
                  });
                }}
                onMouseLeave={() => {
                  setHoveredBar(null);
                }}
              />
            );
          })}
        </svg>
        <div
          className="flex justify-between mt-1.5 text-[10.5px] ph-mono"
          style={{ color: 'var(--fg-dim)' }}
        >
          <span>{denseByDay[0]?.day ?? ''}</span>
          <span>{denseByDay[denseByDay.length - 1]?.day ?? 'today'}</span>
        </div>
      </div>

      {/* Per-connection breakdown */}
      {breakdown.byConnection.length > 0 && (
        <div className="flex flex-col gap-2 pt-1" style={{ borderTop: '.5px solid var(--divider)' }}>
          <div className="text-[10.5px] uppercase tracking-[0.10em] text-fg-dim font-semibold pt-2">
            By connection
          </div>
          {breakdown.byConnection.slice(0, 6).map((c) => {
            const pct = (c.micros / maxConnMicros) * 100;
            return (
              <div key={c.label} className="flex items-center gap-3">
                <span className="text-[12.5px] text-fg-strong flex-shrink-0" style={{ minWidth: 140 }}>
                  {c.label || '(unknown)'}
                </span>
                <div
                  className="flex-1 relative rounded-full"
                  style={{
                    height: 6,
                    background: 'var(--surface-2)',
                    overflow: 'hidden',
                  }}
                  title={`${formatCost(c.micros)} across ${c.runs} run${c.runs === 1 ? '' : 's'}`}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: '100%',
                      background: c.micros > 0 ? 'var(--accent)' : 'var(--fg-dim)',
                      borderRadius: 999,
                      opacity: c.micros > 0 ? 0.85 : 0.3,
                    }}
                  />
                </div>
                <span
                  className="text-[11.5px] text-fg-mute ph-mono flex-shrink-0 text-right"
                  style={{ minWidth: 72 }}
                >
                  {formatCost(c.micros)}
                </span>
                <span
                  className="text-[10.5px] text-fg-dim ph-mono flex-shrink-0 text-right"
                  style={{ minWidth: 44 }}
                >
                  {c.runs}r
                </span>
              </div>
            );
          })}
          {cost.monthRunsUnpriced > 0 && (
            <span className="text-[11px] text-fg-dim mt-1">
              {cost.monthRunsUnpriced} additional run{cost.monthRunsUnpriced === 1 ? '' : 's'}{' '}
              not priced (local model, or model not in the pricing table). Set a per-connection
              override in <strong>Settings → Providers → edit connection → Advanced</strong>.
            </span>
          )}
        </div>
      )}
    </section>
  );
}
