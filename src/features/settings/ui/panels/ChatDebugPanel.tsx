import { useCallback, useMemo, useState } from 'react';
import { Group, I, PhButton, SettingRow, useToast } from '@shared/ui';
import {
  runChatDebugScenario,
  type ChatDebugScenarioOutput,
} from '@shared/lib/chatDebugApi';
import {
  interpretMemoryProbeResult,
  memoryRecallPressureScenario,
  memoryRecallOnlyScenario,
  memorySeedFactScenario,
} from '@shared/lib/chatDebugMemoryScenarios';
import {
  interpretToolProbeTrace,
  toolCallFolderReadScenario,
} from '@shared/lib/chatDebugToolScenarios';
import { errorMessage } from '@shared/lib/utils';

const SAMPLE_SCENARIO = JSON.stringify(
  {
    modeId: 'chat-developer',
    sessionId: 'debug-agent-session',
    chatContext: {
      scope: {
        kind: 'workspace',
        treeSummary: 'src-tauri/src/commands/chat.rs\nsrc-tauri/src/chat/run_service.rs',
      },
      modifiers: ['developer'],
      languageId: null,
    },
    messages: [
      {
        role: 'user',
        content: 'Разберись, какие файлы нужно читать перед фиксом. Пока не меняй код.',
        images: [],
      },
    ],
  },
  null,
  2
);

type CompletionLike = {
  text?: string;
  memoryCompressed?: boolean;
  evictedTurns?: number;
  vectorChunksUsed?: number;
  vectorMemoryCompressed?: boolean;
  sessionSummary?: string;
  retrievedMemory?: string;
};

export function ChatDebugPanel() {
  const toast = useToast();
  const [scenario, setScenario] = useState(SAMPLE_SCENARIO);
  const [output, setOutput] = useState<ChatDebugScenarioOutput | null>(null);
  const [busy, setBusy] = useState(false);
  const [seedSummary, setSeedSummary] = useState('');

  const memoryVerdict = useMemo(() => {
    const result = output?.result as CompletionLike | null | undefined;
    if (!result?.text) return null;
    return interpretMemoryProbeResult(result);
  }, [output]);

  const toolVerdict = useMemo(() => {
    if (!output?.trace?.length) return null;
    return interpretToolProbeTrace(
      output.trace as Array<Record<string, unknown>>,
      output.result as CompletionLike | null | undefined
    );
  }, [output]);

  const runScenario = useCallback(async () => {
    setBusy(true);
    try {
      const parsed = JSON.parse(scenario);
      const result = await runChatDebugScenario(parsed);
      setOutput(result);
      const completion = result.result as CompletionLike | null | undefined;
      if (completion?.sessionSummary?.trim()) {
        setSeedSummary(completion.sessionSummary.trim());
      }
      if (result.error) {
        toast.err(result.error, 'Agent scenario failed');
      } else {
        toast.ok(`${result.trace.length} trace event(s)`, 'Agent scenario complete');
      }
    } catch (e) {
      toast.err(errorMessage(e), 'Invalid scenario');
    } finally {
      setBusy(false);
    }
  }, [scenario, toast]);

  const loadPreset = useCallback((preset: unknown) => {
    setScenario(JSON.stringify(preset, null, 2));
  }, []);

  return (
    <>
      <Group title="Memory probe (debug panel)">
        <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: '0 0 8px', lineHeight: 1.45 }}>
          Тест памяти через тот же pipeline, что и чат. Ожидаемый секрет:{' '}
          <strong>VIBE-7749</strong>. После прогона смотри{' '}
          <code>result.sessionSummary</code>, <code>result.retrievedMemory</code>, trace{' '}
          <code>memory</code>/<code>done</code>.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          <PhButton
            size="sm"
            disabled={busy}
            onClick={() => loadPreset(memoryRecallPressureScenario())}
          >
            Pressure + recall
          </PhButton>
          <PhButton size="sm" disabled={busy} onClick={() => loadPreset(memorySeedFactScenario())}>
            1. Seed fact
          </PhButton>
          <PhButton
            size="sm"
            disabled={busy || !seedSummary}
            onClick={() => loadPreset(memoryRecallOnlyScenario(seedSummary))}
          >
            2. Recall only
          </PhButton>
        </div>
        {memoryVerdict && (
          <ul
            style={{
              margin: '0 0 8px',
              paddingLeft: 18,
              fontSize: 11,
              color: 'var(--fg-dim)',
              lineHeight: 1.45,
            }}
          >
            {memoryVerdict.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </Group>

      <Group title="Tool call probe">
        <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: '0 0 8px', lineHeight: 1.45 }}>
          Проверка read_file через tool loop. Нужны workspace root и папка{' '}
          <code>test/single-page-games/</code>. CLI:{' '}
          <code>cargo run --bin tool_call_probe</code>.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          <PhButton
            size="sm"
            disabled={busy}
            onClick={() => loadPreset(toolCallFolderReadScenario())}
          >
            Folder + read_file
          </PhButton>
        </div>
        {toolVerdict && (
          <ul
            style={{
              margin: '0 0 8px',
              paddingLeft: 18,
              fontSize: 11,
              color: 'var(--fg-dim)',
              lineHeight: 1.45,
            }}
          >
            {toolVerdict.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </Group>

      <Group title="Agent scenario runner">
        <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: '0 0 8px', lineHeight: 1.45 }}>
          Runs the same chat service as the floating UI and returns a compact trace for prompt,
          memory, tool, and continuation debugging.
        </p>

        <SettingRow
          icon={<I.code size={14} />}
          label="Scenario JSON"
          hint="Uses chat_debug_run_scenario. CLI: cargo run --bin memory_probe (headless, longer pressure)."
          control={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 420 }}>
              <textarea
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                rows={12}
                spellCheck={false}
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
              <PhButton size="sm" disabled={busy} onClick={() => void runScenario()}>
                Run scenario
              </PhButton>
            </div>
          }
        />

        {output && (
          <pre
            style={{
              margin: '4px 0 0',
              padding: 8,
              maxHeight: 320,
              overflow: 'auto',
              fontSize: 10,
              borderRadius: 6,
              background: 'var(--surface-2)',
              border: '.5px solid var(--border)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: 'var(--fg-mute)',
            }}
          >
            {JSON.stringify(output, null, 2)}
          </pre>
        )}
      </Group>
    </>
  );
}
