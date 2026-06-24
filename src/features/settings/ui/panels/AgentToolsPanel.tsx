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
  '<|tool_call>call:list_dir{path:<|"|>.<|"|>}<|tool_call|>';

export function AgentToolsPanel() {
  const toast = useToast();
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [url, setUrl] = useState('https://www.google.com');
  const [listPath, setListPath] = useState('.');
  const [readPath, setReadPath] = useState('');
  const [readStart, setReadStart] = useState('');
  const [readEnd, setReadEnd] = useState('');
  const [scopePath, setScopePath] = useState('');
  const [modelOutput, setModelOutput] = useState(SAMPLE_GEMMA_TOOL_CALL);
  const [lastResults, setLastResults] = useState<ToolExecutionResult[]>([]);
  const [busy, setBusy] = useState(false);

  const scope = scopePath.trim() || undefined;

  useEffect(() => {
    listAgentTools().then(setTools).catch(() => setTools([]));
  }, []);

  const runChrome = useCallback(async () => {
    setBusy(true);
    try {
      const r = await executeAgentTool('launch_chrome', { url, new_window: true }, scope);
      setLastResults([r]);
      toast.ok(r.message, r.ok ? 'Tool OK' : 'Tool failed');
    } catch (e) {
      toast.err(errorMessage(e), 'launch_chrome failed');
    } finally {
      setBusy(false);
    }
  }, [toast, url, scope]);

  const runListDir = useCallback(async () => {
    setBusy(true);
    try {
      const r = await executeAgentTool('list_dir', { path: listPath, depth: 2 }, scope);
      setLastResults([r]);
      toast.ok(r.message, r.ok ? 'list_dir OK' : 'list_dir failed');
    } catch (e) {
      toast.err(errorMessage(e), 'list_dir failed');
    } finally {
      setBusy(false);
    }
  }, [toast, listPath, scope]);

  const runReadFile = useCallback(async () => {
    if (!readPath.trim()) {
      toast.err('Enter a file path', 'read_file');
      return;
    }
    setBusy(true);
    try {
      const args: Record<string, unknown> = { path: readPath.trim() };
      const start = parseInt(readStart, 10);
      const end = parseInt(readEnd, 10);
      if (!Number.isNaN(start)) args.start_line = start;
      if (!Number.isNaN(end)) args.end_line = end;
      const r = await executeAgentTool('read_file', args, scope);
      setLastResults([r]);
      toast.ok(r.message, r.ok ? 'read_file OK' : 'read_file failed');
    } catch (e) {
      toast.err(errorMessage(e), 'read_file failed');
    } finally {
      setBusy(false);
    }
  }, [toast, readPath, readStart, readEnd, scope]);

  const parseAndRun = useCallback(async () => {
    setBusy(true);
    try {
      const r = await executeToolCallsFromText('gemma4', modelOutput, scope);
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
  }, [modelOutput, toast, scope]);

  return (
    <Group title="Agent tools (function calling test)">
      <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: '0 0 8px', lineHeight: 1.45 }}>
        Local tools (MCP-style). Wire format: Gemma 4{' '}
        <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>&lt;|tool_call|&gt;</span> on the
        connection prompt format. Workspace tools require a configured workspace root.
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
        icon={<I.layers size={14} />}
        label="Folder scope (optional)"
        hint="Restrict list_dir / read_file to a workspace-relative folder prefix."
        control={
          <PhInput
            mono
            value={scopePath}
            onChange={setScopePath}
            placeholder="e.g. src/features"
          />
        }
      />

      <SettingRow
        icon={<I.layers size={14} />}
        label="list_dir"
        hint="List files under a workspace path."
        control={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 260 }}>
            <PhInput mono value={listPath} onChange={setListPath} placeholder="." />
            <PhButton size="sm" disabled={busy} onClick={() => void runListDir()}>
              Run list_dir
            </PhButton>
          </div>
        }
      />

      <SettingRow
        icon={<I.text size={14} />}
        label="read_file"
        hint="Read a workspace file (optional line range)."
        control={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 260 }}>
            <PhInput mono value={readPath} onChange={setReadPath} placeholder="path/to/file.ts" />
            <div style={{ display: 'flex', gap: 6 }}>
              <PhInput mono value={readStart} onChange={setReadStart} placeholder="start line" />
              <PhInput mono value={readEnd} onChange={setReadEnd} placeholder="end line" />
            </div>
            <PhButton size="sm" disabled={busy} onClick={() => void runReadFile()}>
              Run read_file
            </PhButton>
          </div>
        }
      />

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
