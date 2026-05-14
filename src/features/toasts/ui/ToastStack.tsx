import type { ReactNode } from 'react';
import { I, Kbd, PhButton, Spinner, type IconName } from '@shared/ui';
import { useDemoToastsQuery } from '../application/toasts.query';
import type { ToastModel, ToastTone } from '../domain';

const TONES: Record<ToastTone, { ic: string; bd: string }> = {
  ok: { ic: 'var(--ok)', bd: 'rgba(52,211,153,.25)' },
  err: { ic: 'var(--danger)', bd: 'rgba(248,113,113,.25)' },
  progress: { ic: 'var(--accent)', bd: 'rgba(167,139,250,.25)' },
};

export function ToastStack() {
  const { data: toasts = [] } = useDemoToastsQuery();
  return (
    <div className="ph-root p-5 bg-transparent flex flex-col gap-2.5 justify-end items-end">
      {toasts.map((t) => (
        <Toast key={t.id} model={t} />
      ))}
    </div>
  );
}

function Toast({ model }: { model: ToastModel }) {
  const t = TONES[model.tone];
  const Icon = model.iconName ? I[model.iconName as IconName] : null;
  let icon: ReactNode = null;
  if (model.spinner) icon = <Spinner size={12} color="var(--accent)" />;
  else if (Icon) icon = <Icon size={14} sw={model.tone === 'ok' ? 2.4 : 2.2} />;

  return (
    <div
      className="px-3 py-2.5 flex items-start gap-2.5"
      style={{
        width: 320,
        background: 'var(--glass)',
        backdropFilter: 'blur(20px) saturate(140%)',
        WebkitBackdropFilter: 'blur(20px) saturate(140%)',
        border: '.5px solid',
        borderColor: t.bd,
        borderRadius: 'var(--r-md)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      <span
        className="rounded-md flex items-center justify-center flex-shrink-0 mt-px"
        style={{
          width: 22,
          height: 22,
          background: 'var(--surface-2)',
          color: t.ic,
          border: '.5px solid',
          borderColor: t.bd,
        }}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-fg font-medium" style={{ lineHeight: 1.3 }}>
          {model.title}
        </div>
        {model.hint && <div className="text-[11.5px] text-fg-mute mt-0.5">{model.hint}</div>}
      </div>
      {(model.kbd || model.action) && (
        <div className="flex-shrink-0 flex items-center gap-1">
          {model.kbd && <Kbd keys={model.kbd} />}
          {model.action && (
            <PhButton size="sm" variant="ghost">
              {model.action}
            </PhButton>
          )}
        </div>
      )}
    </div>
  );
}
