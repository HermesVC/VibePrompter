import { useState } from 'react';
import { I, PanelHead, PhButton, PhInput, Pill, type IconName } from '@shared/ui';
import { useHistoryQuery } from '../../application/settings.query';

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--fg-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontWeight: 600,
};

export function HistoryPanel() {
  const { data: history = [] } = useHistoryQuery();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(1);

  const items = history.filter(
    (x) =>
      !q.trim() ||
      x.src.toLowerCase().includes(q.toLowerCase()) ||
      x.out.toLowerCase().includes(q.toLowerCase())
  );
  const current = history.find((x) => x.id === sel) ?? history[0];

  if (!current) return null;
  const CurIcon = I[current.iconName as IconName];

  return (
    <>
      <PanelHead
        title="History"
        hint="The last 30 days of transformations. Stored locally."
        actions={
          <div className="flex gap-1.5">
            <PhButton size="sm" variant="ghost" icon={<I.filter size={12} />}>
              Filter
            </PhButton>
            <PhButton size="sm" variant="ghost" icon={<I.download size={12} />}>
              Export
            </PhButton>
            <PhButton size="sm" variant="danger" icon={<I.trash size={12} />}>
              Clear all
            </PhButton>
          </div>
        }
      />

      <div className="grid gap-4" style={{ gridTemplateColumns: '380px 1fr' }}>
        <div className="flex flex-col gap-2">
          <PhInput
            icon={<I.search size={13} />}
            placeholder="Search history…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div
            className="rounded-lg overflow-hidden"
            style={{ background: 'var(--surface)', border: '.5px solid var(--border)' }}
          >
            {items.map((it, i) => {
              const Icon = I[it.iconName as IconName];
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setSel(it.id)}
                  className="w-full text-left border-0 px-3 py-2.5 cursor-pointer flex flex-col gap-1"
                  style={{
                    background: sel === it.id ? 'var(--accent-tint)' : 'transparent',
                    borderTop: i ? '.5px solid var(--divider)' : 'none',
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <Pill tone="accent" icon={Icon ? <Icon size={12} /> : null}>
                      {it.mode}
                    </Pill>
                    <span className="flex-1" />
                    {it.fav && (
                      <I.star size={11} fill="currentColor" style={{ color: 'var(--warn)' }} />
                    )}
                    <span className="text-[10.5px] text-fg-dim">{it.when}</span>
                  </div>
                  <div
                    className="text-xs text-fg overflow-hidden text-ellipsis"
                    style={{
                      lineHeight: 1.4,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {it.out}
                  </div>
                  <div className="text-[11px] text-fg-mute flex gap-1.5">
                    <I.cloud size={10} />
                    <span className="ph-mono">{it.provider}</span>
                    <span className="text-fg-dim">·</span>
                    <span className="ph-mono">{(it.ms / 1000).toFixed(2)}s</span>
                  </div>
                </button>
              );
            })}
            {items.length === 0 && (
              <div className="p-8 text-center text-[13px] text-fg-mute">
                No matches for "{q}"
              </div>
            )}
          </div>
        </div>

        {/* Detail */}
        <div
          className="rounded-lg p-[18px] flex flex-col gap-3.5"
          style={{ background: 'var(--surface)', border: '.5px solid var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <Pill tone="accent" icon={CurIcon ? <CurIcon size={12} /> : null}>
              {current.mode}
            </Pill>
            <span className="text-fg-dim">·</span>
            <span className="ph-mono text-[11.5px] text-fg-mute">{current.provider}</span>
            <span className="flex-1" />
            <PhButton
              size="sm"
              variant="ghost"
              icon={<I.star size={12} fill={current.fav ? 'currentColor' : 'none'} />}
            >
              {current.fav ? 'Saved' : 'Favorite'}
            </PhButton>
            <PhButton size="sm" variant="ghost" icon={<I.refresh size={12} />}>
              Reuse
            </PhButton>
            <PhButton size="sm" variant="primary" icon={<I.copy size={12} />}>
              Copy
            </PhButton>
          </div>

          <div>
            <div style={{ ...labelStyle, marginBottom: 6 }}>Original</div>
            <div
              className="px-3 py-2.5 text-[13px] text-fg-mute"
              style={{
                background: 'var(--surface-2)',
                border: '.5px solid var(--border)',
                borderRadius: 'var(--r-md)',
                lineHeight: 1.55,
              }}
            >
              {current.src}
            </div>
          </div>

          <div>
            <div style={{ ...labelStyle, color: 'var(--accent)', marginBottom: 6 }}>Result</div>
            <div
              className="px-3.5 py-3 text-[13.5px] text-fg whitespace-pre-wrap"
              style={{
                background: 'var(--accent-tint)',
                border: '.5px solid var(--accent-tint-2)',
                borderRadius: 'var(--r-md)',
                lineHeight: 1.55,
              }}
            >
              {current.out}
            </div>
          </div>

          <div
            className="mt-auto flex gap-3 items-center px-3 py-2.5 text-[11.5px] text-fg-mute"
            style={{
              background: 'var(--surface-2)',
              border: '.5px solid var(--border)',
              borderRadius: 'var(--r-md)',
            }}
          >
            <span>
              <span className="text-fg-dim">When </span>
              <span className="ph-mono">{current.when}</span>
            </span>
            <span>
              <span className="text-fg-dim">Latency </span>
              <span className="ph-mono">{current.ms}ms</span>
            </span>
            <span>
              <span className="text-fg-dim">Tokens </span>
              <span className="ph-mono">~{Math.round(current.out.length / 3.5)}</span>
            </span>
            <span className="flex-1" />
            <button
              type="button"
              title="Delete"
              className="w-[26px] h-[26px] flex items-center justify-center rounded-md cursor-pointer p-0"
              style={{
                background: 'var(--surface-2)',
                border: '.5px solid var(--border-strong)',
                color: 'var(--danger)',
              }}
            >
              <I.trash size={12} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
