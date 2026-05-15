import { I, Group, PanelHead, PhInput, SettingRow, Slider, Toggle } from '@shared/ui';
import { useAppSettingsQuery, useSaveSettingsMutation, type AppSettings } from '../../application/settings.query';

export function GeneralPanel() {
  const { data: settings } = useAppSettingsQuery();
  const saveSettings = useSaveSettingsMutation();

  if (!settings) return null;

  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) =>
    saveSettings.mutate({ ...settings, [k]: v });

  return (
    <>
      <PanelHead title="General" hint="Behavior and performance defaults." />

      <Group title="Startup">
        <SettingRow
          icon={<I.power size={14} />}
          label="Launch on system startup"
          control={<Toggle value={settings.boot_start} onChange={(v) => set('boot_start', v)} />}
        />
        <SettingRow
          icon={<I.list size={14} />}
          label="Minimize to tray on close"
          hint="Keep PromptHelper running in the background when you close the window."
          control={<Toggle value={settings.minimize_to_tray} onChange={(v) => set('minimize_to_tray', v)} />}
        />
        <SettingRow
          icon={<I.close size={14} />}
          label="Quit completely on close"
          control={<Toggle value={settings.quit_on_close} onChange={(v) => set('quit_on_close', v)} />}
        />
      </Group>

      <Group title="Behavior">
        <SettingRow
          icon={<I.copy size={14} />}
          label="Auto-paste result"
          hint="After a transformation, paste back into the source field automatically."
          control={<Toggle value={settings.auto_paste} onChange={(v) => set('auto_paste', v)} />}
        />
        <SettingRow
          icon={<I.bell size={14} />}
          label="Show notifications"
          control={<Toggle value={settings.notifications} onChange={(v) => set('notifications', v)} />}
        />
        <SettingRow
          icon={<I.sparkles size={14} />}
          label="Stream AI response"
          hint="Show tokens as they arrive. Disable for faster perceived completion on slow networks."
          control={<Toggle value={settings.stream_response} onChange={(v) => set('stream_response', v)} />}
        />
        <SettingRow
          icon={<I.clipboard size={14} />}
          label="Clipboard fallback"
          hint="If selection capture fails, use the clipboard contents instead."
          control={<Toggle value={settings.clipboard_fallback} onChange={(v) => set('clipboard_fallback', v)} />}
        />
      </Group>

      <Group title="Performance">
        <SettingRow
          icon={<I.cpu size={14} />}
          label="Low memory mode"
          hint="Reduces background workers — slower first response, ~80MB less RAM."
          control={<Toggle value={settings.low_memory_mode} onChange={(v) => set('low_memory_mode', v)} />}
        />
        <SettingRow
          icon={<I.refresh size={14} />}
          label="Response timeout"
          hint="Abort if the model hasn't started streaming."
          control={
            <div className="flex items-center gap-1.5">
              <PhInput
                style={{ width: 64 }}
                value={settings.response_timeout}
                onChange={(e) => set('response_timeout', Number(e.target.value))}
              />
              <span className="text-xs text-fg-mute">seconds</span>
            </div>
          }
        />
        <SettingRow
          icon={<I.layers size={14} />}
          label="Concurrent requests"
          hint="Maximum in-flight transformations."
          control={
            <div className="flex items-center gap-2">
              <div style={{ width: 140 }}>
                <Slider
                  value={settings.concurrent_requests}
                  onChange={(v) => set('concurrent_requests', v)}
                  min={1}
                  max={8}
                  step={1}
                />
              </div>
              <span className="ph-mono text-xs text-fg min-w-[14px]">{settings.concurrent_requests}</span>
            </div>
          }
        />
      </Group>
    </>
  );
}
