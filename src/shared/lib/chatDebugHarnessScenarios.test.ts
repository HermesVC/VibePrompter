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
    expect(lines.some((l) => l.startsWith('✗'))).toBe(true);
  });
});
