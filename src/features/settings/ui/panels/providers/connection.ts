// Provider-connection data shapes + vendor presets, shared by the panel
// container, the list view, and the editor form.

export interface Connection {
  id: string;
  label: string;
  kind: string;
  baseUrl: string;
  apiKeyTail: string;
  hasKey: boolean;
  defaultModel: string;
  isDefault: boolean;
  extraHeaders: string;
  lastUsedAt: string;
  notes: string;
  tags: string;
  priceInputPerM: number;
  priceOutputPerM: number;
}

export interface ConnectionDraft {
  id: string | null;
  label: string;
  kind: 'openai' | 'anthropic';
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  isDefault: boolean;
  extraHeaders: string;
  notes: string;
  tags: string;
  priceInputPerM: number;
  priceOutputPerM: number;
}

export interface Preset {
  label: string;
  baseUrl: string;
  kind: 'openai' | 'anthropic';
  model: string;
}

// We deliberately do NOT ship a hardcoded list of models — only base URLs and
// a sensible starter model per vendor. The user types a model string (or
// fetches the live list) so a new vendor/model never requires an app release.
export const PRESETS: Record<string, Preset> = {
  openai:     { label: 'OpenAI',       baseUrl: 'https://api.openai.com/v1',                              kind: 'openai',    model: 'gpt-5-mini' },
  anthropic:  { label: 'Anthropic',    baseUrl: 'https://api.anthropic.com/v1',                           kind: 'anthropic', model: 'claude-sonnet-4-6' },
  openrouter: { label: 'OpenRouter',   baseUrl: 'https://openrouter.ai/api/v1',                           kind: 'openai',    model: 'openai/gpt-5-mini' },
  groq:       { label: 'Groq',         baseUrl: 'https://api.groq.com/openai/v1',                         kind: 'openai',    model: 'llama-3.3-70b-versatile' },
  mistral:    { label: 'Mistral',      baseUrl: 'https://api.mistral.ai/v1',                              kind: 'openai',    model: 'mistral-large-latest' },
  deepseek:   { label: 'DeepSeek',     baseUrl: 'https://api.deepseek.com/v1',                            kind: 'openai',    model: 'deepseek-chat' },
  together:   { label: 'Together',     baseUrl: 'https://api.together.xyz/v1',                            kind: 'openai',    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
  gemini:     { label: 'Gemini',       baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', kind: 'openai',    model: 'gemini-flash-lite-latest' },
  xai:        { label: 'xAI (Grok)',   baseUrl: 'https://api.x.ai/v1',                                    kind: 'openai',    model: 'grok-4' },
  ollama:     { label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1',                            kind: 'openai',    model: 'llama3.3' },
  lmstudio:   { label: 'LM Studio (local)', baseUrl: 'http://localhost:1234/v1',                          kind: 'openai',    model: '' },
};

export const emptyDraft = (): ConnectionDraft => ({
  id: null,
  label: '',
  kind: 'openai',
  baseUrl: '',
  apiKey: '',
  defaultModel: '',
  isDefault: false,
  extraHeaders: '',
  notes: '',
  tags: '',
  priceInputPerM: 0,
  priceOutputPerM: 0,
});
