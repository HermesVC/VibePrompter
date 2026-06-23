import { describe, expect, it } from 'vitest';
import { trimMessagesToTokenBudget } from './contextUsage';

describe('trimMessagesToTokenBudget', () => {
  it('keeps all messages when under budget', () => {
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ];
    const { messages: out, droppedCount } = trimMessagesToTokenBudget(messages, 8192);
    expect(out).toHaveLength(2);
    expect(droppedCount).toBe(0);
  });

  it('drops oldest user/assistant pairs first', () => {
    const long = 'x'.repeat(4000);
    const messages = [
      { role: 'user', content: long },
      { role: 'assistant', content: long },
      { role: 'user', content: 'recent' },
      { role: 'assistant', content: 'reply' },
    ];
    const { messages: out, droppedCount } = trimMessagesToTokenBudget(messages, 4096, 512);
    expect(droppedCount).toBeGreaterThan(0);
    expect(out[out.length - 1].content).toBe('reply');
  });
});
