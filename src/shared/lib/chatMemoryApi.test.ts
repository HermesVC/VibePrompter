import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { indexPlanCanonical } from './chatMemoryApi';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

const invokeMock = vi.mocked(invoke);

describe('indexPlanCanonical', () => {
  beforeEach(() => {
    invokeMock.mockClear();
  });

  it('sends the applied PLAN.md payload to the backend command', async () => {
    await indexPlanCanonical('session-1', 'docs/PLAN.md', 'Current step: 2 / 5', {
      connectionId: 'conn-1',
      modeId: 'chat-developer',
    });

    expect(invokeMock).toHaveBeenCalledWith('chat_index_plan_canonical', {
      sessionId: 'session-1',
      connectionId: 'conn-1',
      modeId: 'chat-developer',
      path: 'docs/PLAN.md',
      content: 'Current step: 2 / 5',
    });
  });

  it('does not call the backend for blank canonical inputs', async () => {
    await indexPlanCanonical('session-1', 'docs/PLAN.md', '   ');
    await indexPlanCanonical('session-1', '   ', 'Current step: 2 / 5');
    await indexPlanCanonical('   ', 'docs/PLAN.md', 'Current step: 2 / 5');

    expect(invokeMock).not.toHaveBeenCalled();
  });
});
