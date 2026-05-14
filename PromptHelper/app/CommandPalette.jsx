// PromptHelper — Command Palette (the hero surface)
// Centered floating panel with mode/provider header, input,
// quick-action grid, mode pills, footer. Interactive: typing,
// keyboard nav over actions, simulated AI streaming preview.

const QUICK_ACTIONS = [
  { id: 'improve',  label: 'Improve Writing',     hint: 'Polish for clarity & tone',          icon: <I.sparkles size={14} />, kbd: ['⌘','I'] },
  { id: 'grammar',  label: 'Fix Grammar',         hint: 'Spelling, punctuation, syntax',       icon: <I.text size={14} />,     kbd: ['⌘','G'] },
  { id: 'summary',  label: 'Summarize',           hint: 'Condense to key points',              icon: <I.summarize size={14}/>, kbd: ['⌘','S'] },
  { id: 'explain',  label: 'Explain',             hint: 'Break it down step by step',          icon: <I.info size={14} />,     kbd: ['⌘','E'] },
  { id: 'translate',label: 'Translate',           hint: 'Detect language and convert',         icon: <I.translate size={14}/>, kbd: ['⌘','T'] },
  { id: 'pro',      label: 'Make Professional',   hint: 'Business-formal register',            icon: <I.formal size={14} />,   kbd: ['⌘','P'] },
  { id: 'friendly', label: 'Make Friendly',       hint: 'Warm and conversational',             icon: <I.friendly size={14} />, kbd: ['⌘','F'] },
  { id: 'shorten',  label: 'Shorten',             hint: 'Tighten by ~50%',                     icon: <I.shorten size={14} />,  kbd: ['⌘','-'] },
  { id: 'expand',   label: 'Expand',              hint: 'Add detail and context',              icon: <I.expand size={14} />,   kbd: ['⌘','+'] },
  { id: 'email',    label: 'Convert to Email',    hint: 'Format as a polite reply',            icon: <I.mail size={14} />,     kbd: ['⌘','M'] },
  { id: 'commit',   label: 'Commit Message',      hint: 'Conventional commits',                icon: <I.code size={14} />,     kbd: ['⌘','/'] },
  { id: 'docs',     label: 'Generate Docs',       hint: 'API & inline comments',               icon: <I.text size={14} />,     kbd: ['⌘','D'] },
];

const RECENT_MODES = ['Developer', 'Email', 'Formal', 'Code Review', 'Documentation', 'Concise'];

const SAMPLE_OUTPUT = "The function iterates over the collection, filtering out null entries before processing each item. This guards against runtime errors in downstream consumers.";

function CommandPalette({ theme = 'dark', state = 'idle', focusIndex: focusIndexProp = 0 }) {
  // state: idle | typing | loading | result
  const [query, setQuery] = React.useState(
    state === 'typing' ? 'improve' :
    state === 'loading' || state === 'result' ? 'improve writing' : ''
  );
  const [focus, setFocus] = React.useState(focusIndexProp);
  const [streamed, setStreamed] = React.useState(state === 'result' ? SAMPLE_OUTPUT : '');

  // Filter actions by query
  const filtered = React.useMemo(() => {
    if (!query.trim()) return QUICK_ACTIONS;
    const q = query.toLowerCase();
    return QUICK_ACTIONS.filter((a) =>
      a.label.toLowerCase().includes(q) || a.hint.toLowerCase().includes(q) || a.id.includes(q));
  }, [query]);

  // Stream effect when state === 'loading'
  React.useEffect(() => {
    if (state !== 'loading') return;
    let i = 0;
    const t = setInterval(() => {
      i += 3;
      setStreamed(SAMPLE_OUTPUT.slice(0, i));
      if (i >= SAMPLE_OUTPUT.length) clearInterval(t);
    }, 35);
    return () => clearInterval(t);
  }, [state]);

  const placeholder = (() => {
    const opts = [
      'Improve selected text…',
      'Generate reply…',
      'Explain this code…',
      'Fix grammar…',
    ];
    return opts[0];
  })();

  return (
    <div data-theme={theme} className="ph-root" style={{
      padding: 24,
      background: 'transparent',
      display: 'flex', justifyContent: 'center',
    }}>
      <div style={{
        width: 680,
        background: 'var(--glass)',
        backdropFilter: 'blur(32px) saturate(160%)',
        WebkitBackdropFilter: 'blur(32px) saturate(160%)',
        border: '.5px solid var(--border-strong)',
        borderRadius: 'var(--r-xl)',
        boxShadow: 'var(--shadow-lg), 0 0 0 1px rgba(255,255,255,0.02), 0 0 80px rgba(167,139,250,0.06)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* TOP BAR */}
        <div style={{
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: '.5px solid var(--divider)',
          fontSize: 11.5,
        }}>
          <PhPill tone="accent" icon={<I.code size={11} />}>Developer Mode</PhPill>
          <span style={{ color: 'var(--fg-dim)' }}>•</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--fg-mute)' }}>
            <span style={{ color: 'var(--openai)', display: 'flex' }}>{ProviderGlyphs.openai(12)}</span>
            <span className="ph-mono">GPT-4.1</span>
          </span>
          <span style={{ color: 'var(--fg-dim)' }}>•</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--fg-mute)' }}>
            <span className="dot ok" />
            <span className="ph-mono">1.2s avg</span>
          </span>
          <span style={{ flex: 1 }} />
          <button style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'transparent', border: 0, color: 'var(--fg-mute)',
            cursor: 'pointer', fontSize: 11, padding: '2px 6px', borderRadius: 4,
          }}>
            <I.layers size={11} />
            Switch mode
            <PhKbd keys={['⌘','K']} size="sm" />
          </button>
        </div>

        {/* MAIN INPUT */}
        <div style={{
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: '.5px solid var(--divider)',
          position: 'relative',
        }}>
          <span style={{ color: 'var(--accent)', display: 'flex' }}>
            {state === 'loading' ? <Spinner size={20} color="var(--accent)" /> : <I.wand size={20} />}
          </span>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              style={{
                width: '100%', background: 'transparent', border: 0, outline: 0,
                fontFamily: 'inherit', fontSize: 18, fontWeight: 400,
                letterSpacing: '-0.01em', color: 'var(--fg-strong)',
                padding: 0, lineHeight: 1.3,
              }} />
          </div>
          {query && (
            <PhButton size="sm" variant="ghost" onClick={() => setQuery('')} icon={<I.close size={12} />} />
          )}
          <PhKbd keys={['↵']} />
        </div>

        {/* RESULT (when loading/result) */}
        {(state === 'loading' || state === 'result') && (
          <div style={{
            padding: '14px 18px',
            background: 'rgba(167,139,250,0.04)',
            borderBottom: '.5px solid var(--divider)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 10.5, color: 'var(--fg-dim)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.08em',
              marginBottom: 8,
            }}>
              <span style={{ color: 'var(--accent)' }}>Result</span>
              {state === 'loading' && (
                <span style={{ color: 'var(--fg-mute)', fontSize: 10.5, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
                  · streaming · <span className="ph-mono">{streamed.length}/{SAMPLE_OUTPUT.length} chars</span>
                </span>
              )}
              <span style={{ flex: 1 }} />
              {state === 'result' && (
                <>
                  <PhButton size="sm" variant="ghost" icon={<I.copy size={11} />}>Copy</PhButton>
                  <PhButton size="sm" variant="ghost" icon={<I.refresh size={11} />}>Retry</PhButton>
                </>
              )}
            </div>
            <div style={{
              fontSize: 14, color: 'var(--fg)', lineHeight: 1.55,
              fontFamily: 'inherit',
            }}>
              {streamed}
              {state === 'loading' && <span className="ph-caret" style={{ display: 'inline-block', width: 8, height: 16, background: 'var(--accent)', verticalAlign: 'text-bottom', marginLeft: 2, borderRadius: 1 }} />}
            </div>
          </div>
        )}

        {/* QUICK ACTIONS GRID */}
        {state !== 'loading' && state !== 'result' && (
          <div style={{ padding: '12px 14px 6px' }}>
            <div style={sectionLabel}>
              <span>{query ? `Actions matching "${query}"` : 'Quick Actions'}</span>
              <span style={{ flex: 1 }} />
              <PhKbd keys={['↑','↓']} size="sm" /> <span style={{ marginLeft: 4 }}>navigate</span>
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--fg-mute)', fontSize: 13 }}>
                No actions match. Press <PhKbd keys={['↵']} size="sm" /> to send as a custom instruction.
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 2,
              }}>
                {filtered.map((a, i) => (
                  <ActionRow key={a.id} action={a} active={i === focus} onHover={() => setFocus(i)} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* RECENT MODES */}
        {state !== 'loading' && state !== 'result' && (
          <div style={{ padding: '6px 14px 12px', borderTop: '.5px solid var(--divider)' }}>
            <div style={sectionLabel}>Recent Modes</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {RECENT_MODES.map((m, i) => <ModePill key={m} label={m} active={i === 0} />)}
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div style={{
          padding: '8px 14px',
          background: 'rgba(255,255,255,0.015)',
          borderTop: '.5px solid var(--divider)',
          display: 'flex', alignItems: 'center', gap: 12,
          fontSize: 11, color: 'var(--fg-mute)',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span className="ph-mark sm" style={{ width: 14, height: 14, fontSize: 10, borderRadius: 4 }} />
            <span style={{ fontWeight: 500, color: 'var(--fg)' }}>PromptHelper</span>
          </span>
          <span style={{ color: 'var(--fg-dim)' }}>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <PhKbd keys={['Ctrl','⇧','␣']} size="sm" />
            <span>summon</span>
          </span>
          <span style={{ color: 'var(--fg-dim)' }}>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <PhKbd keys={['Esc']} size="sm" />
            <span>dismiss</span>
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <PhKbd keys={['⌘',',']} size="sm" />
            <span>settings</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <PhKbd keys={['?']} size="sm" />
            <span>help</span>
          </span>
        </div>
      </div>
    </div>
  );
}

const sectionLabel = {
  display: 'flex', alignItems: 'center',
  fontSize: 10.5, color: 'var(--fg-dim)', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.10em',
  marginBottom: 6, padding: '4px 4px 0',
};

function ActionRow({ action, active, onHover }) {
  return (
    <button onMouseEnter={onHover} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px', border: 0, textAlign: 'left',
      background: active ? 'var(--accent-tint)' : 'transparent',
      color: 'var(--fg)',
      borderRadius: 6, cursor: 'pointer',
      transition: 'background 80ms',
    }}>
      <span style={{
        width: 26, height: 26, borderRadius: 6,
        background: active ? 'var(--accent-tint-2)' : 'var(--surface-2)',
        color: active ? 'var(--accent)' : 'var(--fg-mute)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '.5px solid', borderColor: active ? 'var(--accent-tint-2)' : 'var(--border)',
        flex: '0 0 auto',
      }}>{action.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--fg-strong)', fontWeight: active ? 500 : 450, letterSpacing: '-0.005em' }}>{action.label}</div>
        <div style={{ fontSize: 11, color: 'var(--fg-mute)', marginTop: 1 }}>{action.hint}</div>
      </div>
      {active ? (
        <PhKbd keys={['↵']} />
      ) : (
        <span style={{ opacity: 0.7 }}><PhKbd keys={action.kbd} size="sm" /></span>
      )}
    </button>
  );
}

function ModePill({ label, active }) {
  const [h, setH] = React.useState(false);
  return (
    <button onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 999,
      background: active ? 'var(--accent-tint)' : h ? 'var(--surface-2)' : 'var(--surface)',
      border: '.5px solid', borderColor: active ? 'var(--accent-tint-2)' : 'var(--border)',
      color: active ? 'var(--accent)' : 'var(--fg-mute)',
      fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
      transition: 'background 100ms, color 100ms',
    }}>
      {active && <span className="dot accent" />}
      {label}
    </button>
  );
}

Object.assign(window, { CommandPalette });
