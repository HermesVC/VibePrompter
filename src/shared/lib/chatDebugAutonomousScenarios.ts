/** Autonomous run scenario for Settings → Advanced debug panel. */

import {
  HARNESS_FIXTURES_DIR,
  SYNTHETIC_BUGGY_API,
} from './chatDebugHarnessScenarios';

export const AUTONOMOUS_DEBUG_SESSION = 'autonomous-debug-probe';

export function autonomousSyntheticFixtureScenario() {
  return {
    goal: `Исправь баг в синтетическом harness-файле ${SYNTHETIC_BUGGY_API}: в getDolgomerInfo foreach использует $projectUids вместо $projectUuids. Не трогай vp/.`,
    messages: [] as Array<{ role: string; content: string; images: unknown[] }>,
    modeId: 'chat-developer',
    connectionId: null as string | null,
    sessionId: AUTONOMOUS_DEBUG_SESSION,
    chatContext: {
      scope: {
        kind: 'file',
        path: SYNTHETIC_BUGGY_API,
        content: '',
        contentHash: '',
        lineStart: 1,
        lineEnd: 1,
        languageId: 'php',
      },
      modifiers: ['developer'],
      languageId: 'php',
    },
    config: {
      maxSteps: 8,
      maxReplans: 1,
      planningEnabled: true,
      verifySteps: true,
    },
  };
}

export function interpretAutonomousDebug(
  output: {
    trace: Array<Record<string, unknown>>;
    result: { phase?: string; steps?: unknown[]; finalText?: string } | null;
    error?: string | null;
  } | null
): string[] {
  if (!output) return ['○ Autonomous debug не запускался'];
  const lines: string[] = [];
  const phases = output.trace.filter((e) => e.type === 'phase');
  lines.push(phases.length > 0 ? `✓ ${phases.length} phase event(s)` : '✗ Нет phase events');

  const plans = output.trace.filter((e) => e.type === 'plan');
  lines.push(plans.length > 0 ? '✓ Plan snapshot получен' : '○ Plan snapshot не было');

  if (output.error) {
    lines.push(`✗ ${output.error}`);
  } else if (output.result?.phase === 'done') {
    lines.push('✓ Autonomous run завершён (done)');
  } else {
    lines.push(`○ phase: ${output.result?.phase ?? 'unknown'}`);
  }

  const text = output.result?.finalText ?? '';
  if (/projectUuid|исправ/i.test(text)) {
    lines.push('✓ Финальный отчёт похож на осмысленный');
  }

  lines.push(`○ fixture dir: ${HARNESS_FIXTURES_DIR}`);
  return lines;
}
