import { describe, it, expect, afterEach } from 'vitest';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { settingsApi } from './settingsApi';

afterEach(() => clearMocks());

describe('settingsApi (backend-backed)', () => {
  it('getModes invokes list_modes', async () => {
    mockIPC((cmd) => {
      if (cmd === 'list_modes') {
        return [
          { id: 'developer', name: 'Developer', desc: 'd', sys: 's', temp: 0.3, maxTok: 1024, provider: null, iconName: 'code' },
        ];
      }
      throw new Error(`unexpected: ${cmd}`);
    });
    const modes = await settingsApi.getModes();
    expect(modes[0].id).toBe('developer');
  });

  it('getProviders invokes list_providers', async () => {
    mockIPC((cmd) => {
      if (cmd === 'list_providers') {
        return [{ id: 'openai', name: 'OpenAI', accent: 'x', status: 'ok', model: 'gpt-4.1', usage: 0, local: false }];
      }
      throw new Error(`unexpected: ${cmd}`);
    });
    const providers = await settingsApi.getProviders();
    expect(providers[0].id).toBe('openai');
  });

  it('getHistory invokes get_history', async () => {
    mockIPC((cmd) => {
      if (cmd === 'get_history') return [];
      throw new Error(`unexpected: ${cmd}`);
    });
    expect(await settingsApi.getHistory()).toEqual([]);
  });

  it('getShortcuts invokes list_shortcuts', async () => {
    mockIPC((cmd) => {
      if (cmd === 'list_shortcuts') {
        return [{ id: 'palette', label: 'Open', hint: 'h', iconName: 'wand', accelerator: 'Ctrl+Shift+Space', action: 'open_palette', enabled: true, keys: ['Ctrl', 'Shift', 'Space'] }];
      }
      throw new Error(`unexpected: ${cmd}`);
    });
    const shortcuts = await settingsApi.getShortcuts();
    expect(shortcuts[0].keys).toEqual(['Ctrl', 'Shift', 'Space']);
  });
});
