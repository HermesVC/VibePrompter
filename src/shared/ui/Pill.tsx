import type { ReactNode } from 'react';

type Tone = 'neutral' | 'accent' | 'ok' | 'warn';

interface PillProps {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
}

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-fg-mute border-border-strong',
  accent: 'bg-accent-tint text-accent border-accent-tint-2',
  ok: 'bg-[rgba(52,211,153,0.10)] text-ok border-[rgba(52,211,153,0.25)]',
  warn: 'bg-[rgba(251,191,36,0.10)] text-warn border-[rgba(251,191,36,0.25)]',
};

export function Pill({ tone = 'neutral', icon, children }: PillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-[7px] py-0.5 rounded-full text-[10.5px] font-medium leading-[1.4] border-[0.5px] ${TONES[tone]}`}
      style={{ letterSpacing: '-0.005em' }}
    >
      {icon && <span className="flex">{icon}</span>}
      {children}
    </span>
  );
}
