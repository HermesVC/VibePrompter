// PromptHelper — shared UI primitives
// All components read theme tokens from CSS vars (tokens.css). No styled-system,
// no Tailwind. Inline styles + a few class names so the React layer ports cleanly
// to a Vite project later.

// ── Button ──────────────────────────────────────────────────────────────────
function PhButton({
  variant = 'default', size = 'md', tone, icon, kbd, full, active,
  loading, disabled, children, onClick, style, ...rest
}) {
  const sizes = {
    sm: { h: 26, px: 10, fs: 12 },
    md: { h: 32, px: 12, fs: 13 },
    lg: { h: 38, px: 16, fs: 14 },
  };
  const s = sizes[size] || sizes.md;
  const variants = {
    default: { bg: 'var(--surface-2)', fg: 'var(--fg)', bd: '.5px solid var(--border-strong)', hb: 'var(--surface-3)' },
    primary: { bg: 'var(--accent)', fg: '#1a0f2e', bd: '.5px solid transparent', hb: 'var(--accent-hi)' },
    ghost:   { bg: 'transparent', fg: 'var(--fg)', bd: '.5px solid transparent', hb: 'var(--surface-2)' },
    subtle:  { bg: 'var(--accent-tint)', fg: 'var(--accent)', bd: '.5px solid transparent', hb: 'var(--accent-tint-2)' },
    danger:  { bg: 'transparent', fg: 'var(--danger)', bd: '.5px solid var(--border-strong)', hb: 'rgba(248,113,113,.1)' },
    outline: { bg: 'transparent', fg: 'var(--fg)', bd: '.5px solid var(--border-strong)', hb: 'var(--surface-2)' },
  };
  const v = variants[variant] || variants.default;
  const [h, setH] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      disabled={disabled}
      style={{
        height: s.h, padding: `0 ${s.px}px`, fontSize: s.fs,
        fontWeight: 500, lineHeight: 1, letterSpacing: '-0.005em',
        background: active ? 'var(--accent-tint-2)' : (h ? v.hb : v.bg),
        color: active ? 'var(--accent)' : v.fg,
        border: v.bd,
        borderRadius: 'var(--r-md)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        width: full ? '100%' : undefined,
        transition: 'background 120ms, color 120ms, border-color 120ms, transform 120ms',
        userSelect: 'none', whiteSpace: 'nowrap',
        ...(variant === 'primary' && !disabled ? { boxShadow: '0 0 0 .5px rgba(255,255,255,.12) inset, 0 4px 14px -6px var(--accent)' } : {}),
        ...style,
      }}
      {...rest}
    >
      {loading ? <Spinner size={12} /> : icon}
      {children}
      {kbd && <span className="kbd-row" style={{ marginLeft: 4 }}>{kbd}</span>}
    </button>
  );
}

// ── Input ────────────────────────────────────────────────────────────────────
function PhInput({ icon, suffix, size = 'md', mono, style, inputStyle, ...rest }) {
  const sizes = { sm: 28, md: 32, lg: 38 };
  const h = sizes[size] || sizes.md;
  const [focus, setFocus] = React.useState(false);
  return (
    <div className="ph-row" style={{
      height: h, gap: 8, padding: '0 10px',
      background: 'var(--surface-2)',
      border: focus ? '.5px solid var(--accent)' : '.5px solid var(--border-strong)',
      borderRadius: 'var(--r-md)',
      boxShadow: focus ? 'var(--accent-glow)' : 'none',
      transition: 'border-color 120ms, box-shadow 120ms',
      ...style,
    }}>
      {icon && <span style={{ color: 'var(--fg-mute)', display: 'flex', flex: '0 0 auto' }}>{icon}</span>}
      <input
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          flex: 1, minWidth: 0, height: '100%',
          background: 'transparent', border: 0, outline: 0,
          fontSize: 13, color: 'var(--fg)',
          fontFamily: mono ? 'var(--mono)' : 'inherit',
          letterSpacing: '-0.005em',
          ...inputStyle,
        }}
        {...rest}
      />
      {suffix}
    </div>
  );
}

// ── Toggle ──────────────────────────────────────────────────────────────────
function PhToggle({ value, onChange, size = 'md' }) {
  const sizes = { sm: { w: 28, h: 16, dot: 12 }, md: { w: 34, h: 20, dot: 16 } };
  const s = sizes[size] || sizes.md;
  return (
    <button
      role="switch" aria-checked={!!value}
      onClick={() => onChange && onChange(!value)}
      style={{
        width: s.w, height: s.h, padding: 0, border: 0, cursor: 'pointer',
        borderRadius: 999,
        background: value ? 'var(--accent)' : 'var(--surface-3)',
        position: 'relative',
        transition: 'background 160ms',
        flex: '0 0 auto',
        boxShadow: value ? '0 0 0 .5px rgba(255,255,255,.1) inset' : '0 0 0 .5px var(--border-strong) inset',
      }}
    >
      <span style={{
        position: 'absolute', top: (s.h - s.dot) / 2,
        left: value ? s.w - s.dot - (s.h - s.dot) / 2 : (s.h - s.dot) / 2,
        width: s.dot, height: s.dot, borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,.4), 0 0 0 .5px rgba(0,0,0,.1)',
        transition: 'left 160ms cubic-bezier(.3,.7,.4,1)',
      }} />
    </button>
  );
}

// ── Spinner ─────────────────────────────────────────────────────────────────
function Spinner({ size = 14, color = 'currentColor' }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      border: `1.5px solid ${color}`, borderRightColor: 'transparent',
      borderRadius: '50%', animation: 'ph-spin 700ms linear infinite',
      opacity: 0.85,
    }} />
  );
}

// ── Window chrome ───────────────────────────────────────────────────────────
function PhWindow({ title, icon, children, footer, controls = true, style }) {
  return (
    <div className="ph-root" style={{ display: 'flex', flexDirection: 'column', ...style }}>
      <div className="ph-titlebar">
        <div className="ph-title">
          {icon || <span className="ph-mark sm" />}
          {title}
        </div>
        {controls && (
          <div className="ph-winctl">
            <button title="Minimize"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5h6" stroke="currentColor" strokeWidth="1.2" /></svg></button>
            <button title="Maximize"><svg width="10" height="10" viewBox="0 0 10 10"><rect x="2" y="2" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg></button>
            <button title="Close" className="close"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.2" /></svg></button>
          </div>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
      {footer}
    </div>
  );
}

// ── Pill (status / mode chip) ───────────────────────────────────────────────
function PhPill({ children, tone = 'default', icon, active, onClick }) {
  const tones = {
    default: { bg: 'var(--surface-2)', fg: 'var(--fg-mute)', bd: 'var(--border)' },
    accent:  { bg: 'var(--accent-tint)', fg: 'var(--accent)', bd: 'transparent' },
    ok:      { bg: 'rgba(52,211,153,.1)', fg: 'var(--ok)', bd: 'transparent' },
    warn:    { bg: 'rgba(251,191,36,.1)', fg: 'var(--warn)', bd: 'transparent' },
    err:     { bg: 'rgba(248,113,113,.1)', fg: 'var(--danger)', bd: 'transparent' },
  };
  const t = tones[tone] || tones.default;
  const Comp = onClick ? 'button' : 'span';
  return (
    <Comp onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      height: 22, padding: '0 8px',
      background: active ? 'var(--accent-tint-2)' : t.bg,
      color: active ? 'var(--accent)' : t.fg,
      border: `.5px solid ${active ? 'var(--accent)' : t.bd}`,
      borderRadius: 999,
      fontSize: 11.5, fontWeight: 500, letterSpacing: '-0.005em',
      lineHeight: 1,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'background 120ms, color 120ms, border-color 120ms',
    }}>
      {icon}
      {children}
    </Comp>
  );
}

// ── Sidebar item (Settings nav) ────────────────────────────────────────────
function PhNavItem({ icon, label, kbd, active, onClick, badge }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', height: 32, padding: '0 10px',
      border: 0, background: active ? 'var(--accent-tint)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--fg)',
      display: 'flex', alignItems: 'center', gap: 10,
      borderRadius: 'var(--r-md)',
      fontSize: 13, fontWeight: active ? 500 : 400,
      cursor: 'pointer', textAlign: 'left',
      transition: 'background 120ms, color 120ms',
      letterSpacing: '-0.005em',
    }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ color: active ? 'var(--accent)' : 'var(--fg-mute)', display: 'flex' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge && <span className="kbd">{badge}</span>}
      {kbd && <span className="kbd">{kbd}</span>}
    </button>
  );
}

// ── Settings row (label + control) ─────────────────────────────────────────
function PhSettingRow({ label, hint, control, icon }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '14px 0', borderBottom: '.5px solid var(--divider)',
    }}>
      {icon && <span style={{ color: 'var(--fg-mute)', display: 'flex' }}>{icon}</span>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: 'var(--fg-mute)', marginTop: 2, lineHeight: 1.45 }}>{hint}</div>}
      </div>
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8 }}>{control}</div>
    </div>
  );
}

// ── Settings group heading ──────────────────────────────────────────────────
function PhGroup({ title, hint, children }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-dim)', fontWeight: 600 }}>{title}</div>
        {hint && <div style={{ fontSize: 12, color: 'var(--fg-mute)', marginTop: 4 }}>{hint}</div>}
      </div>
      {children}
    </section>
  );
}

// ── Keyboard shortcut display (parses "Ctrl+Shift+Space") ──────────────────
function PhKbd({ keys, size = 'sm' }) {
  if (!keys) return null;
  const parts = (Array.isArray(keys) ? keys : keys.split('+')).map((p) => p.trim());
  return (
    <span className="kbd-row">
      {parts.map((k, i) => (
        <span key={i} className={size === 'lg' ? 'kbd lg' : 'kbd'}>
          {k === 'Cmd' ? '⌘' : k === 'Shift' ? '⇧' : k === 'Alt' ? '⌥' : k === 'Ctrl' ? 'Ctrl' : k === 'Enter' ? '↵' : k === 'Esc' ? 'Esc' : k === 'Tab' ? '⇥' : k === 'Up' ? '↑' : k === 'Down' ? '↓' : k}
        </span>
      ))}
    </span>
  );
}

// ── Slider ─────────────────────────────────────────────────────────────────
function PhSlider({ value, onChange, min = 0, max = 1, step = 0.01, label, format }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ width: '100%' }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'var(--fg-mute)' }}>
          <span>{label}</span>
          <span className="ph-mono" style={{ color: 'var(--fg)' }}>{format ? format(value) : value}</span>
        </div>
      )}
      <div style={{ position: 'relative', height: 18 }}>
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)',
          height: 3, background: 'var(--surface-3)', borderRadius: 2,
        }} />
        <div style={{
          position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
          height: 3, width: `${pct}%`, background: 'var(--accent)', borderRadius: 2,
        }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange && onChange(Number(e.target.value))}
          style={{
            position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', margin: 0, width: '100%',
          }} />
        <div style={{
          position: 'absolute', left: `${pct}%`, top: '50%', transform: 'translate(-50%, -50%)',
          width: 14, height: 14, background: '#fff', border: '.5px solid var(--border-strong)',
          borderRadius: '50%', boxShadow: '0 1px 3px rgba(0,0,0,.4)', pointerEvents: 'none',
        }} />
      </div>
    </div>
  );
}

// ── Card group (used for provider cards, mode cards) ───────────────────────
function PhSelectCard({ title, hint, icon, selected, status, onClick, accent, children }) {
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', cursor: 'pointer',
      padding: 14,
      background: selected ? 'var(--accent-tint)' : 'var(--surface-2)',
      border: selected ? '.5px solid var(--accent)' : '.5px solid var(--border)',
      borderRadius: 'var(--r-lg)',
      display: 'flex', flexDirection: 'column', gap: 10,
      transition: 'background 120ms, border-color 120ms',
      position: 'relative',
      boxShadow: selected ? 'var(--accent-glow)' : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {icon && (
          <span style={{
            width: 32, height: 32, borderRadius: 8,
            background: accent ? `${accent}22` : 'var(--surface-3)',
            color: accent || 'var(--fg-mute)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '.5px solid var(--border)',
          }}>{icon}</span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{title}</div>
          {hint && <div style={{ fontSize: 11.5, color: 'var(--fg-mute)', marginTop: 2 }}>{hint}</div>}
        </div>
        {status}
      </div>
      {children}
    </button>
  );
}

// ── Tooltip-ish hint row ────────────────────────────────────────────────────
function PhHint({ children, icon, tone = 'default' }) {
  const tones = {
    default: { bg: 'var(--surface-2)', fg: 'var(--fg-mute)', bd: 'var(--border)' },
    info:    { bg: 'rgba(107,138,253,.08)', fg: 'var(--info)', bd: 'rgba(107,138,253,.2)' },
    warn:    { bg: 'rgba(251,191,36,.08)', fg: 'var(--warn)', bd: 'rgba(251,191,36,.2)' },
  };
  const t = tones[tone] || tones.default;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '8px 10px',
      background: t.bg, border: `.5px solid ${t.bd}`, borderRadius: 'var(--r-md)',
      fontSize: 12, color: t.fg, lineHeight: 1.45,
    }}>
      {icon && <span style={{ flex: '0 0 auto', marginTop: 1, color: t.fg }}>{icon}</span>}
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

Object.assign(window, {
  PhButton, PhInput, PhToggle, PhWindow, PhPill, PhNavItem,
  PhSettingRow, PhGroup, PhKbd, PhSlider, PhSelectCard, PhHint, Spinner,
});
