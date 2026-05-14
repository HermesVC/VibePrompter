export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'ollama';

export interface ProviderOption {
  id: ProviderId;
  name: string;
  hint: string;
  accent: string;
}

export type ModeId = 'professional' | 'developer' | 'grammar' | 'email' | 'friendly';
