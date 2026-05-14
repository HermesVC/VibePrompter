// PromptHelper — small surfaces: First-time Setup, Tray Menu, Overlay Mini, Toasts

// ────────────────────────────────────────────────────────────────
// 1. First-time Setup (4-step wizard, single screen with sections)
// ────────────────────────────────────────────────────────────────
function SetupScreen({ theme = 'dark' }) {
  const [provider, setProvider] = React.useState('openai');
  const [apiKey, setApiKey] = React.useState('sk-proj-7Kx9_••••••••••••••••••••••••PqR4');
  const [keyVis, setKeyVis] = React.useState(false);
  const [validated, setValidated] = React.useState(true);
  const [shortcut] = React.useState(['Ctrl', 'Shift', 'Space']);
  const [defaultMode, setDefaultMode] = React.useState('developer');
  const [modeOpen, setModeOpen] = React.useState(false);

  const providers = [
    { id: 'openai',    name: 'OpenAI',    hint: 'GPT-4.1, GPT-4o, o3', accent: 'var(--openai)',    glyph: ProviderGlyphs.openai(20) },
    { id: 'anthropic', name: 'Anthropic', hint: 'Claude 3.5 Sonnet, Haiku', accent: 'var(--anthropic)', glyph: ProviderGlyphs.anthropic(18) },
    { id: 'gemini',    name: 'Gemini',    hint: 'Gemini 2.0 Pro, Flash', accent: 'var(--gemini)',    glyph: ProviderGlyphs.gemini(20) },
    { id: 'ollama',    name: 'Ollama',    hint: 'Run local models on-device', accent: 'var(--ollama)', glyph: ProviderGlyphs.ollama(20) },
  ];
  const modes = ['Professional', 'Developer', 'Grammar', 'Email', 'Friendly'];

  return (
    <div data-theme={theme} className="ph-root" style={{
      background: theme === 'dark'
        ? 'radial-gradient(60% 50% at 50% 0%, rgba(167,139,250,.07), transparent), var(--bg)'
        : 'radial-gradient(60% 50% at 50% 0%, rgba(107,84,214,.06), transparent), var(--bg)',
      overflow: 'auto',
    }}>
      <div style={{
        maxWidth: 640, margin: '0 auto', padding: '40px 32px 48px',
        display: 'flex', flexDirection: 'column', gap: 24,
      }}>
        {/* Welcome */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 4 }}>
          <span className="ph-mark xl" />
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--fg-strong)', letterSpacing: '-0.02em' }}>
              Welcome to PromptHelper
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--fg-mute)', marginTop: 2 }}>
              Transform text anywhere on your PC using AI — three steps to go.
            </div>
          </div>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--fg-mute)' }}>
          <StepDot n="1" label="Provider" done />
          <StepLine done />
          <StepDot n="2" label="API Key" done />
          <StepLine done />
          <StepDot n="3" label="Preferences" active />
        </div>

        {/* Provider selection */}
        <section>
          <GroupHead title="AI Provider" hint="Choose where requests go. You can connect more later." />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {providers.map((p) => (
              <PhSelectCard key={p.id}
                icon={p.glyph}
                title={p.name}
                hint={p.hint}
                accent={p.accent}
                selected={provider === p.id}
                onClick={() => setProvider(p.id)}
                status={provider === p.id && (
                  <span style={{ color: 'var(--accent)' }}><I.check size={14} sw={2.2} /></span>
                )}
              />
            ))}
          </div>
        </section>

        {/* API Key */}
        <section>
          <GroupHead title="API Key" hint="Stored locally in the OS keychain. Never sent to our servers." />
          <PhInput
            mono
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setValidated(false); }}
            type={keyVis ? 'text' : 'password'}
            placeholder="sk-…"
            size="lg"
            icon={<I.link size={14} />}
            suffix={
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setKeyVis((v) => !v)} style={iconBtn}>
                  {keyVis ? <I.eyeOff size={14} /> : <I.eye size={14} />}
                </button>
                <PhButton size="sm" variant={validated ? 'ghost' : 'subtle'}
                  icon={validated ? <I.check size={12} sw={2.4} /> : null}
                  onClick={() => setValidated(true)}>
                  {validated ? 'Valid' : 'Validate'}
                </PhButton>
              </div>
            }
          />
          {validated && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ok)' }}>
              <span className="dot ok" />
              Connected — 6 models available
            </div>
          )}
        </section>

        {/* Shortcut */}
        <section>
          <GroupHead title="Global Shortcut" hint="Press this anywhere to summon PromptHelper." />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: 14, background: 'var(--surface)', border: '.5px solid var(--border)',
            borderRadius: 'var(--r-lg)',
          }}>
            <I.keyboard size={18} style={{ color: 'var(--fg-mute)' }} />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--fg-mute)' }}>Open Command Palette</span>
            <PhKbd keys={shortcut} size="lg" />
            <PhButton size="sm" variant="ghost">Change</PhButton>
          </div>
        </section>

        {/* Default mode */}
        <section>
          <GroupHead title="Default Mode" hint="Used when no mode is selected." />
          <div style={{ position: 'relative' }}>
            <button onClick={() => setModeOpen((o) => !o)} style={{
              width: '100%', textAlign: 'left', cursor: 'pointer',
              height: 40, padding: '0 14px',
              background: 'var(--surface-2)', border: '.5px solid var(--border-strong)',
              borderRadius: 'var(--r-md)',
              display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg)', fontSize: 13.5,
            }}>
              <I.layers size={14} style={{ color: 'var(--accent)' }} />
              {defaultMode.charAt(0).toUpperCase() + defaultMode.slice(1)}
              <span style={{ flex: 1 }} />
              <I.chevD size={12} style={{ color: 'var(--fg-mute)' }} />
            </button>
            {modeOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                background: 'var(--surface-2)', border: '.5px solid var(--border-strong)',
                borderRadius: 'var(--r-md)', padding: 4, zIndex: 5,
                boxShadow: 'var(--shadow-lg)',
              }}>
                {modes.map((m) => (
                  <button key={m} onClick={() => { setDefaultMode(m.toLowerCase()); setModeOpen(false); }}
                    style={{
                      width: '100%', textAlign: 'left', height: 30, padding: '0 10px',
                      border: 0, background: defaultMode === m.toLowerCase() ? 'var(--accent-tint)' : 'transparent',
                      color: defaultMode === m.toLowerCase() ? 'var(--accent)' : 'var(--fg)',
                      borderRadius: 6, fontSize: 13, cursor: 'pointer',
                    }}>{m}</button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Finish */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 0 0', borderTop: '.5px solid var(--divider)',
        }}>
          <span style={{ flex: 1, fontSize: 11.5, color: 'var(--fg-mute)' }}>
            You can change all of this later in Settings · <span className="kbd">⌘</span><span className="kbd" style={{ marginLeft: 1 }}>,</span>
          </span>
          <PhButton variant="ghost" size="md">Skip for now</PhButton>
          <PhButton variant="primary" size="md" icon={<I.bolt size={14} />}>
            Launch Assistant
          </PhButton>
        </div>
      </div>
    </div>
  );
}

const iconBtn = {
  width: 28, height: 28, border: 0, background: 'transparent', color: 'var(--fg-mute)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 6, cursor: 'pointer',
};

function GroupHead({ title, hint }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-strong)', letterSpacing: '-0.005em' }}>{title}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--fg-mute)', marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function StepDot({ n, label, active, done }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 18, height: 18, borderRadius: '50%',
        background: done ? 'var(--accent)' : active ? 'var(--accent-tint-2)' : 'var(--surface-2)',
        color: done ? '#1a0f2e' : active ? 'var(--accent)' : 'var(--fg-mute)',
        border: '.5px solid',
        borderColor: active ? 'var(--accent)' : 'var(--border-strong)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10.5, fontWeight: 600,
      }}>{done ? <I.check size={11} sw={2.4} /> : n}</span>
      <span style={{ color: active || done ? 'var(--fg)' : 'var(--fg-mute)' }}>{label}</span>
    </span>
  );
}
function StepLine({ done }) {
  return <span style={{ flex: 1, height: 1, background: done ? 'var(--accent)' : 'var(--border)' }} />;
}

// ────────────────────────────────────────────────────────────────
// 2. Tray Menu
// ────────────────────────────────────────────────────────────────
function TrayMenu({ theme = 'dark' }) {
  const [enabled, setEnabled] = React.useState(true);
  const [shortcuts, setShortcuts] = React.useState(true);
  const [boot, setBoot] = React.useState(true);
  const [clip, setClip] = React.useState(false);

  return (
    <div data-theme={theme} className="ph-root" style={{
      padding: 8,
      background: 'transparent',
    }}>
      <div style={{
        background: 'var(--glass)',
        backdropFilter: 'blur(28px) saturate(140%)',
        WebkitBackdropFilter: 'blur(28px) saturate(140%)',
        border: '.5px solid var(--border-strong)',
        borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-lg)',
        padding: 6,
        display: 'flex', flexDirection: 'column', gap: 2,
        fontSize: 13,
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 10px 10px', marginBottom: 4,
          borderBottom: '.5px solid var(--divider)',
        }}>
          <span className="ph-mark lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-strong)' }}>PromptHelper</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--fg-mute)', marginTop: 1 }}>
              <span className="dot ok" />
              Running · GPT-4.1
            </div>
          </div>
          <span style={{ fontSize: 10.5, color: 'var(--fg-dim)' }} className="ph-mono">v1.2.0</span>
        </div>

        {/* Toggles */}
        <TrayToggle icon={<I.bolt />} label="Enable AI" value={enabled} onChange={setEnabled} />
        <TrayToggle icon={<I.keyboard />} label="Global shortcuts" value={shortcuts} onChange={setShortcuts} kbd={['Ctrl','⇧','␣']} />
        <TrayToggle icon={<I.power />} label="Start on boot" value={boot} onChange={setBoot} />
        <TrayToggle icon={<I.clipboard />} label="Clipboard monitor" value={clip} onChange={setClip} />

        <Sep />

        <TrayItem icon={<I.wand />} label="Open Palette" kbd={['Ctrl','⇧','␣']} accent />
        <TrayItem icon={<I.layers />} label="Switch Mode" kbd={['Ctrl','⇧','M']} />
        <TrayItem icon={<I.history />} label="History" kbd={['Ctrl','⇧','H']} />
        <TrayItem icon={<I.cog />} label="Settings…" kbd={['⌘',',']} />

        <Sep />

        <TrayItem icon={<I.refresh />} label="Restart service" />
        <TrayItem icon={<I.download />} label="Check for updates" badge="Up to date" />
        <TrayItem icon={<I.power />} label="Quit PromptHelper" danger />
      </div>
    </div>
  );
}

function TrayToggle({ icon, label, value, onChange, kbd }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '6px 8px', borderRadius: 6,
      cursor: 'pointer',
    }} onClick={() => onChange(!value)}>
      <span style={{ color: 'var(--fg-mute)', display: 'flex', width: 16 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13, color: 'var(--fg)' }}>{label}</span>
      {kbd && <PhKbd keys={kbd} />}
      <PhToggle value={value} onChange={onChange} size="sm" />
    </div>
  );
}

function TrayItem({ icon, label, kbd, accent, danger, badge }) {
  const [h, setH] = React.useState(false);
  return (
    <button
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '6px 8px', border: 0,
        background: h ? (danger ? 'rgba(248,113,113,.1)' : 'var(--accent-tint)') : 'transparent',
        color: h ? (danger ? 'var(--danger)' : 'var(--accent)') : (danger ? 'var(--danger)' : 'var(--fg)'),
        borderRadius: 6, cursor: 'pointer', textAlign: 'left', width: '100%',
        fontSize: 13, transition: 'background 100ms, color 100ms',
      }}
    >
      <span style={{
        color: h ? (danger ? 'var(--danger)' : 'var(--accent)') : (accent ? 'var(--accent)' : 'var(--fg-mute)'),
        display: 'flex', width: 16,
      }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge && <span style={{ fontSize: 10.5, color: 'var(--ok)' }}><span className="dot ok" style={{ display: 'inline-block', marginRight: 4 }} />{badge}</span>}
      {kbd && <PhKbd keys={kbd} />}
    </button>
  );
}

function Sep() {
  return <div style={{ height: 1, background: 'var(--divider)', margin: '4px 6px' }} />;
}

// ────────────────────────────────────────────────────────────────
// 3. Overlay mini window — inline accept/reject
// ────────────────────────────────────────────────────────────────
function OverlayMini({ theme = 'dark' }) {
  return (
    <div data-theme={theme} className="ph-root" style={{ padding: 12, background: 'transparent' }}>
      <div style={{
        width: 380,
        background: 'var(--glass)',
        backdropFilter: 'blur(24px) saturate(140%)',
        WebkitBackdropFilter: 'blur(24px) saturate(140%)',
        border: '.5px solid var(--border-strong)',
        borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '8px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: '.5px solid var(--divider)',
          fontSize: 11.5,
        }}>
          <I.wand size={12} style={{ color: 'var(--accent)' }} />
          <span style={{ color: 'var(--fg)', fontWeight: 500 }}>Improved Writing</span>
          <span style={{ color: 'var(--fg-dim)' }}>·</span>
          <span style={{ color: 'var(--fg-mute)' }}>Developer mode</span>
          <span style={{ flex: 1 }} />
          <button style={iconBtn}><I.close size={12} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--fg-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 4 }}>
              Original
            </div>
            <div style={{
              fontSize: 12.5, color: 'var(--fg-mute)', lineHeight: 1.5,
              padding: '6px 8px', background: 'var(--surface-2)',
              borderRadius: 6, border: '.5px solid var(--border)',
              textDecoration: 'line-through', textDecorationColor: 'rgba(248,113,113,.4)',
            }}>
              the function basically just loops through the items and skips the ones that are null
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 4 }}>
              Improved
            </div>
            <div style={{
              fontSize: 12.5, color: 'var(--fg)', lineHeight: 1.5,
              padding: '8px 10px',
              background: 'var(--accent-tint)',
              border: '.5px solid var(--accent-tint-2)',
              borderRadius: 6,
            }}>
              The function iterates over the collection, filtering out null entries before processing.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 10px',
          display: 'flex', alignItems: 'center', gap: 4,
          borderTop: '.5px solid var(--divider)',
          background: 'rgba(255,255,255,.01)',
        }}>
          <PhButton size="sm" variant="primary" icon={<I.check size={12} sw={2.4} />} kbd={<><span className="kbd">↵</span></>}>
            Accept
          </PhButton>
          <PhButton size="sm" icon={<I.refresh size={12} />}>Retry</PhButton>
          <PhButton size="sm" icon={<I.pen size={12} />}>Edit</PhButton>
          <PhButton size="sm" icon={<I.copy size={12} />}>Copy</PhButton>
          <span style={{ flex: 1 }} />
          <PhButton size="sm" variant="ghost" kbd={<span className="kbd">Esc</span>}>Reject</PhButton>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// 4. Toasts (stacked, three variants)
// ────────────────────────────────────────────────────────────────
function ToastStack({ theme = 'dark' }) {
  return (
    <div data-theme={theme} className="ph-root" style={{
      padding: 20, background: 'transparent',
      display: 'flex', flexDirection: 'column', gap: 10,
      justifyContent: 'flex-end', alignItems: 'flex-end',
    }}>
      <Toast tone="progress" icon={<Spinner size={12} color="var(--accent)" />} title="Generating response…" hint="Improving writing · 0.8s" kbd={<span className="kbd">Esc</span>} />
      <Toast tone="ok" icon={<I.check size={14} sw={2.4} />} title="Text improved successfully" hint="Copied to clipboard · 412ms" kbd={<PhKbd keys={['⌘','Z']} />} />
      <Toast tone="err" icon={<I.close size={13} sw={2.2} />} title="API request failed" hint="Rate limit exceeded — retry in 12s" action="Retry" />
    </div>
  );
}

function Toast({ tone, icon, title, hint, kbd, action }) {
  const tones = {
    ok:       { ic: 'var(--ok)',     bd: 'rgba(52,211,153,.25)' },
    err:      { ic: 'var(--danger)', bd: 'rgba(248,113,113,.25)' },
    progress: { ic: 'var(--accent)', bd: 'rgba(167,139,250,.25)' },
  };
  const t = tones[tone] || tones.ok;
  return (
    <div style={{
      width: 320, padding: '10px 12px',
      background: 'var(--glass)',
      backdropFilter: 'blur(20px) saturate(140%)',
      WebkitBackdropFilter: 'blur(20px) saturate(140%)',
      border: '.5px solid', borderColor: t.bd,
      borderRadius: 'var(--r-md)',
      boxShadow: 'var(--shadow-md)',
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <span style={{
        width: 22, height: 22, borderRadius: 6,
        background: 'var(--surface-2)', color: t.ic,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flex: '0 0 auto', marginTop: 1,
        border: '.5px solid', borderColor: t.bd,
      }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500, lineHeight: 1.3 }}>{title}</div>
        {hint && <div style={{ fontSize: 11.5, color: 'var(--fg-mute)', marginTop: 2 }}>{hint}</div>}
      </div>
      {(kbd || action) && (
        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          {kbd}
          {action && <PhButton size="sm" variant="ghost">{action}</PhButton>}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { SetupScreen, TrayMenu, OverlayMini, ToastStack });
