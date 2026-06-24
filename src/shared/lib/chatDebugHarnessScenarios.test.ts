import { describe, expect, it } from 'vitest';
import {
  HARNESS_AUDIT_SESSION,
  harnessAuditScenario,
  harnessMemoryRecallScenario,
  interpretHarnessAuditTrace,
  interpretHarnessMemoryRecall,
  interpretReactScaffoldStep,
  reactScaffoldStep1Scenario,
  REACT_SCAFFOLD_DIR,
  SYNTHETIC_BUGGY_API,
} from './chatDebugHarnessScenarios';
import {
  interpretMemoryProbeResult,
  MEMORY_PROBE_SESSION,
  MEMORY_SENTINEL,
  memoryNoMemoryNegativeScenario,
  memoryRollingOnlyRecallScenario,
  memorySentinelSeedScenario,
  memoryVectorOnlyRecallScenario,
} from './chatDebugMemoryScenarios';

describe('chatDebugHarnessScenarios', () => {
  it('audit scenario uses synthetic fixture file scope', () => {
    const s = harnessAuditScenario();
    expect(s.sessionId).toBe(HARNESS_AUDIT_SESSION);
    expect(s.chatContext?.scope).toMatchObject({
      kind: 'file',
      path: SYNTHETIC_BUGGY_API,
    });
    expect(s.messages[0]?.content).toContain('SyntheticProjectsAPI');
    expect(s.messages[0]?.content).toContain('apply_patch');
  });

  it('memory recall reuses audit session', () => {
    const s = harnessMemoryRecallScenario('summary');
    expect(s.sessionId).toBe(HARNESS_AUDIT_SESSION);
    expect(s.sessionSummary).toBe('summary');
    expect(s.messages[0]?.content).toContain('Без read_file');
  });

  it('react step1 targets harness-react dir', () => {
    const s = reactScaffoldStep1Scenario();
    expect(s.messages[0]?.content).toContain(REACT_SCAFFOLD_DIR);
    expect(s.messages[0]?.content).toContain('PLAN.md');
  });

  it('interpretHarnessAuditTrace detects tools phase', () => {
    const lines = interpretHarnessAuditTrace(
      [{ type: 'status', status: { phase: 'tools' } }],
      { text: 'Исправил foreach в SyntheticProjectsAPI.' }
    );
    expect(lines.some((l) => l.includes('tools phase'))).toBe(true);
    expect(lines.some((l) => l.startsWith('✓'))).toBe(true);
  });

  it('interpretHarnessMemoryRecall flags missing recall', () => {
    const lines = interpretHarnessMemoryRecall({ text: 'не знаю' });
    expect(lines[0]).toContain('✗');
  });

  it('interpretReactScaffoldStep reports missing files', () => {
    const lines = interpretReactScaffoldStep(1, [], { text: 'ok' }, []);
    expect(lines.some((l) => l.includes('PLAN.md'))).toBe(true);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.startsWith('✗'))).toBe(true);
  });

  it('memory sentinel seed forces context pressure and keeps session stable', () => {
    const s = memorySentinelSeedScenario();
    expect(s.sessionId).toBe(MEMORY_PROBE_SESSION);
    expect(s.forceContextLimit).toBe(4096);
    expect(JSON.stringify(s.messages)).toContain(MEMORY_SENTINEL);
    expect(s.messages.length).toBeGreaterThan(40);
  });

  it('memory vector-only recall disables rolling memory but keeps retrieval available', () => {
    const s = memoryVectorOnlyRecallScenario();
    expect(s.sessionId).toBe(MEMORY_PROBE_SESSION);
    expect(s.disableRollingMemory).toBe(true);
    expect(s.disableVectorRetrieval).not.toBe(true);
    expect(s.sessionSummary).toBe('');
  });

  it('memory rolling-only recall disables vector retrieval', () => {
    const s = memoryRollingOnlyRecallScenario('summary with sentinel');
    expect(s.sessionSummary).toBe('summary with sentinel');
    expect(s.disableVectorRetrieval).toBe(true);
    expect(s.disableRollingMemory).not.toBe(true);
  });

  it('memory negative scenario disables both memory sources', () => {
    const s = memoryNoMemoryNegativeScenario();
    expect(s.disableRollingMemory).toBe(true);
    expect(s.disableVectorRetrieval).toBe(true);
    expect(s.sessionId).toContain('negative');
  });

  it('interpretMemoryProbeResult includes diagnostics line', () => {
    const lines = interpretMemoryProbeResult({
      text: 'VIBE-7749',
      memoryDiagnostics: {
        vectorAvailable: true,
        vectorChunksRetrieved: 2,
        vectorChunksIndexed: 5,
        rollingSummaryChars: 120,
        degradeLabel: 'normal window',
        inputEstimateFirst: 1000,
        inputEstimateFinal: 900,
      },
    });
    expect(lines.some((l) => l.includes('diag: vector=available'))).toBe(true);
    expect(lines.some((l) => l.includes('input=1000->900'))).toBe(true);
  });
});
