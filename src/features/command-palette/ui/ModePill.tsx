import { useState } from 'react';

interface ModePillProps {
  label: string;
  active?: boolean;
}

export function ModePill({ label, active }: ModePillProps) {
  const [h, setH] = useState(false);
  return (
    <button
      type="button"
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium cursor-pointer border-[0.5px] transition-[background,color] duration-100"
      style={{
        background: active ? 'var(--accent-tint)' : h ? 'var(--surface-2)' : 'var(--surface)',
        borderColor: active ? 'var(--accent-tint-2)' : 'var(--border)',
        color: active ? 'var(--accent)' : 'var(--fg-mute)',
      }}
    >
      {active && <span className="dot accent" />}
      {label}
    </button>
  );
}
