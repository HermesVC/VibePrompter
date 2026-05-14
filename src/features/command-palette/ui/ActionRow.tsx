import { useState } from 'react';
import { I, Kbd, type IconName } from '@shared/ui';
import type { QuickAction } from '../domain';

interface ActionRowProps {
  action: QuickAction;
  active: boolean;
  onHover: () => void;
}

export function ActionRow({ action, active, onHover }: ActionRowProps) {
  const [hover, setHover] = useState(false);
  const isActive = active || hover;
  const Icon = I[action.iconName as IconName];

  return (
    <button
      type="button"
      onMouseEnter={() => {
        setHover(true);
        onHover();
      }}
      onMouseLeave={() => setHover(false)}
      className="flex items-center gap-2.5 px-2.5 py-2 border-0 text-left text-fg rounded-md cursor-pointer transition-colors duration-75"
      style={{ background: isActive ? 'var(--accent-tint)' : 'transparent' }}
    >
      <span
        className="w-[26px] h-[26px] rounded-md flex items-center justify-center flex-shrink-0 border-[0.5px]"
        style={{
          background: isActive ? 'var(--accent-tint-2)' : 'var(--surface-2)',
          color: isActive ? 'var(--accent)' : 'var(--fg-mute)',
          borderColor: isActive ? 'var(--accent-tint-2)' : 'var(--border)',
        }}
      >
        {Icon && <Icon size={14} />}
      </span>
      <div className="flex-1 min-w-0">
        <div
          className="text-[13px] text-fg-strong"
          style={{ fontWeight: isActive ? 500 : 450, letterSpacing: '-0.005em' }}
        >
          {action.label}
        </div>
        <div className="text-[11px] text-fg-mute mt-px">{action.hint}</div>
      </div>
      {isActive ? <Kbd keys={['↵']} /> : (
        <span className="opacity-70">
          <Kbd keys={action.kbd} size="sm" />
        </span>
      )}
    </button>
  );
}
