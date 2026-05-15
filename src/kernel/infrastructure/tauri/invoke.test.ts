import { describe, it, expect, afterEach } from 'vitest';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { invokeCommand, TauriError } from './invoke';

afterEach(() => clearMocks());

describe('invokeCommand', () => {
  it('returns the resolved value on success', async () => {
    mockIPC((cmd) => {
      if (cmd === 'get_settings') return { theme: 'dark' };
      throw new Error(`unexpected command: ${cmd}`);
    });
    const result = await invokeCommand<{ theme: string }>('get_settings');
    expect(result.theme).toBe('dark');
  });

  it('wraps a serialized AppError into a TauriError', async () => {
    mockIPC(() => {
      throw { code: 'DATABASE_ERROR', message: 'A database operation failed.', retriable: false };
    });
    await expect(invokeCommand('get_settings')).rejects.toBeInstanceOf(TauriError);
    await invokeCommand('get_settings').catch((e: TauriError) => {
      expect(e.code).toBe('DATABASE_ERROR');
      expect(e.retriable).toBe(false);
    });
  });
});
