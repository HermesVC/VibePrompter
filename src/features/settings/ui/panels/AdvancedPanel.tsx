import { useState } from 'react';
import { Group, I, PanelHead, PhButton, PhInput, SettingRow, Toggle } from '@shared/ui';

const RETENTIONS = ['7d', '30d', '90d', 'Forever'];

export function AdvancedPanel() {
  const [retention, setRetention] = useState(1);
  return (
    <>
      <PanelHead title="Advanced" hint="Power-user settings. Be careful." />

      <Group title="Data">
        <SettingRow
          icon={<I.history size={14} />}
          label="Local history retention"
          hint="Older entries are purged automatically."
          control={
            <div
              className="inline-flex p-0.5 rounded-md"
              style={{
                background: 'var(--surface-2)',
                border: '.5px solid var(--border)',
              }}
            >
              {RETENTIONS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setRetention(i)}
                  className="px-2.5 py-1 border-0 cursor-pointer rounded-sm text-[11.5px] font-medium"
                  style={{
                    background: retention === i ? 'var(--surface)' : 'transparent',
                    color: retention === i ? 'var(--fg)' : 'var(--fg-mute)',
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          }
        />
        <SettingRow
          icon={<I.download size={14} />}
          label="Export all data"
          control={<PhButton size="sm" variant="ghost">Export as JSON</PhButton>}
        />
        <SettingRow
          icon={<I.trash size={14} />}
          label="Reset to factory defaults"
          hint="Wipes all settings, modes, and history. Cannot be undone."
          control={<PhButton size="sm" variant="danger">Reset…</PhButton>}
        />
      </Group>

      <Group title="Developer">
        <SettingRow
          icon={<I.code size={14} />}
          label="Enable developer tools"
          control={<Toggle value={false} onChange={() => {}} />}
        />
        <SettingRow
          icon={<I.cpu size={14} />}
          label="Log raw model responses"
          hint="Useful for debugging prompt regressions."
          control={<Toggle value={false} onChange={() => {}} />}
        />
        <SettingRow
          icon={<I.link size={14} />}
          label="Custom proxy URL"
          control={
            <div style={{ width: 240 }}>
              <PhInput mono placeholder="https://proxy.example.com" />
            </div>
          }
        />
      </Group>
    </>
  );
}
