import { I, PhButton } from '@shared/ui';
import { TEMPLATES, type Template } from './types';

export function TemplatePicker({
  onPick,
  onCancel,
}: {
  onPick: (t: Template) => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="rounded-lg p-5 flex flex-col gap-4"
      style={{ background: 'var(--surface)', border: '.5px solid var(--border)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="m-0 text-[14px] font-semibold text-fg-strong">Start from a template</h3>
          <span className="text-[11.5px] text-fg-dim">
            Pick a tested prompt as a starting point, or start blank.
          </span>
        </div>
        <PhButton
          size="sm"
          variant="ghost"
          icon={<I.chevL size={12} />}
          onClick={onCancel}
          title="Return to the mode list"
        >
          Back
        </PhButton>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {TEMPLATES.map((t) => {
          const Icon = (I as Record<string, React.ComponentType<{ size?: number }>>)[t.iconName] ?? I.bolt;
          return (
            <button
              key={t.name}
              type="button"
              onClick={() => onPick(t)}
              className="rounded-md p-3 flex items-start gap-2.5 text-left transition-colors"
              style={{
                background: 'var(--bg-2)',
                border: '.5px solid var(--border)',
                color: 'var(--fg)',
                cursor: 'pointer',
              }}
              title={t.desc}
            >
              <span
                className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--accent-tint)', color: 'var(--accent)' }}
              >
                <Icon size={14} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[12.5px] font-medium text-fg-strong">{t.name}</span>
                <span className="block text-[11px] text-fg-dim mt-0.5 truncate">{t.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
