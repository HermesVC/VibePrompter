import { describe, expect, it } from 'vitest';
import { extractVpSummary, trimSummaryToBudget } from './chatSessionSummary';

describe('chatSessionSummary', () => {
  it('extracts vp-summary block', () => {
    const { body, summary } = extractVpSummary(
      'Hi!\n\n<vp-summary>User likes brevity.</vp-summary>'
    );
    expect(body).toBe('Hi!');
    expect(summary).toBe('User likes brevity.');
  });

  it('caps summary at 30% of context', () => {
    const long = 'w'.repeat(10_000);
    const out = trimSummaryToBudget(long, 8192);
    expect(out.length).toBeLessThan(10_000);
    expect(out.startsWith('…')).toBe(true);
  });
});
