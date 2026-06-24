import { describe, expect, it } from 'vitest';
import { applyStreamPlanProgress, extractPlanStepSummary } from './planMemory';
import type { AutonomousPlanSnapshot } from './autonomousRunApi';

const basePlan: AutonomousPlanSnapshot = {
  progress: '0/3',
  steps: [
    { id: 1, title: 'One', status: 'in_progress' },
    { id: 2, title: 'Two', status: 'pending' },
    { id: 3, title: 'Three', status: 'pending' },
  ],
};

describe('extractPlanStepSummary', () => {
  it('extracts inner block', () => {
    const text = `code\n\n<plan-step-summary>\nstep: 2 / 5\ndone: added service\nwhy: step 2\nnext: step 3\n</plan-step-summary>`;
    expect(extractPlanStepSummary(text)).toContain('step: 2 / 5');
  });

  it('returns null when tag missing', () => {
    expect(extractPlanStepSummary('no tag here')).toBeNull();
  });

  it('returns null for empty or unclosed tags', () => {
    expect(extractPlanStepSummary('<plan-step-summary>   </plan-step-summary>')).toBeNull();
    expect(extractPlanStepSummary('<plan-step-summary>step: 1')).toBeNull();
  });

  it('uses the first complete block after the first open tag', () => {
    const text = [
      '<plan-step-summary>step: 1\nnext: 2</plan-step-summary>',
      'noise',
      '<plan-step-summary>step: 2</plan-step-summary>',
    ].join('\n');

    expect(extractPlanStepSummary(text)).toBe('step: 1\nnext: 2');
  });

  it('does not pair a later close tag with text before the first open tag', () => {
    const text = 'prefix </plan-step-summary>\n<plan-step-summary>\nstep: 9\n</plan-step-summary>';

    expect(extractPlanStepSummary(text)).toBe('step: 9');
  });
});

describe('applyStreamPlanProgress', () => {
  it('advances plan strip when model reports step 3 in stream', () => {
    const text = `<plan-step-summary>
step: 3 / 3
done: css
</plan-step-summary>`;
    const out = applyStreamPlanProgress(basePlan, text);
    expect(out?.currentStepId).toBe(3);
    expect(out?.progress).toBe('2/3');
    expect(out?.steps.find((s) => s.id === 1)?.status).toBe('done');
    expect(out?.steps.find((s) => s.id === 3)?.status).toBe('in_progress');
  });

  it('ignores step numbers outside canonical plan', () => {
    const text = `<plan-step-summary>
step: 5 / 5
done: css
</plan-step-summary>`;
    const out = applyStreamPlanProgress(basePlan, text);
    expect(out).toEqual(basePlan);
  });

  it('ignores stream regressions below orchestrator step', () => {
    const plan = { ...basePlan, currentStepId: 2 };
    const text = `<plan-step-summary>
step: 1 / 3
done: old
</plan-step-summary>`;
    const out = applyStreamPlanProgress(plan, text, {
      minStepId: 2,
      ignoreRegressions: true,
    });
    expect(out).toEqual(plan);
  });
});
