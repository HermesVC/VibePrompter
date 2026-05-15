import { useState, type ReactNode } from 'react';
import {
  EmptyState,
  I,
  PanelHead,
  PhButton,
  PhInput,
  Pill,
  ProviderGlyphs,
  SelectCard,
  Toggle,
} from '@shared/ui';
import { useOllamaModelsQuery, useProvidersQuery } from '../../application/settings.query';
import type { ProviderInfo } from '../../domain';

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--fg-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontWeight: 600,
};

const iconBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  border: '.5px solid var(--border-strong)',
  background: 'var(--surface-2)',
  color: 'var(--fg-mute)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  cursor: 'pointer',
  padding: 0,
};

const glyphFor = (id: ProviderInfo['id']): ReactNode => {
  switch (id) {
    case 'openai': return ProviderGlyphs.openai(20);
    case 'anthropic': return ProviderGlyphs.anthropic(18);
    case 'gemini': return ProviderGlyphs.gemini(20);
    case 'ollama': return ProviderGlyphs.ollama(20);
  }
};

export function ProvidersPanel() {
  const { data: providers = [], isLoading } = useProvidersQuery();
  const [sel, setSel] = useState<ProviderInfo['id']>('openai');
  const current = providers.find((p) => p.id === sel) ?? providers[0];

  const head = (
    <PanelHead
      title="Providers"
      hint="Bring your own keys. PromptHelper routes per-mode."
      actions={
        <PhButton size="sm" variant="primary" icon={<I.plus size={12} sw={2.4} />}>
          Add provider
        </PhButton>
      }
    />
  );

  if (isLoading) return head;

  if (providers.length === 0) {
    return (
      <>
        {head}
        <EmptyState
          icon={<I.cloud size={22} />}
          title="No providers configured"
          description="Connect at least one provider (OpenAI, Anthropic, Gemini, or Ollama) to start running transformations. Your keys are stored encrypted on this device."
          action={
            <PhButton size="sm" variant="primary" icon={<I.plus size={12} sw={2.4} />}>
              Add provider
            </PhButton>
          }
        />
      </>
    );
  }

  if (!current) return head;

  return (
    <>
      {head}

      <div className="grid grid-cols-2 gap-2 mb-[18px]">
        {providers.map((p) => (
          <SelectCard
            key={p.id}
            icon={glyphFor(p.id)}
            accent={p.accent}
            title={p.name}
            hint={<span className="ph-mono text-[11px]">{p.model}</span>}
            selected={sel === p.id}
            onClick={() => setSel(p.id)}
            status={
              <span
                className="inline-flex items-center gap-1 text-[11px]"
                style={{ color: p.status === 'ok' ? 'var(--ok)' : 'var(--fg-dim)' }}
              >
                <span className={`dot ${p.status === 'ok' ? 'ok' : 'idle'}`} />
                {p.status === 'ok' ? 'Connected' : 'Not configured'}
              </span>
            }
          >
            <div className="flex items-center gap-1.5 text-[11px] text-fg-mute">
              <I.bolt size={11} />
              <span className="ph-mono">{p.usage.toLocaleString()}</span>
              <span>requests this month</span>
              {p.local && (
                <>
                  <span className="text-fg-dim">·</span>
                  <span className="text-ok">Local</span>
                </>
              )}
            </div>
          </SelectCard>
        ))}
      </div>

      <div
        className="rounded-lg p-[18px]"
        style={{ background: 'var(--surface)', border: '.5px solid var(--border)' }}
      >
        <div className="flex items-center gap-2.5 mb-3.5">
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: `${current.accent}22`,
              color: current.accent,
              border: '.5px solid var(--border)',
            }}
          >
            {glyphFor(current.id)}
          </span>
          <div className="flex-1">
            <div className="text-[14.5px] font-semibold text-fg-strong">{current.name}</div>
            <div className="text-[11.5px] text-fg-mute ph-mono">{current.model}</div>
          </div>
          <PhButton size="sm" variant="ghost" icon={<I.refresh size={12} />}>
            Test
          </PhButton>
        </div>

        {current.id === 'ollama' ? <OllamaConfig /> : <CloudConfig provider={current} />}
      </div>
    </>
  );
}

function CloudConfig({ provider }: { provider: ProviderInfo }) {
  const [show, setShow] = useState(false);
  const endpoint =
    provider.id === 'openai'
      ? 'https://api.openai.com/v1'
      : provider.id === 'anthropic'
      ? 'https://api.anthropic.com'
      : 'https://generativelanguage.googleapis.com';

  return (
    <div className="grid grid-cols-2 gap-3.5">
      <div className="col-span-2">
        <label style={labelStyle}>API Key</label>
        <PhInput
          style={{ marginTop: 8 }}
          mono
          type={show ? 'text' : 'password'}
          defaultValue="sk-proj-7Kx9_••••••••••••••••••••••••PqR4"
          suffix={
            <button type="button" onClick={() => setShow((v) => !v)} style={iconBtn}>
              {show ? <I.eyeOff size={13} /> : <I.eye size={13} />}
            </button>
          }
        />
      </div>
      <div>
        <label style={labelStyle}>Endpoint URL</label>
        <PhInput style={{ marginTop: 8 }} mono defaultValue={endpoint} />
      </div>
      <div>
        <label style={labelStyle}>Default model</label>
        <div
          className="mt-2 px-2.5 flex items-center gap-1.5 text-[13px]"
          style={{
            height: 32,
            background: 'var(--surface-2)',
            border: '.5px solid var(--border-strong)',
            borderRadius: 'var(--r-md)',
          }}
        >
          <span className="flex-1 ph-mono">{provider.model}</span>
          <I.chevD size={12} style={{ color: 'var(--fg-mute)' }} />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Timeout</label>
        <PhInput style={{ marginTop: 8 }} defaultValue="30 seconds" />
      </div>
      <div>
        <label style={labelStyle}>Max retries</label>
        <PhInput style={{ marginTop: 8 }} defaultValue="3" />
      </div>
      <div className="col-span-2 flex items-center gap-3 pt-1">
        <Toggle value={true} onChange={() => {}} size="sm" />
        <span className="text-[12.5px] text-fg">Stream responses</span>
        <span className="flex-1" />
        <Toggle value={true} onChange={() => {}} size="sm" />
        <span className="text-[12.5px] text-fg">Auto-fallback to next provider on error</span>
      </div>
    </div>
  );
}

function OllamaConfig() {
  const { data: models = [] } = useOllamaModelsQuery();
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3.5">
        <div>
          <label style={labelStyle}>Endpoint</label>
          <PhInput style={{ marginTop: 8 }} mono defaultValue="http://localhost:11434" />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label style={labelStyle}>CPU</label>
            <div
              className="mt-2 p-2 px-2.5 text-xs"
              style={{
                background: 'var(--surface-2)',
                border: '.5px solid var(--border)',
                borderRadius: 'var(--r-md)',
              }}
            >
              <div className="ph-mono">12 cores · 14% used</div>
              <Bar pct={14} />
            </div>
          </div>
          <div className="flex-1">
            <label style={labelStyle}>GPU</label>
            <div
              className="mt-2 p-2 px-2.5 text-xs"
              style={{
                background: 'var(--surface-2)',
                border: '.5px solid var(--border)',
                borderRadius: 'var(--r-md)',
              }}
            >
              <div className="ph-mono text-ok">RTX 4070 · ready</div>
              <Bar pct={6} tone="ok" />
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center mb-2">
          <span style={labelStyle}>Installed models</span>
          <span className="flex-1" />
          <PhButton size="sm" variant="ghost" icon={<I.refresh size={12} />}>
            Refresh
          </PhButton>
          <PhButton size="sm" icon={<I.download size={12} />}>
            Pull model
          </PhButton>
        </div>
        <div
          className="overflow-hidden rounded-md"
          style={{ border: '.5px solid var(--border)' }}
        >
          {models.map((m, i) => (
            <div
              key={m.name}
              className="flex items-center gap-2.5 px-3 py-2 text-[12.5px]"
              style={{
                background: m.active ? 'var(--accent-tint)' : i % 2 ? 'var(--surface-2)' : 'transparent',
                borderTop: i ? '.5px solid var(--divider)' : 'none',
              }}
            >
              <I.cpu size={13} style={{ color: m.active ? 'var(--accent)' : 'var(--fg-mute)' }} />
              <span
                className="ph-mono flex-1"
                style={{ color: m.active ? 'var(--accent)' : 'var(--fg)', fontWeight: m.active ? 500 : 400 }}
              >
                {m.name}
              </span>
              <span className="text-fg-mute text-[11.5px]">{m.size}</span>
              <span
                className="text-fg-dim text-[11.5px] text-right"
                style={{ width: 64 }}
              >
                {m.pulled}
              </span>
              {m.active ? <Pill tone="accent">Active</Pill> : <PhButton size="sm" variant="ghost">Use</PhButton>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Bar({ pct, tone }: { pct: number; tone?: 'ok' }) {
  return (
    <div className="h-1 rounded-[2px] mt-1.5" style={{ background: 'var(--surface-3)' }}>
      <div
        className="h-full rounded-[2px]"
        style={{ width: `${pct}%`, background: tone === 'ok' ? 'var(--ok)' : 'var(--accent)' }}
      />
    </div>
  );
}
