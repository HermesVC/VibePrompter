interface ToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
  size?: 'sm' | 'md';
}

export function Toggle({ value, onChange, size = 'md' }: ToggleProps) {
  const w = size === 'sm' ? 28 : 32;
  const h = size === 'sm' ? 16 : 18;
  const dot = h - 4;
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="relative cursor-pointer border-0 p-0.5 transition-colors"
      style={{
        width: w,
        height: h,
        borderRadius: h,
        background: value ? 'var(--accent)' : 'var(--surface-3)',
        boxShadow: value
          ? 'inset 0 0 0 .5px rgba(255,255,255,0.15)'
          : 'inset 0 0 0 .5px var(--border-strong)',
      }}
    >
      <span
        className="block rounded-full"
        style={{
          width: dot,
          height: dot,
          background: value ? '#1a0f2e' : 'var(--fg-mute)',
          transform: `translateX(${value ? w - dot - 4 : 0}px)`,
          transition: 'transform 160ms cubic-bezier(.34,1.56,.64,1), background 140ms',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        }}
      />
    </button>
  );
}
