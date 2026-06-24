import { describe, expect, it } from 'vitest';
import { extractPlanStepSummary } from './planMemory';

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
