import type { ReactNode } from 'react';
import { useState } from 'react';

interface SelectCardProps {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  accent?: string;
  selected?: boolean;
  onClick?: () => void;
  status?: ReactNode;
  children?: ReactNode;
}

export function SelectCard({
  icon,
  title,
  hint,
  accent,
  selected,
  onClick,
  status,
  children,
}: SelectCardProps) {
  const [h, setH] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      className="flex items-start gap-2.5 p-3 text-left rounded-lg cursor-pointer text-fg relative transition-[background,border-color,box-shadow] duration-100"
      style={{
        background: selected ? 'var(--accent-tint)' : h ? 'var(--surface-2)' : 'var(--surface)',
        border: '.5px solid',
        borderColor: selected ? 'var(--accent)' : 'var(--border)',
        boxShadow: selected ? 'var(--accent-glow)' : 'none',
      }}
    >
      <span
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{
          background: accent ? `${accent}1f` : 'var(--surface-2)',
          color: accent || 'var(--fg)',
          border: '.5px solid',
          borderColor: accent ? `${accent}33` : 'var(--border)',
        }}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-fg-strong">{title}</span>
          {status && (
            <>
              <span className="flex-1" />
              {status}
            </>
          )}
        </div>
        {hint && <div className="text-[11.5px] text-fg-mute mt-0.5">{hint}</div>}
        {children && <div className="mt-2">{children}</div>}
      </div>
    </button>
  );
}
