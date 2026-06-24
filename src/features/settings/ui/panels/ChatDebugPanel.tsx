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
  harnessAuditScenario,
  harnessMemoryRecallScenario,
  interpretDeterministicHarness,
  interpretHarnessAuditTrace,
  interpretHarnessMemoryRecall,
  interpretReactScaffoldStep,
  reactScaffoldStep1Scenario,
  reactScaffoldStep2Scenario,
  reactScaffoldStep3Scenario,
  REACT_SCAFFOLD_DIR,
} from '@shared/lib/chatDebugHarnessScenarios';
import {
  runHarnessDeterministic,
  harnessCheckWorkspaceFiles,
  harnessApplyGeneratedFences,
  harnessResetSyntheticFixture,
} from '@shared/lib/chatDebugApi';
import { autonomousDebugRun } from '@shared/lib/autonomousRunApi';
import {
  autonomousSyntheticFixtureScenario,
  interpretAutonomousDebug,
} from '@shared/lib/chatDebugAutonomousScenarios';
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
  const [deterministicReport, setDeterministicReport] = useState<Awaited<
    ReturnType<typeof runHarnessDeterministic>
  > | null>(null);
  const [reactStep, setReactStep] = useState<1 | 2 | 3 | null>(null);
  const [reactFilesPresent, setReactFilesPresent] = useState<string[]>([]);
  const [autonomousOutput, setAutonomousOutput] = useState<Awaited<
    ReturnType<typeof autonomousDebugRun>
  > | null>(null);

  const autonomousVerdict = useMemo(
    () => interpretAutonomousDebug(autonomousOutput),
    [autonomousOutput]
  );

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

  const harnessVerdict = useMemo(() => {
    if (!output?.trace?.length) return null;
    const trace = output.trace as Array<Record<string, unknown>>;
    const result = output.result as CompletionLike | null | undefined;
    if (reactStep) {
      return interpretReactScaffoldStep(reactStep, trace, result, reactFilesPresent);
    }
    const scenarioText = scenario.includes(HARNESS_AUDIT_SESSION) && scenario.includes('Без read_file')
      ? interpretHarnessMemoryRecall(result)
      : interpretHarnessAuditTrace(trace, result);
    return scenarioText;
  }, [output, scenario, reactStep, reactFilesPresent]);

  const deterministicVerdict = useMemo(
    () => interpretDeterministicHarness(deterministicReport),
    [deterministicReport]
  );

  const runDeterministic = useCallback(async () => {
    setBusy(true);
    try {
      const report = await runHarnessDeterministic();
      setDeterministicReport(report);
      if (report.allPass) {
        toast.ok('All checks passed', 'Harness deterministic');
      } else {
        toast.err('Some checks failed — see list', 'Harness deterministic');
      }
    } catch (e) {
      toast.err(errorMessage(e), 'Harness deterministic failed');
    } finally {
      setBusy(false);
    }
  }, [toast]);

  const checkReactFiles = useCallback(async (step: 1 | 2 | 3) => {
    const expected: Record<number, string[]> = {
      1: [`${REACT_SCAFFOLD_DIR}/PLAN.md`],
      2: [
        `${REACT_SCAFFOLD_DIR}/package.json`,
        `${REACT_SCAFFOLD_DIR}/vite.config.ts`,
        `${REACT_SCAFFOLD_DIR}/index.html`,
        `${REACT_SCAFFOLD_DIR}/tsconfig.json`,
      ],
      3: [
        `${REACT_SCAFFOLD_DIR}/src/main.tsx`,
        `${REACT_SCAFFOLD_DIR}/src/App.tsx`,
        `${REACT_SCAFFOLD_DIR}/src/index.css`,
      ],
    };
    try {
      const { present } = await harnessCheckWorkspaceFiles(expected[step]);
      setReactFilesPresent(present);
    } catch {
      setReactFilesPresent([]);
    }
  }, []);

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
      if (reactStep && completion?.text) {
        await harnessApplyGeneratedFences(completion.text);
        await checkReactFiles(reactStep);
      } else if (reactStep) {
        await checkReactFiles(reactStep);
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
  }, [scenario, toast, reactStep, checkReactFiles]);

  const loadPreset = useCallback(
    (preset: unknown, opts?: { react?: 1 | 2 | 3 }) => {
      setScenario(JSON.stringify(preset, null, 2));
      setReactStep(opts?.react ?? null);
      if (opts?.react) {
        void checkReactFiles(opts.react);
      }
    },
    [checkReactFiles]
  );

  const loadAuditPreset = useCallback(async () => {
    setBusy(true);
    try {
      await harnessResetSyntheticFixture();
      loadPreset(harnessAuditScenario());
      toast.ok('Synthetic fixture reset', 'Harness');
    } catch (e) {
      toast.err(errorMessage(e), 'Fixture reset failed');
    } finally {
      setBusy(false);
    }
  }, [loadPreset, toast]);

  const runAutonomousSynthetic = useCallback(async () => {
    setBusy(true);
    try {
      await harnessResetSyntheticFixture();
      const preset = autonomousSyntheticFixtureScenario();
      const result = await autonomousDebugRun(preset);
      setAutonomousOutput(result);
      if (result.error) {
        toast.err(result.error, 'Autonomous debug');
      } else if (result.result?.phase === 'done') {
        toast.ok('Autonomous run done', 'Debug');
      } else {
        toast.ok(`Phase: ${result.result?.phase ?? '?'}`, 'Autonomous debug');
      }
    } catch (e) {
      toast.err(errorMessage(e), 'Autonomous debug failed');
    } finally {
      setBusy(false);
    }
  }, [toast]);

  return (
    <>
      <Group title="Autonomous run (multi-step)">
        <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: '0 0 8px', lineHeight: 1.45 }}>
          Outer loop: plan → execute → verify → replan. Тест на синтетической фикстуре (LM Studio
          required). В чате: checkbox «Autonomous».
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          <PhButton size="sm" disabled={busy} onClick={() => void runAutonomousSynthetic()}>
            Run synthetic autonomous
          </PhButton>
        </div>
        {autonomousVerdict.length > 0 && (
          <ul
            style={{
              margin: '0 0 8px',
              paddingLeft: 18,
              fontSize: 11,
              color: 'var(--fg-dim)',
              lineHeight: 1.45,
            }}
          >
            {autonomousVerdict.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </Group>

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

      <Group title="Harness probe (full stack)">
        <p style={{ fontSize: 11, color: 'var(--fg-dim)', margin: '0 0 8px', lineHeight: 1.45 }}>
          Deterministic: parser, prompts, patch limits, apply_patch smoke on{' '}
          <code>test/harness-fixtures/</code>. CLI:{' '}
          <code>cargo run --bin harness_probe</code>. Live:{' '}
          <code>HARNESS_LIVE=1</code> / <code>HARNESS_REACT=1</code>.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          <PhButton size="sm" disabled={busy} onClick={() => void runDeterministic()}>
            Run deterministic
          </PhButton>
          <PhButton size="sm" disabled={busy} onClick={() => void loadAuditPreset()}>
            Audit (synthetic PHP)
          </PhButton>
          <PhButton
            size="sm"
            disabled={busy}
            onClick={() => loadPreset(harnessMemoryRecallScenario(seedSummary))}
          >
            Memory recall
          </PhButton>
          <PhButton
            size="sm"
            disabled={busy}
            onClick={() => loadPreset(reactScaffoldStep1Scenario(), { react: 1 })}
          >
            React 1 PLAN
          </PhButton>
          <PhButton
            size="sm"
            disabled={busy}
            onClick={() => loadPreset(reactScaffoldStep2Scenario(), { react: 2 })}
          >
            React 2 configs
          </PhButton>
          <PhButton
            size="sm"
            disabled={busy}
            onClick={() => loadPreset(reactScaffoldStep3Scenario(), { react: 3 })}
          >
            React 3 src
          </PhButton>
        </div>
        {deterministicVerdict.length > 0 && (
          <ul
            style={{
              margin: '0 0 8px',
              paddingLeft: 18,
              fontSize: 11,
              color: 'var(--fg-dim)',
              lineHeight: 1.45,
            }}
          >
            {deterministicVerdict.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {harnessVerdict && (
          <ul
            style={{
              margin: '0 0 8px',
              paddingLeft: 18,
              fontSize: 11,
              color: 'var(--fg-dim)',
              lineHeight: 1.45,
            }}
          >
            {harnessVerdict.map((line) => (
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
