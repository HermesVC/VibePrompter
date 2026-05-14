import { useState } from 'react';
import { I, Group, PanelHead, PhInput, SettingRow, Slider, Toggle } from '@shared/ui';

export function GeneralPanel() {
  const [s, setS] = useState({
    bootStart: true,
    minimizeTray: true,
    closeTray: false,
    autoPaste: true,
    notify: true,
    stream: true,
    clipFallback: false,
    lowMem: false,
    timeout: 30,
    concurrent: 3,
  });
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) =>
    setS((x) => ({ ...x, [k]: v }));

  return (
    <>
      <PanelHead title="General" hint="Behavior and performance defaults." />

      <Group title="Startup">
        <SettingRow
          icon={<I.power size={14} />}
          label="Launch on system startup"
          control={<Toggle value={s.bootStart} onChange={(v) => set('bootStart', v)} />}
        />
        <SettingRow
          icon={<I.list size={14} />}
          label="Minimize to tray on close"
          hint="Keep PromptHelper running in the background when you close the window."
          control={<Toggle value={s.minimizeTray} onChange={(v) => set('minimizeTray', v)} />}
        />
        <SettingRow
          icon={<I.close size={14} />}
          label="Quit completely on close"
          control={<Toggle value={s.closeTray} onChange={(v) => set('closeTray', v)} />}
        />
      </Group>

      <Group title="Behavior">
        <SettingRow
          icon={<I.copy size={14} />}
          label="Auto-paste result"
          hint="After a transformation, paste back into the source field automatically."
          control={<Toggle value={s.autoPaste} onChange={(v) => set('autoPaste', v)} />}
        />
        <SettingRow
          icon={<I.bell size={14} />}
          label="Show notifications"
          control={<Toggle value={s.notify} onChange={(v) => set('notify', v)} />}
        />
        <SettingRow
          icon={<I.sparkles size={14} />}
          label="Stream AI response"
          hint="Show tokens as they arrive. Disable for faster perceived completion on slow networks."
          control={<Toggle value={s.stream} onChange={(v) => set('stream', v)} />}
        />
        <SettingRow
          icon={<I.clipboard size={14} />}
          label="Clipboard fallback"
          hint="If selection capture fails, use the clipboard contents instead."
          control={<Toggle value={s.clipFallback} onChange={(v) => set('clipFallback', v)} />}
        />
      </Group>

      <Group title="Performance">
        <SettingRow
          icon={<I.cpu size={14} />}
          label="Low memory mode"
          hint="Reduces background workers — slower first response, ~80MB less RAM."
          control={<Toggle value={s.lowMem} onChange={(v) => set('lowMem', v)} />}
        />
        <SettingRow
          icon={<I.refresh size={14} />}
          label="Response timeout"
          hint="Abort if the model hasn't started streaming."
          control={
            <div className="flex items-center gap-1.5">
              <PhInput
                style={{ width: 64 }}
                value={s.timeout}
                onChange={(e) => set('timeout', Number(e.target.value))}
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
                  value={s.concurrent}
                  onChange={(v) => set('concurrent', v)}
                  min={1}
                  max={8}
                  step={1}
                />
              </div>
              <span className="ph-mono text-xs text-fg min-w-[14px]">{s.concurrent}</span>
            </div>
          }
        />
      </Group>
    </>
  );
}
