/**
 * Loading-state skeleton for the dashboard. Mirrors the real layout's
 * rough shape — active mode card, run-prompt area, mode grid, shortcuts,
 * recent activity — so the page doesn't visibly jump when the data
 * arrives.
 */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading dashboard">
      <div
        className="rounded-xl p-5 flex items-center gap-4"
        style={{ background: 'var(--surface)', border: '.5px solid var(--border)' }}
      >
        <div className="ph-shimmer" style={{ width: 48, height: 48, borderRadius: 12 }} />
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="ph-shimmer" style={{ height: 11, width: 90 }} />
          <div className="ph-shimmer" style={{ height: 22, width: '38%' }} />
          <div className="ph-shimmer" style={{ height: 12, width: '60%' }} />
        </div>
        <div className="ph-shimmer" style={{ height: 32, width: 140, borderRadius: 8 }} />
      </div>

      <div
        className="rounded-xl p-5 flex flex-col gap-3"
        style={{ background: 'var(--surface)', border: '.5px solid var(--border)' }}
      >
        <div className="ph-shimmer" style={{ height: 12, width: 110 }} />
        <div className="ph-shimmer" style={{ height: 80, width: '100%', borderRadius: 8 }} />
        <div className="flex justify-end gap-2">
          <div className="ph-shimmer" style={{ height: 32, width: 80, borderRadius: 8 }} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="ph-shimmer"
            style={{ height: 46, borderRadius: 10 }}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="ph-shimmer" style={{ height: 12, width: 140 }} />
        <div
          className="rounded-lg overflow-hidden flex flex-col"
          style={{ background: 'var(--surface)', border: '.5px solid var(--border)' }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="px-4 py-3 flex items-center gap-3"
              style={{ borderTop: i === 0 ? 'none' : '.5px solid var(--divider)' }}
            >
              <div className="flex-1 flex flex-col gap-1.5">
                <div className="ph-shimmer" style={{ height: 12, width: '40%' }} />
                <div className="ph-shimmer" style={{ height: 10, width: '25%' }} />
              </div>
              <div className="ph-shimmer" style={{ height: 22, width: 90, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
