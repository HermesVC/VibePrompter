import type { ProviderOption } from '../domain';

const PROVIDERS: ProviderOption[] = [
  { id: 'openai', name: 'OpenAI', hint: 'GPT-4.1, GPT-4o, o3', accent: 'var(--openai)' },
  { id: 'anthropic', name: 'Anthropic', hint: 'Claude 3.5 Sonnet, Haiku', accent: 'var(--anthropic)' },
  { id: 'gemini', name: 'Gemini', hint: 'Gemini 2.0 Pro, Flash', accent: 'var(--gemini)' },
  { id: 'ollama', name: 'Ollama', hint: 'Run local models on-device', accent: 'var(--ollama)' },
];

const MODES = ['Professional', 'Developer', 'Grammar', 'Email', 'Friendly'];

export const onboardingApi = {
  getProviders: async (): Promise<ProviderOption[]> => PROVIDERS,
  getModes: async (): Promise<string[]> => MODES,
  validateApiKey: async (_key: string): Promise<{ valid: boolean; modelCount: number }> => ({
    valid: true,
    modelCount: 6,
  }),
};
