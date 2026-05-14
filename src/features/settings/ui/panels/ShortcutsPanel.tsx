import { useState } from 'react';
import { Hint, I, Kbd, PanelHead, PhButton, SettingRow, type IconName } from '@shared/ui';
import { useShortcutsQuery } from '../../application/settings.query';

export function ShortcutsPanel() {
  const { data: items = [] } = useShortcutsQuery();
  const [recording, setRecording] = useState<string | null>(null);
  const [shortcuts, setShortcuts] = useState<Record<string, string[]>>({});

  const keysFor = (id: string, fallback: string[]) => shortcuts[id] ?? fallback;

  return (
    <>
      <PanelHead
        title="Shortcuts"
        hint="Global keys work in any app on your machine."
        actions={
          <PhButton variant="ghost" icon={<I.refresh size={13} />} onClick={() => setShortcuts({})}>
            Reset all
          </PhButton>
        }
      />

      <Hint icon={<I.info size={13} />} tone="info">
        Click a shortcut to record a new combination. PromptHelper detects conflicts with system
        shortcuts and other apps.
      </Hint>

      <div className="mt-4">
        {items.map((it) => {
          const Icon = I[it.iconName as IconName];
          return (
            <SettingRow
              key={it.id}
              icon={Icon ? <Icon size={14} /> : null}
              label={it.label}
              hint={it.hint}
              control={
                <div className="flex items-center gap-1.5">
                  {recording === it.id ? (
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium h-[26px]"
                      style={{
                        background: 'var(--accent-tint)',
                        color: 'var(--accent)',
                        border: '.5px solid var(--accent)',
                      }}
                    >
                      <span className="dot accent ph-pulse" />
                      Press desired shortcut…
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRecording(it.id)}
                      className="rounded-md px-2 py-[3px] cursor-pointer inline-flex items-center gap-[3px] h-[26px]"
                      style={{
                        background: 'var(--surface-2)',
                        border: '.5px solid var(--border-strong)',
                      }}
                    >
                      <Kbd keys={keysFor(it.id, it.keys)} />
                    </button>
                  )}
                  {recording === it.id ? (
                    <PhButton size="sm" variant="ghost" onClick={() => setRecording(null)}>
                      Cancel
                    </PhButton>
                  ) : (
                    <button
                      type="button"
                      title="Reset"
                      className="w-[26px] h-[26px] rounded-md flex items-center justify-center cursor-pointer p-0"
                      style={{
                        background: 'var(--surface-2)',
                        border: '.5px solid var(--border-strong)',
                        color: 'var(--fg-mute)',
                      }}
                    >
                      <I.refresh size={12} />
                    </button>
                  )}
                </div>
              }
            />
          );
        })}
      </div>
    </>
  );
}
