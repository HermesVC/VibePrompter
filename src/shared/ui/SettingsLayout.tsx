import type { ReactNode } from 'react';
import { useState } from 'react';

interface NavItemProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  badge?: ReactNode;
}

export function NavItem({ icon, label, active, onClick, badge }: NavItemProps) {
  const [h, setH] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      className="flex items-center gap-[9px] px-2.5 py-1.5 border-0 w-full text-left rounded-md cursor-pointer text-[12.5px] transition-[background,color] duration-100"
      style={{
        background: active ? 'var(--accent-tint)' : h ? 'var(--surface-2)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--fg)',
        fontWeight: active ? 500 : 400,
      }}
    >
      <span
        className="flex"
        style={{ color: active ? 'var(--accent)' : 'var(--fg-mute)' }}
      >
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {badge}
    </button>
  );
}

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-[26px]">
      <h3 className="m-0 mb-2.5 text-[11px] font-semibold text-fg-dim uppercase" style={{ letterSpacing: '0.10em' }}>
        {title}
      </h3>
      <div className="rounded-lg overflow-hidden bg-surface border-[0.5px] border-border">
        {children}
      </div>
    </div>
  );
}

interface SettingRowProps {
  icon?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  control: ReactNode;
}

export function SettingRow({ icon, label, hint, control }: SettingRowProps) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3 border-t-[0.5px] border-divider first:border-t-0">
      {icon && <span className="text-fg-mute flex">{icon}</span>}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-fg">{label}</div>
        {hint && <div className="text-[11.5px] text-fg-mute mt-0.5">{hint}</div>}
      </div>
      <div className="flex-shrink-0">{control}</div>
    </div>
  );
}

interface HintProps {
  icon?: ReactNode;
  tone?: 'info' | 'warn';
  children: ReactNode;
}

const HINT_TONES = {
  info: { bg: 'rgba(96,165,250,0.08)', color: 'var(--info)', border: 'rgba(96,165,250,0.22)' },
  warn: { bg: 'rgba(251,191,36,0.08)', color: 'var(--warn)', border: 'rgba(251,191,36,0.22)' },
};

export function Hint({ icon, tone = 'info', children }: HintProps) {
  const t = HINT_TONES[tone];
  return (
    <div
      className="flex items-start gap-[9px] px-3 py-2 rounded-md text-xs text-fg"
      style={{
        background: t.bg,
        border: `.5px solid ${t.border}`,
        borderRadius: 'var(--r-md)',
      }}
    >
      <span className="flex mt-px" style={{ color: t.color }}>
        {icon}
      </span>
      <span className="flex-1">{children}</span>
    </div>
  );
}

interface PhWindowProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function PhWindow({ title, icon, children, className }: PhWindowProps) {
  return (
    <div
      className={`flex flex-col rounded-xl overflow-hidden bg-bg shadow-lg border-[0.5px] border-border-strong ${className ?? ''}`}
    >
      <div
        className="h-9 flex-shrink-0 px-3 flex items-center gap-2.5 bg-bg-2 border-b-[0.5px] border-border text-xs text-fg-mute"
        style={{ letterSpacing: '-0.005em' }}
      >
        {icon}
        <span className="flex-1 text-center">{title}</span>
        <div className="flex">
          <WinBtn>
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" />
            </svg>
          </WinBtn>
          <WinBtn>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" />
            </svg>
          </WinBtn>
          <WinBtn>
            <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor">
              <line x1="0" y1="0" x2="10" y2="10" />
              <line x1="10" y1="0" x2="0" y2="10" />
            </svg>
          </WinBtn>
        </div>
      </div>
      {children}
    </div>
  );
}

function WinBtn({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      className="w-9 h-9 border-0 p-0 bg-transparent text-fg-mute flex items-center justify-center cursor-pointer hover:bg-surface-2"
    >
      {children}
    </button>
  );
}

export function PanelHead({
  title,
  hint,
  actions,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-end gap-4 mb-[18px]">
      <div className="flex-1">
        <h1 className="m-0 text-[19px] font-semibold text-fg-strong" style={{ letterSpacing: '-0.015em' }}>
          {title}
        </h1>
        {hint && <div className="text-[12.5px] text-fg-mute mt-1">{hint}</div>}
      </div>
      {actions}
    </div>
  );
}
