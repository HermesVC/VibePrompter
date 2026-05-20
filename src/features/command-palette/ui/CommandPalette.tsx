import { useEffect, useMemo, useRef, useState } from 'react';
import {
  I,
  Kbd,
  Pill,
  PhButton,
  ProviderGlyphs,
  Spinner,
  AppIcon,
} from '@shared/ui';
import { filterActions, type PaletteState } from '../domain';
import {
  useQuickActionsQuery,
  useRecentModesQuery,
} from '../application/quickActions.query';
import { usePaletteStream } from '../application/usePaletteStream';
import { ActionRow } from './ActionRow';
import { ModePill } from './ModePill';

interface CommandPaletteProps {
  initialState?: PaletteState;
}

export function CommandPalette({ initialState = 'idle' }: CommandPaletteProps) {
  const [state, setState] = useState<PaletteState>(initialState);
  const [query, setQuery] = useState(
    state === 'typing' ? 'improve' : state === 'loading' || state === 'result' ? 'improve writing' : ''
  );
  const [focus, setFocus] = useState(0);

  const { data: actions = [] } = useQuickActionsQuery();
  const { data: recentModes = [] } = useRecentModesQuery();
  const filtered = useMemo(() => filterActions(actions, query), [actions, query]);
  const { streamed, total } = usePaletteStream(state);

  const showResult = state === 'loading' || state === 'result';

  // Reset focus to top of the list whenever the filter changes.
  useEffect(() => {
    setFocus(0);
  }, [query, filtered.length]);

  // Keep the focused row scrolled into view.
  const rowsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (showResult) return;
    const el = rowsRef.current?.querySelector<HTMLElement>(`[data-row-index="${focus}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [focus, showResult]);

  const triggerAction = (index: number) => {
    if (!filtered[index]) return;
    setState('loading');
  };

  return (
    <div className="ph-root flex justify-center p-6 bg-transparent">
      <div
        className="ph-anim-pop-in w-[680px] flex flex-col overflow-hidden rounded-xl border-[0.5px] border-border-strong"
        style={{
          background: 'var(--glass)',
          backdropFilter: 'blur(32px) saturate(160%)',
          WebkitBackdropFilter: 'blur(32px) saturate(160%)',
          boxShadow:
            'var(--shadow-lg), 0 0 0 1px rgba(255,255,255,0.02), 0 0 80px rgba(167,139,250,0.06)',
        }}
      >
        {/* TOP BAR */}
        <div className="px-3.5 py-2.5 flex items-center gap-2.5 border-b-[0.5px] border-divider text-[11.5px]">
          <Pill tone="accent" icon={<I.code size={11} />}>
            Developer Mode
          </Pill>
          <span className="text-fg-dim">•</span>
          <span className="inline-flex items-center gap-1.5 text-fg-mute">
            <span className="text-openai flex">{ProviderGlyphs.openai(12)}</span>
            <span className="ph-mono">GPT-4.1</span>
          </span>
          <span className="text-fg-dim">•</span>
          <span className="inline-flex items-center gap-1 text-fg-mute">
            <span className="dot ok" />
            <span className="ph-mono">1.2s avg</span>
          </span>
          <span className="flex-1" />
          <button
            type="button"
            className="inline-flex items-center gap-1.5 bg-transparent border-0 text-fg-mute cursor-pointer text-[11px] px-1.5 py-0.5 rounded"
          >
            <I.layers size={11} />
            Switch mode
            <Kbd keys={['⌘', 'K']} size="sm" />
          </button>
        </div>

        {/* MAIN INPUT */}
        <div className="px-4 py-3.5 flex items-center gap-3 border-b-[0.5px] border-divider relative">
          <span className="text-accent flex">
            {state === 'loading' ? (
              <Spinner size={20} color="var(--accent)" />
            ) : (
              <I.wand size={20} />
            )}
          </span>
          <div className="flex-1 relative">
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (state === 'idle' && e.target.value) setState('typing');
                if (state === 'typing' && !e.target.value) setState('idle');
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (filtered.length > 0) setFocus((f) => (f + 1) % filtered.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (filtered.length > 0)
                    setFocus((f) => (f - 1 + filtered.length) % filtered.length);
                  return;
                }
                if (e.key === 'Home') {
                  e.preventDefault();
                  setFocus(0);
                  return;
                }
                if (e.key === 'End') {
                  e.preventDefault();
                  if (filtered.length > 0) setFocus(filtered.length - 1);
                  return;
                }
                if (e.key === 'Enter') {
                  if (filtered.length > 0) {
                    triggerAction(focus);
                  } else if (query.trim()) {
                    // No match → send the typed text as a custom instruction.
                    setState('loading');
                  }
                  return;
                }
                if (e.key === 'Escape') {
                  setQuery('');
                  setState('idle');
                }
              }}
              placeholder="Improve selected text…"
              className="w-full bg-transparent border-0 outline-none p-0 text-fg-strong"
              style={{
                fontFamily: 'inherit',
                fontSize: 18,
                fontWeight: 400,
                letterSpacing: '-0.01em',
                lineHeight: 1.3,
              }}
            />
          </div>
          {query && (
            <PhButton size="sm" variant="ghost" onClick={() => setQuery('')} icon={<I.close size={12} />} />
          )}
          <Kbd keys={['↵']} />
        </div>

        {/* RESULT */}
        {showResult && (
          <div
            className="px-4.5 py-3.5 border-b-[0.5px] border-divider"
            style={{ background: 'rgba(167,139,250,0.04)', padding: '14px 18px' }}
          >
            <div
              className="flex items-center gap-2 text-[10.5px] font-semibold uppercase mb-2"
              style={{ letterSpacing: '0.08em', color: 'var(--fg-dim)' }}
            >
              <span className="text-accent">Result</span>
              {state === 'loading' && (
                <span
                  className="text-fg-mute"
                  style={{ fontSize: 10.5, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}
                >
                  · streaming · <span className="ph-mono">{streamed.length}/{total} chars</span>
                </span>
              )}
              <span className="flex-1" />
              {state === 'result' && (
                <>
                  <PhButton size="sm" variant="ghost" icon={<I.copy size={11} />}>
                    Copy
                  </PhButton>
                  <PhButton size="sm" variant="ghost" icon={<I.refresh size={11} />} onClick={() => setState('loading')}>
                    Retry
                  </PhButton>
                </>
              )}
            </div>
            <div className="text-fg" style={{ fontSize: 14, lineHeight: 1.55 }}>
              {streamed}
              {state === 'loading' && (
                <span
                  className="ph-caret inline-block bg-accent ml-0.5 align-text-bottom rounded-[1px]"
                  style={{ width: 8, height: 16 }}
                />
              )}
            </div>
          </div>
        )}

        {/* QUICK ACTIONS */}
        {!showResult && (
          <div className="px-3.5 pt-3 pb-1.5">
            <SectionLabel>
              <span>{query ? `Actions matching "${query}"` : 'Quick Actions'}</span>
              <span className="flex-1" />
              <Kbd keys={['↑', '↓']} size="sm" />
              <span className="ml-1">navigate</span>
            </SectionLabel>
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-fg-mute text-[13px]">
                No actions match. Press <Kbd keys={['↵']} size="sm" /> to send as a custom instruction.
              </div>
            ) : (
              <div ref={rowsRef} className="grid grid-cols-2 gap-0.5" role="listbox" aria-label="Quick actions">
                {filtered.map((a, i) => (
                  <div key={a.id} data-row-index={i} role="option" aria-selected={i === focus}>
                    <ActionRow
                      action={a}
                      active={i === focus}
                      onHover={() => setFocus(i)}
                      onClick={() => triggerAction(i)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* RECENT MODES */}
        {!showResult && (
          <div className="px-3.5 pt-1.5 pb-3 border-t-[0.5px] border-divider">
            <SectionLabel>Recent Modes</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {recentModes.map((m, i) => (
                <ModePill key={m} label={m} active={i === 0} />
              ))}
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div
          className="px-3.5 py-2 border-t-[0.5px] border-divider flex items-center gap-3 text-[11px] text-fg-mute"
          style={{ background: 'rgba(255,255,255,0.015)' }}
        >
          <span className="inline-flex items-center gap-1.5">
            <AppIcon
              style={{ width: 14, height: 14, fontSize: 10, borderRadius: 4 }}
            />
            <span className="font-medium text-fg">PromptHelper</span>
          </span>
          <span className="text-fg-dim">·</span>
          <span className="inline-flex items-center gap-1">
            <Kbd keys={['Ctrl', '⇧', '␣']} size="sm" />
            <span>summon</span>
          </span>
          <span className="text-fg-dim">·</span>
          <span className="inline-flex items-center gap-1">
            <Kbd keys={['Esc']} size="sm" />
            <span>dismiss</span>
          </span>
          <span className="flex-1" />
          <span className="inline-flex items-center gap-1">
            <Kbd keys={['⌘', ',']} size="sm" />
            <span>settings</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Kbd keys={['?']} size="sm" />
            <span>help</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center text-[10.5px] font-semibold uppercase mb-1.5 px-1 pt-1"
      style={{ letterSpacing: '0.10em', color: 'var(--fg-dim)' }}
    >
      {children}
    </div>
  );
}
