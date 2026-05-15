import { useEffect, useState } from 'react';
import { EmptyState, I, PanelHead, PhButton, PhInput, Slider, type IconName } from '@shared/ui';
import { useModesQuery } from '../../application/settings.query';
import type { PromptMode } from '../../domain';

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--fg-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontWeight: 600,
};

export function ModesPanel() {
  const { data: seed = [], isLoading } = useModesQuery();
  const [modes, setModes] = useState<PromptMode[]>([]);
  const [sel, setSel] = useState<string>('');

  useEffect(() => {
    if (seed.length && modes.length === 0) {
      setModes(seed);
      setSel(seed[0].id);
    }
  }, [seed, modes.length]);

  const current = modes.find((m) => m.id === sel) ?? modes[0];
  const setCurrent = (patch: Partial<PromptMode>) =>
    setModes((xs) => xs.map((m) => (m.id === sel ? { ...m, ...patch } : m)));

  const head = (
    <PanelHead
      title="Prompt Modes"
      hint="Each mode is a saved persona with its own system prompt and parameters."
      actions={
        <div className="flex gap-1.5">
          <PhButton size="sm" variant="ghost" icon={<I.upload size={12} />}>
            Import
          </PhButton>
          <PhButton size="sm" variant="ghost" icon={<I.download size={12} />}>
            Export
          </PhButton>
          <PhButton size="sm" variant="primary" icon={<I.plus size={12} sw={2.4} />}>
            New mode
          </PhButton>
        </div>
      }
    />
  );

  if (isLoading) return head;

  if (modes.length === 0) {
    return (
      <>
        {head}
        <EmptyState
          icon={<I.layers size={22} />}
          title="No prompt modes yet"
          description="Modes are saved personas — a system prompt plus model and parameters. Start from a preset or write one from scratch."
          action={
            <>
              <PhButton size="sm" variant="primary" icon={<I.plus size={12} sw={2.4} />}>
                Create your first mode
              </PhButton>
              <PhButton size="sm" variant="ghost" icon={<I.upload size={12} />}>
                Import
              </PhButton>
            </>
          }
        />
      </>
    );
  }

  if (!current) return head;

  const CurIcon = I[current.iconName as IconName];

  return (
    <>
      {head}

      <div className="grid gap-4" style={{ gridTemplateColumns: '220px 1fr', minHeight: 460 }}>
        {/* Mode list */}
        <div
          className="rounded-lg p-1.5 flex flex-col gap-px"
          style={{ background: 'var(--surface)', border: '.5px solid var(--border)' }}
        >
          {modes.map((m) => {
            const Icon = I[m.iconName as IconName];
            const active = sel === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSel(m.id)}
                className="flex items-center gap-[9px] px-2.5 py-[7px] border-0 rounded-md cursor-pointer text-left"
                style={{
                  background: active ? 'var(--accent-tint)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--fg)',
                }}
              >
                <span
                  className="flex"
                  style={{ color: active ? 'var(--accent)' : 'var(--fg-mute)' }}
                >
                  {Icon && <Icon size={14} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px]" style={{ fontWeight: active ? 500 : 400 }}>
                    {m.name}
                  </div>
                  <div className="text-[11px] text-fg-mute mt-px overflow-hidden text-ellipsis whitespace-nowrap">
                    {m.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Editor */}
        <div
          className="rounded-lg p-[18px] flex flex-col gap-4"
          style={{ background: 'var(--surface)', border: '.5px solid var(--border)' }}
        >
          <div className="flex items-start gap-2.5">
            <span
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{
                background: 'var(--accent-tint)',
                color: 'var(--accent)',
                border: '.5px solid var(--accent-tint-2)',
              }}
            >
              {CurIcon && <CurIcon size={14} />}
            </span>
            <div className="flex-1">
              <input
                value={current.name}
                onChange={(e) => setCurrent({ name: e.target.value })}
                className="w-full bg-transparent border-0 outline-none p-0 text-fg-strong"
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  letterSpacing: '-0.01em',
                }}
              />
              <input
                value={current.desc}
                onChange={(e) => setCurrent({ desc: e.target.value })}
                className="w-full bg-transparent border-0 outline-none p-0 text-fg-mute mt-0.5"
                style={{ fontSize: 12.5, fontFamily: 'inherit' }}
              />
            </div>
            <PhButton size="sm" variant="ghost" icon={<I.copy size={12} />}>
              Duplicate
            </PhButton>
            <button
              type="button"
              className="w-[26px] h-[26px] rounded-md flex items-center justify-center cursor-pointer p-0"
              style={{
                background: 'var(--surface-2)',
                border: '.5px solid var(--border-strong)',
                color: 'var(--fg-mute)',
              }}
            >
              <I.more size={14} />
            </button>
          </div>

          {/* System prompt */}
          <div>
            <div className="flex items-center mb-1.5">
              <span style={{ ...labelStyle, flex: 1 }}>System Prompt</span>
              <span className="ph-mono text-[11px] text-fg-mute">{current.sys.length} chars</span>
            </div>
            <textarea
              value={current.sys}
              onChange={(e) => setCurrent({ sys: e.target.value })}
              className="w-full p-2.5 px-3 outline-none text-fg resize-y"
              style={{
                minHeight: 110,
                background: 'var(--surface-2)',
                border: '.5px solid var(--border-strong)',
                borderRadius: 'var(--r-md)',
                fontFamily: 'var(--mono)',
                fontSize: 12,
                lineHeight: 1.55,
              }}
            />
          </div>

          {/* Parameters */}
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <div>
              <label style={labelStyle}>Temperature</label>
              <div className="mt-2">
                <Slider
                  value={current.temp}
                  onChange={(v) => setCurrent({ temp: v })}
                  min={0}
                  max={1}
                  step={0.05}
                  format={(v) => v.toFixed(2)}
                />
                <div className="ph-mono text-[11.5px] text-fg mt-1">
                  {current.temp.toFixed(2)} <span className="text-fg-mute">·</span>{' '}
                  {current.temp < 0.4 ? 'Focused' : current.temp < 0.7 ? 'Balanced' : 'Creative'}
                </div>
              </div>
            </div>
            <div>
              <label style={labelStyle}>Max tokens</label>
              <PhInput
                style={{ marginTop: 8 }}
                value={current.maxTok}
                onChange={(e) => setCurrent({ maxTok: Number(e.target.value) })}
                mono
              />
            </div>
            <div>
              <label style={labelStyle}>Provider override</label>
              <div
                className="mt-2 px-2.5 flex items-center gap-1.5 text-[13px]"
                style={{
                  height: 32,
                  background: 'var(--surface-2)',
                  border: '.5px solid var(--border-strong)',
                  borderRadius: 'var(--r-md)',
                }}
              >
                <span className="text-fg-mute">
                  <I.cloud size={13} />
                </span>
                <span className="flex-1">Inherit (GPT-4.1)</span>
                <I.chevD size={12} style={{ color: 'var(--fg-mute)' }} />
              </div>
            </div>
          </div>

          {/* Test area */}
          <div
            className="p-3 flex flex-col gap-2"
            style={{
              background: 'var(--surface-2)',
              border: '.5px dashed var(--border-strong)',
              borderRadius: 'var(--r-md)',
            }}
          >
            <div className="flex items-center gap-1.5">
              <I.bolt size={12} style={{ color: 'var(--accent)' }} />
              <span className="text-[11.5px] text-fg font-medium">Test prompt</span>
              <span className="flex-1" />
              <PhButton size="sm" variant="primary" icon={<I.bolt size={12} />}>
                Run
              </PhButton>
            </div>
            <textarea
              defaultValue="i need to push back on the proposed deadline because the design review hasnt happened yet and we dont have signoff"
              className="w-full px-2.5 py-2 outline-none text-fg resize-none"
              style={{
                minHeight: 50,
                background: 'var(--bg)',
                border: '.5px solid var(--border)',
                borderRadius: 6,
                fontFamily: 'inherit',
                fontSize: 12.5,
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
