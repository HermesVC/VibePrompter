import { useEffect, useState } from 'react';
import { I, Kbd, Toggle, AppIcon, type IconName } from '@shared/ui';
import {
  useTrayPrimaryQuery,
  useTraySecondaryQuery,
  useTrayTogglesQuery,
} from '../application/tray.query';
import type { TrayMenuItem } from '../domain';

export function TrayMenu() {
  const { data: toggleConfigs = [] } = useTrayTogglesQuery();
  const { data: primary = [] } = useTrayPrimaryQuery();
  const { data: secondary = [] } = useTraySecondaryQuery();

  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (toggleConfigs.length && Object.keys(toggles).length === 0) {
      setToggles(Object.fromEntries(toggleConfigs.map((c) => [c.id, c.defaultValue])));
    }
  }, [toggleConfigs, toggles]);

  return (
    <div className="ph-root p-2 bg-transparent" style={{ width: 320 }}>
      <div
        className="rounded-lg p-1.5 flex flex-col gap-0.5 text-[13px]"
        style={{
          background: 'var(--glass)',
          backdropFilter: 'blur(28px) saturate(140%)',
          WebkitBackdropFilter: 'blur(28px) saturate(140%)',
          border: '.5px solid var(--border-strong)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2.5 px-2.5 pt-2 pb-2.5 mb-1"
          style={{ borderBottom: '.5px solid var(--divider)' }}
        >
          <AppIcon size="lg" />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-fg-strong">PromptHelper</div>
            <div className="flex items-center gap-1.5 text-[11px] text-fg-mute mt-px">
              <span className="dot ok" />
              Running · GPT-4.1
            </div>
          </div>
          <span className="text-[10.5px] text-fg-dim ph-mono">v1.2.0</span>
        </div>

        {toggleConfigs.map((c) => {
          const Icon = I[c.iconName as IconName];
          return (
            <TrayToggle
              key={c.id}
              icon={Icon ? <Icon /> : null}
              label={c.label}
              kbd={c.kbd}
              value={toggles[c.id] ?? c.defaultValue}
              onChange={(v) => setToggles((t) => ({ ...t, [c.id]: v }))}
            />
          );
        })}

        <Sep />
        {primary.map((it) => (
          <TrayItem key={it.id} item={it} />
        ))}
        <Sep />
        {secondary.map((it) => (
          <TrayItem key={it.id} item={it} />
        ))}
      </div>
    </div>
  );
}

interface TrayToggleProps {
  icon: React.ReactNode;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  kbd?: string[];
}

function TrayToggle({ icon, label, value, onChange, kbd }: TrayToggleProps) {
  return (
    <div
      className="flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer"
      onClick={() => onChange(!value)}
    >
      <span className="text-fg-mute flex w-4">{icon}</span>
      <span className="flex-1 text-[13px] text-fg">{label}</span>
      {kbd && <Kbd keys={kbd} />}
      <Toggle value={value} onChange={onChange} size="sm" />
    </div>
  );
}

function TrayItem({ item }: { item: TrayMenuItem }) {
  const [h, setH] = useState(false);
  const Icon = I[item.iconName as IconName];
  const danger = item.danger;
  const accent = item.accent;
  return (
    <button
      type="button"
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      className="flex items-center gap-2.5 px-2 py-1.5 border-0 rounded-md cursor-pointer text-left w-full text-[13px] transition-[background,color] duration-100"
      style={{
        background: h
          ? danger
            ? 'rgba(248,113,113,.1)'
            : 'var(--accent-tint)'
          : 'transparent',
        color: h
          ? danger
            ? 'var(--danger)'
            : 'var(--accent)'
          : danger
          ? 'var(--danger)'
          : 'var(--fg)',
      }}
    >
      <span
        className="flex w-4"
        style={{
          color: h
            ? danger
              ? 'var(--danger)'
              : 'var(--accent)'
            : accent
            ? 'var(--accent)'
            : 'var(--fg-mute)',
        }}
      >
        {Icon && <Icon />}
      </span>
      <span className="flex-1">{item.label}</span>
      {item.badge && (
        <span className="text-[10.5px] text-ok">
          <span className="dot ok inline-block mr-1" />
          {item.badge}
        </span>
      )}
      {item.kbd && <Kbd keys={item.kbd} />}
    </button>
  );
}

function Sep() {
  return (
    <div className="h-px mx-1.5 my-1" style={{ background: 'var(--divider)' }} />
  );
}
