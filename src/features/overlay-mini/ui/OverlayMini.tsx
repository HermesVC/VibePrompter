import { I, PhButton, type IconName } from '@shared/ui';
import { useOverlayEditQuery } from '../application/overlay.query';

export function OverlayMini() {
  const { data: edit } = useOverlayEditQuery();
  if (!edit) return null;
  const ModeIcon = I[edit.modeIconName as IconName];

  return (
    <div className="ph-root p-3 bg-transparent">
      <div
        className="overflow-hidden rounded-lg"
        style={{
          width: 380,
          background: 'var(--glass)',
          backdropFilter: 'blur(24px) saturate(140%)',
          WebkitBackdropFilter: 'blur(24px) saturate(140%)',
          border: '.5px solid var(--border-strong)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div
          className="px-3 py-2 flex items-center gap-2 text-[11.5px]"
          style={{ borderBottom: '.5px solid var(--divider)' }}
        >
          {ModeIcon && <ModeIcon size={12} style={{ color: 'var(--accent)' }} />}
          <span className="text-fg font-medium">{edit.mode}</span>
          <span className="text-fg-dim">·</span>
          <span className="text-fg-mute">Developer mode</span>
          <span className="flex-1" />
          <button
            type="button"
            className="w-7 h-7 border-0 bg-transparent text-fg-mute flex items-center justify-center rounded-md cursor-pointer"
          >
            <I.close size={12} />
          </button>
        </div>

        <div className="px-3 py-2.5 flex flex-col gap-2">
          <div>
            <div
              className="text-[10px] text-fg-dim uppercase font-semibold mb-1"
              style={{ letterSpacing: '0.08em' }}
            >
              Original
            </div>
            <div
              className="text-[12.5px] text-fg-mute px-2 py-1.5 rounded-md"
              style={{
                lineHeight: 1.5,
                background: 'var(--surface-2)',
                border: '.5px solid var(--border)',
                textDecoration: 'line-through',
                textDecorationColor: 'rgba(248,113,113,.4)',
              }}
            >
              {edit.original}
            </div>
          </div>
          <div>
            <div
              className="text-[10px] text-accent uppercase font-semibold mb-1"
              style={{ letterSpacing: '0.08em' }}
            >
              Improved
            </div>
            <div
              className="text-[12.5px] text-fg px-2.5 py-2 rounded-md"
              style={{
                lineHeight: 1.5,
                background: 'var(--accent-tint)',
                border: '.5px solid var(--accent-tint-2)',
              }}
            >
              {edit.improved}
            </div>
          </div>
        </div>

        <div
          className="px-2.5 py-2 flex items-center gap-1"
          style={{
            borderTop: '.5px solid var(--divider)',
            background: 'rgba(255,255,255,.01)',
          }}
        >
          <PhButton
            size="sm"
            variant="primary"
            icon={<I.check size={12} sw={2.4} />}
            kbd={<span className="kbd">↵</span>}
          >
            Accept
          </PhButton>
          <PhButton size="sm" icon={<I.refresh size={12} />}>
            Retry
          </PhButton>
          <PhButton size="sm" icon={<I.pen size={12} />}>
            Edit
          </PhButton>
          <PhButton size="sm" icon={<I.copy size={12} />}>
            Copy
          </PhButton>
          <span className="flex-1" />
          <PhButton size="sm" variant="ghost" kbd={<span className="kbd">Esc</span>}>
            Reject
          </PhButton>
        </div>
      </div>
    </div>
  );
}
