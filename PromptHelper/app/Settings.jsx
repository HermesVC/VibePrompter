// PromptHelper — Settings window (sidebar + content panel)
// Owns sub-routes: general, shortcuts, modes, providers, history, appearance, advanced, about

const SETTINGS_NAV = [
  { id: 'general',    label: 'General',     icon: <I.cog size={14} /> },
  { id: 'shortcuts',  label: 'Shortcuts',   icon: <I.keyboard size={14} /> },
  { id: 'modes',      label: 'Modes',       icon: <I.layers size={14} /> },
  { id: 'providers',  label: 'Providers',   icon: <I.cloud size={14} /> },
  { id: 'history',    label: 'History',     icon: <I.history size={14} /> },
  { id: 'appearance', label: 'Appearance',  icon: <I.paint size={14} /> },
  { id: 'advanced',   label: 'Advanced',    icon: <I.cpu size={14} /> },
  { id: 'about',      label: 'About',       icon: <I.info size={14} /> },
];

function SettingsWindow({ theme = 'dark', initialTab = 'general' }) {
  const [tab, setTab] = React.useState(initialTab);
  return (
    <PhWindow
      style={{ background: 'var(--bg)' }}
      title="PromptHelper · Settings"
      icon={<span className="ph-mark sm" />}
    >
      <div data-theme={theme} className="ph-root" style={{
        display: 'flex', flex: 1, minHeight: 0, background: 'var(--bg)',
      }}>
        {/* Sidebar */}
        <aside style={{
          width: 220, flex: '0 0 auto', padding: 10,
          borderRight: '.5px solid var(--border)',
          background: 'var(--bg-2)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ padding: '4px 8px 6px' }}>
            <PhInput size="sm" icon={<I.search size={12} />} placeholder="Search settings…" />
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {SETTINGS_NAV.map((n) => (
              <PhNavItem key={n.id} icon={n.icon} label={n.label}
                active={tab === n.id} onClick={() => setTab(n.id)} />
            ))}
          </nav>
          <div style={{ marginTop: 'auto', padding: '8px 10px', fontSize: 11, color: 'var(--fg-dim)' }}>
            <div className="ph-mono">v1.2.0 · build 4421</div>
          </div>
        </aside>

        {/* Content */}
        <main style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '20px 28px 28px' }}>
          {tab === 'general'    && <GeneralPanel />}
          {tab === 'shortcuts'  && <ShortcutsPanel />}
          {tab === 'modes'      && <ModesPanel />}
          {tab === 'providers'  && <ProvidersPanel />}
          {tab === 'history'    && <HistoryPanel />}
          {tab === 'appearance' && <AppearancePanel />}
          {tab === 'advanced'   && <AdvancedPanel />}
          {tab === 'about'      && <AboutPanel />}
        </main>
      </div>
    </PhWindow>
  );
}

function PanelHead({ title, hint, actions }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 18 }}>
      <div style={{ flex: 1 }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--fg-strong)' }}>
          {title}
        </h1>
        {hint && <div style={{ fontSize: 12.5, color: 'var(--fg-mute)', marginTop: 4 }}>{hint}</div>}
      </div>
      {actions}
    </div>
  );
}

// ── General ─────────────────────────────────────────────────────────────────
function GeneralPanel() {
  const [s, setS] = React.useState({
    bootStart: true, minimizeTray: true, closeTray: false,
    autoPaste: true, notify: true, stream: true, clipFallback: false,
    lowMem: false, timeout: 30, concurrent: 3,
  });
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  return (
    <>
      <PanelHead title="General" hint="Behavior and performance defaults." />

      <PhGroup title="Startup">
        <PhSettingRow icon={<I.power size={14} />} label="Launch on system startup"
          control={<PhToggle value={s.bootStart} onChange={(v) => set('bootStart', v)} />} />
        <PhSettingRow icon={<I.list size={14} />} label="Minimize to tray on close"
          hint="Keep PromptHelper running in the background when you close the window."
          control={<PhToggle value={s.minimizeTray} onChange={(v) => set('minimizeTray', v)} />} />
        <PhSettingRow icon={<I.close size={14} />} label="Quit completely on close"
          control={<PhToggle value={s.closeTray} onChange={(v) => set('closeTray', v)} />} />
      </PhGroup>

      <PhGroup title="Behavior">
        <PhSettingRow icon={<I.copy size={14} />} label="Auto-paste result"
          hint="After a transformation, paste back into the source field automatically."
          control={<PhToggle value={s.autoPaste} onChange={(v) => set('autoPaste', v)} />} />
        <PhSettingRow icon={<I.bell size={14} />} label="Show notifications"
          control={<PhToggle value={s.notify} onChange={(v) => set('notify', v)} />} />
        <PhSettingRow icon={<I.sparkles size={14} />} label="Stream AI response"
          hint="Show tokens as they arrive. Disable for faster perceived completion on slow networks."
          control={<PhToggle value={s.stream} onChange={(v) => set('stream', v)} />} />
        <PhSettingRow icon={<I.clipboard size={14} />} label="Clipboard fallback"
          hint="If selection capture fails, use the clipboard contents instead."
          control={<PhToggle value={s.clipFallback} onChange={(v) => set('clipFallback', v)} />} />
      </PhGroup>

      <PhGroup title="Performance">
        <PhSettingRow icon={<I.cpu size={14} />} label="Low memory mode"
          hint="Reduces background workers — slower first response, ~80MB less RAM."
          control={<PhToggle value={s.lowMem} onChange={(v) => set('lowMem', v)} />} />
        <PhSettingRow icon={<I.refresh size={14} />} label="Response timeout"
          hint="Abort if the model hasn't started streaming."
          control={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <PhInput style={{ width: 64 }} value={s.timeout} onChange={(e) => set('timeout', Number(e.target.value))} />
              <span style={{ fontSize: 12, color: 'var(--fg-mute)' }}>seconds</span>
            </div>
          } />
        <PhSettingRow icon={<I.layers size={14} />} label="Concurrent requests"
          hint="Maximum in-flight transformations."
          control={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 140 }}>
                <PhSlider value={s.concurrent} onChange={(v) => set('concurrent', v)} min={1} max={8} step={1} />
              </div>
              <span className="ph-mono" style={{ fontSize: 12, color: 'var(--fg)', minWidth: 14 }}>{s.concurrent}</span>
            </div>
          } />
      </PhGroup>
    </>
  );
}

// ── Shortcuts ───────────────────────────────────────────────────────────────
function ShortcutsPanel() {
  const [recording, setRecording] = React.useState(null);
  const [shortcuts, setShortcuts] = React.useState({
    palette:  ['Ctrl', 'Shift', 'Space'],
    rewrite:  ['Ctrl', 'Shift', 'R'],
    grammar:  ['Ctrl', 'Shift', 'G'],
    summary:  ['Ctrl', 'Shift', 'S'],
    modes:    ['Ctrl', 'Shift', 'M'],
  });

  const items = [
    { id: 'palette', label: 'Open Command Palette', hint: 'The main entry point.', icon: <I.wand size={14} /> },
    { id: 'rewrite', label: 'Rewrite selection',    hint: 'Improve writing in place.', icon: <I.pen size={14} /> },
    { id: 'grammar', label: 'Fix grammar',          hint: 'Quick grammar pass.', icon: <I.text size={14} /> },
    { id: 'summary', label: 'Quick summarize',      hint: 'Compress to bullets.', icon: <I.summarize size={14} /> },
    { id: 'modes',   label: 'Toggle modes',         hint: 'Cycle the active mode.', icon: <I.layers size={14} /> },
  ];

  return (
    <>
      <PanelHead title="Shortcuts" hint="Global keys work in any app on your machine."
        actions={<PhButton variant="ghost" icon={<I.refresh size={13} />}>Reset all</PhButton>} />

      <PhHint icon={<I.info size={13} />} tone="info">
        Click a shortcut to record a new combination. PromptHelper detects conflicts with system shortcuts and other apps.
      </PhHint>

      <div style={{ marginTop: 16 }}>
        {items.map((it) => (
          <PhSettingRow key={it.id} icon={it.icon} label={it.label} hint={it.hint}
            control={
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {recording === it.id ? (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px',
                    background: 'var(--accent-tint)', color: 'var(--accent)',
                    border: '.5px solid var(--accent)', borderRadius: 6,
                    fontSize: 11.5, fontWeight: 500, height: 26,
                  }}>
                    <span className="dot accent ph-pulse" />
                    Press desired shortcut…
                  </span>
                ) : (
                  <button onClick={() => setRecording(it.id)} style={{
                    background: 'var(--surface-2)', border: '.5px solid var(--border-strong)',
                    borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 3, height: 26,
                  }}>
                    <PhKbd keys={shortcuts[it.id]} />
                  </button>
                )}
                {recording === it.id ? (
                  <PhButton size="sm" variant="ghost" onClick={() => setRecording(null)}>Cancel</PhButton>
                ) : (
                  <button style={iconBtnSettings} title="Reset"><I.refresh size={12} /></button>
                )}
              </div>
            } />
        ))}
      </div>
    </>
  );
}

const iconBtnSettings = {
  width: 26, height: 26, border: '.5px solid var(--border-strong)',
  background: 'var(--surface-2)', color: 'var(--fg-mute)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 6, cursor: 'pointer', padding: 0,
};

// ── Modes ───────────────────────────────────────────────────────────────────
const SEED_MODES = [
  { id: 'developer', name: 'Developer', desc: 'Improves technical clarity for developers',
    sys: 'You are a senior software engineer. Rewrite the input to be technically precise, unambiguous, and idiomatic. Preserve all code identifiers exactly. Prefer active voice. Keep it concise — do not add commentary.',
    temp: 0.3, maxTok: 1024, provider: 'inherit', icon: <I.code size={14} /> },
  { id: 'email', name: 'Email', desc: 'Professional email reply',
    sys: 'You write clear, courteous business emails. Match the tone of the source message. Open with a one-line greeting, deliver the message in 2-3 short paragraphs, close warmly.',
    temp: 0.5, maxTok: 800, provider: 'inherit', icon: <I.mail size={14} /> },
  { id: 'friendly', name: 'Friendly', desc: 'Warm, casual tone',
    sys: 'Rewrite the input to sound like a thoughtful friend. Use contractions, light humor where it fits, and keep it warm. Avoid formality.',
    temp: 0.7, maxTok: 600, provider: 'inherit', icon: <I.friendly size={14} /> },
  { id: 'concise', name: 'Concise', desc: 'Tighter, fewer words',
    sys: 'Cut the input to its essential message in 50% or fewer words. Preserve every concrete fact. No filler.',
    temp: 0.2, maxTok: 400, provider: 'inherit', icon: <I.shorten size={14} /> },
  { id: 'technical', name: 'Technical', desc: 'Academic and formal',
    sys: 'Rewrite in academic register. Use precise terminology. Hedge claims appropriately. Cite implied premises explicitly.',
    temp: 0.3, maxTok: 1200, provider: 'inherit', icon: <I.formal size={14} /> },
  { id: 'docs', name: 'Documentation', desc: 'API & technical docs',
    sys: 'You write developer documentation. Lead with what the thing does, then how to use it. Use code fences for snippets. Avoid marketing language.',
    temp: 0.2, maxTok: 1500, provider: 'inherit', icon: <I.text size={14} /> },
];

function ModesPanel() {
  const [modes, setModes] = React.useState(SEED_MODES);
  const [sel, setSel] = React.useState(SEED_MODES[0].id);
  const current = modes.find((m) => m.id === sel) || modes[0];
  const setCurrent = (patch) => setModes((xs) => xs.map((m) => m.id === sel ? { ...m, ...patch } : m));

  return (
    <>
      <PanelHead title="Prompt Modes" hint="Each mode is a saved persona with its own system prompt and parameters."
        actions={
          <div style={{ display: 'flex', gap: 6 }}>
            <PhButton size="sm" variant="ghost" icon={<I.upload size={12} />}>Import</PhButton>
            <PhButton size="sm" variant="ghost" icon={<I.download size={12} />}>Export</PhButton>
            <PhButton size="sm" variant="primary" icon={<I.plus size={12} sw={2.4} />}>New mode</PhButton>
          </div>
        } />

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, height: 'calc(100% - 60px)' }}>
        {/* Mode list */}
        <div style={{
          border: '.5px solid var(--border)', borderRadius: 'var(--r-lg)',
          background: 'var(--surface)', padding: 6,
          display: 'flex', flexDirection: 'column', gap: 1,
          minHeight: 460,
        }}>
          {modes.map((m) => (
            <button key={m.id} onClick={() => setSel(m.id)} style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '7px 10px', border: 0,
              background: sel === m.id ? 'var(--accent-tint)' : 'transparent',
              color: sel === m.id ? 'var(--accent)' : 'var(--fg)',
              borderRadius: 6, cursor: 'pointer', textAlign: 'left',
            }}>
              <span style={{ color: sel === m.id ? 'var(--accent)' : 'var(--fg-mute)', display: 'flex' }}>{m.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: sel === m.id ? 500 : 400 }}>{m.name}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-mute)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Editor */}
        <div style={{
          border: '.5px solid var(--border)', borderRadius: 'var(--r-lg)',
          background: 'var(--surface)', padding: 18,
          display: 'flex', flexDirection: 'column', gap: 16,
          minHeight: 460,
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'var(--accent-tint)', color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '.5px solid var(--accent-tint-2)',
            }}>{current.icon}</span>
            <div style={{ flex: 1 }}>
              <input value={current.name} onChange={(e) => setCurrent({ name: e.target.value })}
                style={{
                  width: '100%', background: 'transparent', border: 0, outline: 0,
                  fontSize: 17, fontWeight: 600, color: 'var(--fg-strong)',
                  fontFamily: 'inherit', padding: 0, letterSpacing: '-0.01em',
                }} />
              <input value={current.desc} onChange={(e) => setCurrent({ desc: e.target.value })}
                style={{
                  width: '100%', background: 'transparent', border: 0, outline: 0,
                  fontSize: 12.5, color: 'var(--fg-mute)', marginTop: 2,
                  fontFamily: 'inherit', padding: 0,
                }} />
            </div>
            <PhButton size="sm" variant="ghost" icon={<I.copy size={12} />}>Duplicate</PhButton>
            <button style={iconBtnSettings}><I.more size={14} /></button>
          </div>

          {/* System prompt */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, flex: 1 }}>System Prompt</span>
              <span style={{ fontSize: 11, color: 'var(--fg-mute)' }} className="ph-mono">{current.sys.length} chars</span>
            </div>
            <textarea value={current.sys} onChange={(e) => setCurrent({ sys: e.target.value })}
              style={{
                width: '100%', minHeight: 110, padding: '10px 12px',
                background: 'var(--surface-2)', border: '.5px solid var(--border-strong)',
                borderRadius: 'var(--r-md)', color: 'var(--fg)',
                fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.55,
                resize: 'vertical', outline: 0,
              }} />
          </div>

          {/* Parameters */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Temperature</label>
              <div style={{ marginTop: 8 }}>
                <PhSlider value={current.temp} onChange={(v) => setCurrent({ temp: v })}
                  min={0} max={1} step={0.05} format={(v) => v.toFixed(2)} label="" />
                <div className="ph-mono" style={{ fontSize: 11.5, color: 'var(--fg)', marginTop: 4 }}>
                  {current.temp.toFixed(2)} <span style={{ color: 'var(--fg-mute)' }}>·</span> {current.temp < 0.4 ? 'Focused' : current.temp < 0.7 ? 'Balanced' : 'Creative'}
                </div>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Max tokens</label>
              <PhInput style={{ marginTop: 8 }} value={current.maxTok}
                onChange={(e) => setCurrent({ maxTok: Number(e.target.value) })} mono />
            </div>
            <div>
              <label style={labelStyle}>Provider override</label>
              <div style={{ marginTop: 8, height: 32, padding: '0 10px',
                background: 'var(--surface-2)', border: '.5px solid var(--border-strong)',
                borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <span style={{ color: 'var(--fg-mute)' }}><I.cloud size={13} /></span>
                <span style={{ flex: 1 }}>Inherit (GPT-4.1)</span>
                <I.chevD size={12} style={{ color: 'var(--fg-mute)' }} />
              </div>
            </div>
          </div>

          {/* Test area */}
          <div style={{
            padding: 12, background: 'var(--surface-2)',
            border: '.5px dashed var(--border-strong)', borderRadius: 'var(--r-md)',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <I.bolt size={12} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 11.5, color: 'var(--fg)', fontWeight: 500 }}>Test prompt</span>
              <span style={{ flex: 1 }} />
              <PhButton size="sm" variant="primary" icon={<I.bolt size={12} />}>Run</PhButton>
            </div>
            <textarea
              defaultValue="i need to push back on the proposed deadline because the design review hasnt happened yet and we dont have signoff"
              style={{
                width: '100%', minHeight: 50, padding: '8px 10px',
                background: 'var(--bg)', border: '.5px solid var(--border)',
                borderRadius: 6, color: 'var(--fg)',
                fontFamily: 'inherit', fontSize: 12.5, resize: 'none', outline: 0,
              }} />
          </div>
        </div>
      </div>
    </>
  );
}

const labelStyle = { fontSize: 11, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 };

// ── Providers ───────────────────────────────────────────────────────────────
function ProvidersPanel() {
  const [sel, setSel] = React.useState('openai');
  const providers = [
    { id: 'openai',    name: 'OpenAI',    accent: 'var(--openai)',    glyph: ProviderGlyphs.openai(20),    status: 'ok',   model: 'gpt-4.1', usage: 12420 },
    { id: 'anthropic', name: 'Anthropic', accent: 'var(--anthropic)', glyph: ProviderGlyphs.anthropic(18), status: 'ok',   model: 'claude-3-5-sonnet-20241022', usage: 3140 },
    { id: 'gemini',    name: 'Google Gemini', accent: 'var(--gemini)', glyph: ProviderGlyphs.gemini(20),   status: 'idle', model: 'gemini-2.0-pro', usage: 0 },
    { id: 'ollama',    name: 'Ollama',    accent: 'var(--ollama)',    glyph: ProviderGlyphs.ollama(20),    status: 'ok',   model: 'llama3.1:8b', usage: 880, local: true },
  ];
  const current = providers.find((p) => p.id === sel);

  return (
    <>
      <PanelHead title="Providers" hint="Bring your own keys. PromptHelper routes per-mode."
        actions={<PhButton size="sm" variant="primary" icon={<I.plus size={12} sw={2.4} />}>Add provider</PhButton>} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 18 }}>
        {providers.map((p) => (
          <PhSelectCard key={p.id}
            icon={p.glyph}
            accent={p.accent}
            title={p.name}
            hint={<span className="ph-mono" style={{ fontSize: 11 }}>{p.model}</span>}
            selected={sel === p.id}
            onClick={() => setSel(p.id)}
            status={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: p.status === 'ok' ? 'var(--ok)' : 'var(--fg-dim)' }}>
                <span className={`dot ${p.status === 'ok' ? 'ok' : 'idle'}`} />
                {p.status === 'ok' ? 'Connected' : 'Not configured'}
              </span>
            }
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--fg-mute)' }}>
              <I.bolt size={11} />
              <span className="ph-mono">{p.usage.toLocaleString()}</span>
              <span>requests this month</span>
              {p.local && (
                <>
                  <span style={{ color: 'var(--fg-dim)' }}>·</span>
                  <span style={{ color: 'var(--ok)' }}>Local</span>
                </>
              )}
            </div>
          </PhSelectCard>
        ))}
      </div>

      {/* Detail */}
      <div style={{
        background: 'var(--surface)', border: '.5px solid var(--border)',
        borderRadius: 'var(--r-lg)', padding: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{
            width: 32, height: 32, borderRadius: 8,
            background: `${current.accent}22`, color: current.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '.5px solid var(--border)',
          }}>{current.glyph}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--fg-strong)' }}>{current.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-mute)' }} className="ph-mono">{current.model}</div>
          </div>
          <PhButton size="sm" variant="ghost" icon={<I.refresh size={12} />}>Test</PhButton>
        </div>

        {current.id === 'ollama' ? (
          <OllamaConfig />
        ) : (
          <CloudConfig provider={current} />
        )}
      </div>
    </>
  );
}

function CloudConfig({ provider }) {
  const [show, setShow] = React.useState(false);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <div style={{ gridColumn: '1 / -1' }}>
        <label style={labelStyle}>API Key</label>
        <PhInput style={{ marginTop: 8 }} mono type={show ? 'text' : 'password'}
          value="sk-proj-7Kx9_••••••••••••••••••••••••PqR4"
          suffix={
            <button onClick={() => setShow((v) => !v)} style={iconBtnSettings}>
              {show ? <I.eyeOff size={13} /> : <I.eye size={13} />}
            </button>
          } />
      </div>
      <div>
        <label style={labelStyle}>Endpoint URL</label>
        <PhInput style={{ marginTop: 8 }} mono
          defaultValue={provider.id === 'openai' ? 'https://api.openai.com/v1' : provider.id === 'anthropic' ? 'https://api.anthropic.com' : 'https://generativelanguage.googleapis.com'} />
      </div>
      <div>
        <label style={labelStyle}>Default model</label>
        <div style={{ marginTop: 8, height: 32, padding: '0 10px',
          background: 'var(--surface-2)', border: '.5px solid var(--border-strong)',
          borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <span style={{ flex: 1 }} className="ph-mono">{provider.model}</span>
          <I.chevD size={12} style={{ color: 'var(--fg-mute)' }} />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Timeout</label>
        <PhInput style={{ marginTop: 8 }} defaultValue="30 seconds" />
      </div>
      <div>
        <label style={labelStyle}>Max retries</label>
        <PhInput style={{ marginTop: 8 }} defaultValue="3" />
      </div>
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
        <PhToggle value={true} onChange={() => {}} size="sm" />
        <span style={{ fontSize: 12.5, color: 'var(--fg)' }}>Stream responses</span>
        <span style={{ flex: 1 }} />
        <PhToggle value={true} onChange={() => {}} size="sm" />
        <span style={{ fontSize: 12.5, color: 'var(--fg)' }}>Auto-fallback to next provider on error</span>
      </div>
    </div>
  );
}

function OllamaConfig() {
  const models = [
    { name: 'llama3.1:8b',       size: '4.7 GB', active: true,  pulled: '2d ago' },
    { name: 'qwen2.5-coder:7b',  size: '4.4 GB', active: false, pulled: '5d ago' },
    { name: 'mistral:7b-instruct', size: '4.1 GB', active: false, pulled: '1w ago' },
    { name: 'phi3:mini',         size: '2.3 GB', active: false, pulled: '2w ago' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label style={labelStyle}>Endpoint</label>
          <PhInput style={{ marginTop: 8 }} mono defaultValue="http://localhost:11434" />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>CPU</label>
            <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--surface-2)', border: '.5px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: 12 }}>
              <div className="ph-mono">12 cores · 14% used</div>
              <Bar pct={14} />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>GPU</label>
            <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--surface-2)', border: '.5px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: 12 }}>
              <div className="ph-mono" style={{ color: 'var(--ok)' }}>RTX 4070 · ready</div>
              <Bar pct={6} tone="ok" />
            </div>
          </div>
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <span style={labelStyle}>Installed models</span>
          <span style={{ flex: 1 }} />
          <PhButton size="sm" variant="ghost" icon={<I.refresh size={12} />}>Refresh</PhButton>
          <PhButton size="sm" icon={<I.download size={12} />}>Pull model</PhButton>
        </div>
        <div style={{ border: '.5px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
          {models.map((m, i) => (
            <div key={m.name} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px',
              background: m.active ? 'var(--accent-tint)' : i % 2 ? 'var(--surface-2)' : 'transparent',
              borderTop: i ? '.5px solid var(--divider)' : 0,
              fontSize: 12.5,
            }}>
              <I.cpu size={13} style={{ color: m.active ? 'var(--accent)' : 'var(--fg-mute)' }} />
              <span className="ph-mono" style={{ flex: 1, color: m.active ? 'var(--accent)' : 'var(--fg)', fontWeight: m.active ? 500 : 400 }}>{m.name}</span>
              <span style={{ color: 'var(--fg-mute)', fontSize: 11.5 }}>{m.size}</span>
              <span style={{ color: 'var(--fg-dim)', fontSize: 11.5, width: 64, textAlign: 'right' }}>{m.pulled}</span>
              {m.active ? <PhPill tone="accent">Active</PhPill> : <PhButton size="sm" variant="ghost">Use</PhButton>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Bar({ pct, tone }) {
  return (
    <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 2, marginTop: 6 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: tone === 'ok' ? 'var(--ok)' : 'var(--accent)', borderRadius: 2 }} />
    </div>
  );
}

// ── History ─────────────────────────────────────────────────────────────────
const HISTORY_ITEMS = [
  { id: 1, mode: 'Developer', icon: <I.code size={12} />, provider: 'GPT-4.1', when: '2 min ago', ms: 1240,
    src: 'the function basically just loops through the items and skips the ones that are null',
    out: 'The function iterates over the collection, filtering out null entries before processing.',
    fav: true },
  { id: 2, mode: 'Email', icon: <I.mail size={12} />, provider: 'Claude 3.5 Sonnet', when: '12 min ago', ms: 2180,
    src: 'thanks for the quick turnaround. lets sync friday',
    out: 'Thank you for the quick turnaround on this. Could we sync briefly on Friday afternoon to walk through the next steps?' },
  { id: 3, mode: 'Concise', icon: <I.shorten size={12} />, provider: 'GPT-4.1', when: '34 min ago', ms: 980,
    src: 'I wanted to follow up regarding the proposal we discussed in our last meeting because there are several outstanding items that need clarification before we can move forward with the implementation.',
    out: 'Following up — several items need clarification before we move forward.' },
  { id: 4, mode: 'Documentation', icon: <I.text size={12} />, provider: 'Claude 3.5 Sonnet', when: '1 hr ago', ms: 3120,
    src: 'this hook debounces a value and returns the debounced version',
    out: '`useDebounce(value, delay)` returns the latest value after `delay` ms without changes. Useful for taming high-frequency inputs like search fields.' },
  { id: 5, mode: 'Friendly', icon: <I.friendly size={12} />, provider: 'GPT-4.1', when: '2 hr ago', ms: 1420,
    src: 'I am writing to inform you that the meeting has been rescheduled',
    out: "Hey! Quick heads up — we ended up bumping the meeting. New time coming over shortly.",
    fav: true },
  { id: 6, mode: 'Developer', icon: <I.code size={12} />, provider: 'llama3.1:8b', when: 'yesterday', ms: 4280,
    src: 'fix bug where component renders twice on mount',
    out: 'fix(home): prevent double-mount render caused by missing useEffect dependency' },
  { id: 7, mode: 'Formal', icon: <I.formal size={12} />, provider: 'Claude 3.5 Sonnet', when: 'yesterday', ms: 1820,
    src: 'we need to push back on this deadline',
    out: 'We would like to formally request an adjustment to the proposed deadline to ensure quality of delivery.' },
];

function HistoryPanel() {
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState(1);
  const items = HISTORY_ITEMS.filter((x) =>
    !q.trim() || x.src.toLowerCase().includes(q.toLowerCase()) || x.out.toLowerCase().includes(q.toLowerCase()));
  const current = HISTORY_ITEMS.find((x) => x.id === sel) || HISTORY_ITEMS[0];

  return (
    <>
      <PanelHead title="History" hint="The last 30 days of transformations. Stored locally."
        actions={
          <div style={{ display: 'flex', gap: 6 }}>
            <PhButton size="sm" variant="ghost" icon={<I.filter size={12} />}>Filter</PhButton>
            <PhButton size="sm" variant="ghost" icon={<I.download size={12} />}>Export</PhButton>
            <PhButton size="sm" variant="danger" icon={<I.trash size={12} />}>Clear all</PhButton>
          </div>
        } />

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PhInput icon={<I.search size={13} />} placeholder="Search history…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={{
            border: '.5px solid var(--border)', borderRadius: 'var(--r-lg)',
            background: 'var(--surface)', overflow: 'hidden',
          }}>
            {items.map((it, i) => (
              <button key={it.id} onClick={() => setSel(it.id)} style={{
                width: '100%', textAlign: 'left', border: 0,
                padding: '10px 12px',
                background: sel === it.id ? 'var(--accent-tint)' : 'transparent',
                borderTop: i ? '.5px solid var(--divider)' : 0,
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PhPill tone="accent" icon={it.icon}>{it.mode}</PhPill>
                  <span style={{ flex: 1 }} />
                  {it.fav && <I.star size={11} fill="currentColor" style={{ color: 'var(--warn)' }} />}
                  <span style={{ fontSize: 10.5, color: 'var(--fg-dim)' }}>{it.when}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--fg)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {it.out}
                </div>
                <div style={{ fontSize: 11, color: 'var(--fg-mute)', display: 'flex', gap: 6 }}>
                  <I.cloud size={10} />
                  <span className="ph-mono">{it.provider}</span>
                  <span style={{ color: 'var(--fg-dim)' }}>·</span>
                  <span className="ph-mono">{(it.ms / 1000).toFixed(2)}s</span>
                </div>
              </button>
            ))}
            {items.length === 0 && (
              <div style={{ padding: 30, textAlign: 'center', fontSize: 13, color: 'var(--fg-mute)' }}>
                No matches for "{q}"
              </div>
            )}
          </div>
        </div>

        {/* Detail */}
        <div style={{
          border: '.5px solid var(--border)', borderRadius: 'var(--r-lg)',
          background: 'var(--surface)', padding: 18,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PhPill tone="accent" icon={current.icon}>{current.mode}</PhPill>
            <span style={{ color: 'var(--fg-dim)' }}>·</span>
            <span className="ph-mono" style={{ fontSize: 11.5, color: 'var(--fg-mute)' }}>{current.provider}</span>
            <span style={{ flex: 1 }} />
            <PhButton size="sm" variant="ghost" icon={<I.star size={12} fill={current.fav ? 'currentColor' : 'none'} />}>{current.fav ? 'Saved' : 'Favorite'}</PhButton>
            <PhButton size="sm" variant="ghost" icon={<I.refresh size={12} />}>Reuse</PhButton>
            <PhButton size="sm" variant="primary" icon={<I.copy size={12} />}>Copy</PhButton>
          </div>

          <div>
            <div style={{ ...labelStyle, marginBottom: 6 }}>Original</div>
            <div style={{
              padding: '10px 12px', background: 'var(--surface-2)',
              border: '.5px solid var(--border)', borderRadius: 'var(--r-md)',
              fontSize: 13, color: 'var(--fg-mute)', lineHeight: 1.55,
            }}>{current.src}</div>
          </div>

          <div>
            <div style={{ ...labelStyle, color: 'var(--accent)', marginBottom: 6 }}>Result</div>
            <div style={{
              padding: '12px 14px', background: 'var(--accent-tint)',
              border: '.5px solid var(--accent-tint-2)', borderRadius: 'var(--r-md)',
              fontSize: 13.5, color: 'var(--fg)', lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
            }}>{current.out}</div>
          </div>

          <div style={{
            marginTop: 'auto', display: 'flex', gap: 12, alignItems: 'center',
            padding: '10px 12px', background: 'var(--surface-2)',
            border: '.5px solid var(--border)', borderRadius: 'var(--r-md)',
            fontSize: 11.5, color: 'var(--fg-mute)',
          }}>
            <span><span style={{ color: 'var(--fg-dim)' }}>When </span><span className="ph-mono">{current.when}</span></span>
            <span><span style={{ color: 'var(--fg-dim)' }}>Latency </span><span className="ph-mono">{current.ms}ms</span></span>
            <span><span style={{ color: 'var(--fg-dim)' }}>Tokens </span><span className="ph-mono">~{Math.round(current.out.length / 3.5)}</span></span>
            <span style={{ flex: 1 }} />
            <button style={{ ...iconBtnSettings, color: 'var(--danger)' }} title="Delete"><I.trash size={12} /></button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Appearance ──────────────────────────────────────────────────────────────
function AppearancePanel() {
  const [theme, setTheme] = React.useState('dark');
  const [accent, setAccent] = React.useState('violet');
  const [density, setDensity] = React.useState('regular');
  const accents = [
    { id: 'violet', color: '#a78bfa' },
    { id: 'blue', color: '#6b8afd' },
    { id: 'green', color: '#34d399' },
    { id: 'amber', color: '#fbbf24' },
    { id: 'rose', color: '#fb7185' },
    { id: 'mono', color: '#e5e7eb' },
  ];
  return (
    <>
      <PanelHead title="Appearance" hint="Customize how PromptHelper looks across the app." />

      <PhGroup title="Theme">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {['dark', 'light', 'system'].map((t) => (
            <button key={t} onClick={() => setTheme(t)} style={{
              padding: 12, cursor: 'pointer', textAlign: 'left',
              background: 'var(--surface)',
              border: theme === t ? '.5px solid var(--accent)' : '.5px solid var(--border)',
              borderRadius: 'var(--r-lg)',
              boxShadow: theme === t ? 'var(--accent-glow)' : 'none',
            }}>
              <div style={{
                height: 60, borderRadius: 6, marginBottom: 8,
                background: t === 'dark' ? '#0a0b0f' : t === 'light' ? '#f6f6f8' : 'linear-gradient(90deg, #0a0b0f 0%, #0a0b0f 50%, #f6f6f8 50%, #f6f6f8 100%)',
                border: '.5px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: 24, height: 4, background: t === 'light' ? '#16181f' : '#e8eaef', borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--fg)' }}>{t.charAt(0).toUpperCase() + t.slice(1)}</div>
            </button>
          ))}
        </div>
      </PhGroup>

      <PhGroup title="Accent">
        <div style={{ display: 'flex', gap: 8 }}>
          {accents.map((a) => (
            <button key={a.id} onClick={() => setAccent(a.id)} style={{
              width: 34, height: 34, borderRadius: 8, cursor: 'pointer',
              background: a.color,
              border: accent === a.id ? '.5px solid var(--fg)' : '.5px solid transparent',
              boxShadow: accent === a.id ? `0 0 0 2px var(--bg), 0 0 0 3.5px ${a.color}` : 'none',
              padding: 0,
            }} />
          ))}
        </div>
      </PhGroup>

      <PhGroup title="Density">
        <div style={{ display: 'inline-flex', padding: 2, background: 'var(--surface-2)', borderRadius: 8, border: '.5px solid var(--border)' }}>
          {['compact', 'regular', 'comfy'].map((d) => (
            <button key={d} onClick={() => setDensity(d)} style={{
              padding: '6px 14px', border: 0, cursor: 'pointer',
              background: density === d ? 'var(--surface)' : 'transparent',
              color: density === d ? 'var(--fg)' : 'var(--fg-mute)',
              borderRadius: 6, fontSize: 12.5, fontWeight: 500,
              boxShadow: density === d ? 'var(--shadow-sm)' : 'none',
            }}>{d.charAt(0).toUpperCase() + d.slice(1)}</button>
          ))}
        </div>
      </PhGroup>

      <PhGroup title="Palette window">
        <PhSettingRow icon={<I.eye size={14} />} label="Transparency"
          control={<div style={{ width: 180 }}><PhSlider value={0.8} onChange={() => {}} format={(v) => `${Math.round(v * 100)}%`} /></div>} />
        <PhSettingRow icon={<I.layers size={14} />} label="Background blur"
          control={<div style={{ width: 180 }}><PhSlider value={0.7} onChange={() => {}} format={(v) => `${Math.round(v * 32)}px`} /></div>} />
        <PhSettingRow icon={<I.pin size={14} />} label="Pin to top of screen"
          hint="Otherwise the palette opens near the cursor."
          control={<PhToggle value={true} onChange={() => {}} />} />
      </PhGroup>
    </>
  );
}

// ── Advanced ────────────────────────────────────────────────────────────────
function AdvancedPanel() {
  return (
    <>
      <PanelHead title="Advanced" hint="Power-user settings. Be careful." />
      <PhGroup title="Data">
        <PhSettingRow icon={<I.history size={14} />} label="Local history retention"
          hint="Older entries are purged automatically."
          control={
            <div style={{ display: 'inline-flex', padding: 2, background: 'var(--surface-2)', borderRadius: 6, border: '.5px solid var(--border)' }}>
              {['7d', '30d', '90d', 'Forever'].map((d, i) => (
                <button key={d} style={{
                  padding: '4px 10px', border: 0, cursor: 'pointer',
                  background: i === 1 ? 'var(--surface)' : 'transparent',
                  color: i === 1 ? 'var(--fg)' : 'var(--fg-mute)',
                  borderRadius: 4, fontSize: 11.5, fontWeight: 500,
                }}>{d}</button>
              ))}
            </div>
          } />
        <PhSettingRow icon={<I.download size={14} />} label="Export all data"
          control={<PhButton size="sm" variant="ghost">Export as JSON</PhButton>} />
        <PhSettingRow icon={<I.trash size={14} />} label="Reset to factory defaults"
          hint="Wipes all settings, modes, and history. Cannot be undone."
          control={<PhButton size="sm" variant="danger">Reset…</PhButton>} />
      </PhGroup>
      <PhGroup title="Developer">
        <PhSettingRow icon={<I.code size={14} />} label="Enable developer tools"
          control={<PhToggle value={false} onChange={() => {}} />} />
        <PhSettingRow icon={<I.cpu size={14} />} label="Log raw model responses"
          hint="Useful for debugging prompt regressions."
          control={<PhToggle value={false} onChange={() => {}} />} />
        <PhSettingRow icon={<I.link size={14} />} label="Custom proxy URL"
          control={<div style={{ width: 240 }}><PhInput mono placeholder="https://proxy.example.com" /></div>} />
      </PhGroup>
    </>
  );
}

// ── About ───────────────────────────────────────────────────────────────────
function AboutPanel() {
  return (
    <>
      <PanelHead title="About" />
      <div style={{
        background: 'var(--surface)', border: '.5px solid var(--border)',
        borderRadius: 'var(--r-lg)', padding: 24, display: 'flex', gap: 18, alignItems: 'center',
      }}>
        <span className="ph-mark xl" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--fg-strong)' }}>PromptHelper</div>
          <div style={{ fontSize: 12.5, color: 'var(--fg-mute)', marginTop: 2 }}>
            A blazing-fast AI command palette for your entire operating system.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10, fontSize: 11.5, color: 'var(--fg-mute)' }} className="ph-mono">
            <span>v1.2.0</span>
            <span style={{ color: 'var(--fg-dim)' }}>·</span>
            <span>build 4421</span>
            <span style={{ color: 'var(--fg-dim)' }}>·</span>
            <span>x86_64-pc-windows-msvc</span>
          </div>
        </div>
        <PhButton variant="primary" icon={<I.download size={13} />}>Check for updates</PhButton>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 16 }}>
        {[
          { l: 'Documentation', i: <I.text size={14} /> },
          { l: 'Keyboard cheat sheet', i: <I.keyboard size={14} /> },
          { l: 'Report an issue', i: <I.info size={14} /> },
        ].map((x) => (
          <button key={x.l} style={{
            padding: 14, background: 'var(--surface)', border: '.5px solid var(--border)',
            borderRadius: 'var(--r-lg)', textAlign: 'left', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg)',
          }}>
            <span style={{ color: 'var(--accent)' }}>{x.i}</span>
            <span style={{ flex: 1, fontSize: 13 }}>{x.l}</span>
            <I.arrowR size={13} style={{ color: 'var(--fg-mute)' }} />
          </button>
        ))}
      </div>
    </>
  );
}

Object.assign(window, { SettingsWindow });
