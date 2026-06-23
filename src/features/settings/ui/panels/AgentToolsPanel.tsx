import { useCallback, useEffect, useState } from 'react';
import { Group, I, PhButton, PhInput, SettingRow, useToast } from '@shared/ui';
import {
  executeAgentTool,
  executeToolCallsFromText,
  listAgentTools,
  type ToolExecutionResult,
} from '@shared/lib/agentToolsApi';
import type { ToolDefinition } from '@shared/lib/promptFormatApi';
import { errorMessage } from '@shared/lib/utils';

const SAMPLE_GEMMA_TOOL_CALL =
  '<|tool_call>call:launch_chrome{url:<|"|>https://www.google.com<|"|>}<|tool_call|>';

export function AgentToolsPanel() {
  const toast = useToast();
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [url, setUrl] = useState('https://www.google.com');
  const [modelOutput, setModelOutput] = useState(SAMPLE_GEMMA_TOOL_CALL);
  const [lastResults, setLastResults] = useState<ToolExecutionResult[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listAgentTools().then(setTools).catch(() => setTools([]));
  }, []);

  const runChrome = useCallback(async () => {
    setBusy(true);
    try {
      const r = await executeAgentTool('launch_chrome', { url, new_window: true });
      setLastResults([r]);
      toast.ok(r.message, r.ok ? 'Tool OK' : 'Tool failed');
    } catch (e) {
      toast.err(errorMessage(e), 'launch_chrome failed');
    } finally {
      setBusy(false);
    }
  }, [toast, url]);

  const parseAndRun = useCallback(async () => {
    setBusy(true);
    try {
      const r = await executeToolCallsFromText('gemma4', modelOutput);
      setLastResults(r.results);
      if (r.toolCalls.length === 0) {
        toast.err('No tool calls found in text', 'Parse');
        return;
      }
      const ok = r.results.every((x) => x.ok);
      toast.ok(
        r.results.map((x) => `${x.name}: ${x.message}`).join('\n'),
        ok ? 'Tools executed' : 'Some tools failed'
      );
    } catch (e) {
      toast.err(errorMessage(e), 'Execute failed');
    } finally {
      setBusy(false);
    }
  }, [modelOutput, toast]);

  return (
    <Group title="Agent tools (function calling test)">
      <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: '0 0 8px', lineHeight: 1.45 }}>
        Local tools (MCP-style). Wire format: Gemma 4{' '}
        <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>&lt;|tool_call|&gt;</span> on the
        connection prompt format. The model must support tool calling in LM Studio.
      </p>

      {tools.length > 0 && (
        <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 11, color: 'var(--fg-mute)' }}>
          {tools.map((t) => (
            <li key={t.name}>
              <strong style={{ color: 'var(--fg)' }}>{t.name}</strong> — {t.description}
            </li>
          ))}
        </ul>
      )}

      <SettingRow
        icon={<I.link size={14} />}
        label="launch_chrome"
        hint="Manual test — opens Chrome with the URL below."
        control={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 260 }}>
            <PhInput mono value={url} onChange={setUrl} placeholder="https://..." />
            <PhButton size="sm" disabled={busy} onClick={() => void runChrome()}>
              Run tool
            </PhButton>
          </div>
        }
      />

      <SettingRow
        icon={<I.code size={14} />}
        label="Parse model output"
        hint="Paste assistant text with tool_call blocks (format: gemma4)."
        control={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 280 }}>
            <textarea
              value={modelOutput}
              onChange={(e) => setModelOutput(e.target.value)}
              rows={4}
              style={{
                width: '100%',
                fontSize: 10,
                fontFamily: 'var(--font-mono, monospace)',
                padding: 8,
                borderRadius: 6,
                border: '.5px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--fg)',
                resize: 'vertical',
              }}
            />
            <PhButton size="sm" disabled={busy} onClick={() => void parseAndRun()}>
              Parse &amp; execute
            </PhButton>
          </div>
        }
      />

      {lastResults.length > 0 && (
        <pre
          style={{
            margin: '4px 0 0',
            padding: 8,
            fontSize: 10,
            borderRadius: 6,
            background: 'var(--surface-2)',
            border: '.5px solid var(--border)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'var(--fg-mute)',
          }}
        >
          {lastResults.map((r) => `${r.ok ? '✓' : '✗'} ${r.name}: ${r.message}`).join('\n')}
        </pre>
      )}
    </Group>
  );
}
