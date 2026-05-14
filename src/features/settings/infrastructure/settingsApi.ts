import type {
  HistoryItem,
  OllamaModel,
  PromptMode,
  ProviderInfo,
  SettingsTab,
  ShortcutItem,
} from '../domain';

const TABS: SettingsTab[] = [
  { id: 'general', label: 'General', iconName: 'cog' },
  { id: 'shortcuts', label: 'Shortcuts', iconName: 'keyboard' },
  { id: 'modes', label: 'Modes', iconName: 'layers' },
  { id: 'providers', label: 'Providers', iconName: 'cloud' },
  { id: 'history', label: 'History', iconName: 'history' },
  { id: 'appearance', label: 'Appearance', iconName: 'paint' },
  { id: 'advanced', label: 'Advanced', iconName: 'cpu' },
  { id: 'about', label: 'About', iconName: 'info' },
];

const MODES: PromptMode[] = [
  {
    id: 'developer',
    name: 'Developer',
    desc: 'Improves technical clarity for developers',
    sys: 'You are a senior software engineer. Rewrite the input to be technically precise, unambiguous, and idiomatic. Preserve all code identifiers exactly. Prefer active voice. Keep it concise — do not add commentary.',
    temp: 0.3,
    maxTok: 1024,
    provider: 'inherit',
    iconName: 'code',
  },
  {
    id: 'email',
    name: 'Email',
    desc: 'Professional email reply',
    sys: 'You write clear, courteous business emails. Match the tone of the source message. Open with a one-line greeting, deliver the message in 2-3 short paragraphs, close warmly.',
    temp: 0.5,
    maxTok: 800,
    provider: 'inherit',
    iconName: 'mail',
  },
  {
    id: 'friendly',
    name: 'Friendly',
    desc: 'Warm, casual tone',
    sys: 'Rewrite the input to sound like a thoughtful friend. Use contractions, light humor where it fits, and keep it warm. Avoid formality.',
    temp: 0.7,
    maxTok: 600,
    provider: 'inherit',
    iconName: 'friendly',
  },
  {
    id: 'concise',
    name: 'Concise',
    desc: 'Tighter, fewer words',
    sys: 'Cut the input to its essential message in 50% or fewer words. Preserve every concrete fact. No filler.',
    temp: 0.2,
    maxTok: 400,
    provider: 'inherit',
    iconName: 'shorten',
  },
  {
    id: 'technical',
    name: 'Technical',
    desc: 'Academic and formal',
    sys: 'Rewrite in academic register. Use precise terminology. Hedge claims appropriately. Cite implied premises explicitly.',
    temp: 0.3,
    maxTok: 1200,
    provider: 'inherit',
    iconName: 'formal',
  },
  {
    id: 'docs',
    name: 'Documentation',
    desc: 'API & technical docs',
    sys: 'You write developer documentation. Lead with what the thing does, then how to use it. Use code fences for snippets. Avoid marketing language.',
    temp: 0.2,
    maxTok: 1500,
    provider: 'inherit',
    iconName: 'text',
  },
];

const PROVIDERS: ProviderInfo[] = [
  { id: 'openai', name: 'OpenAI', accent: 'var(--openai)', status: 'ok', model: 'gpt-4.1', usage: 12420 },
  { id: 'anthropic', name: 'Anthropic', accent: 'var(--anthropic)', status: 'ok', model: 'claude-3-5-sonnet-20241022', usage: 3140 },
  { id: 'gemini', name: 'Google Gemini', accent: 'var(--gemini)', status: 'idle', model: 'gemini-2.0-pro', usage: 0 },
  { id: 'ollama', name: 'Ollama', accent: 'var(--ollama)', status: 'ok', model: 'llama3.1:8b', usage: 880, local: true },
];

const OLLAMA_MODELS: OllamaModel[] = [
  { name: 'llama3.1:8b', size: '4.7 GB', active: true, pulled: '2d ago' },
  { name: 'qwen2.5-coder:7b', size: '4.4 GB', active: false, pulled: '5d ago' },
  { name: 'mistral:7b-instruct', size: '4.1 GB', active: false, pulled: '1w ago' },
  { name: 'phi3:mini', size: '2.3 GB', active: false, pulled: '2w ago' },
];

const HISTORY: HistoryItem[] = [
  { id: 1, mode: 'Developer', iconName: 'code', provider: 'GPT-4.1', when: '2 min ago', ms: 1240,
    src: 'the function basically just loops through the items and skips the ones that are null',
    out: 'The function iterates over the collection, filtering out null entries before processing.', fav: true },
  { id: 2, mode: 'Email', iconName: 'mail', provider: 'Claude 3.5 Sonnet', when: '12 min ago', ms: 2180,
    src: 'thanks for the quick turnaround. lets sync friday',
    out: 'Thank you for the quick turnaround on this. Could we sync briefly on Friday afternoon to walk through the next steps?' },
  { id: 3, mode: 'Concise', iconName: 'shorten', provider: 'GPT-4.1', when: '34 min ago', ms: 980,
    src: 'I wanted to follow up regarding the proposal we discussed in our last meeting because there are several outstanding items that need clarification before we can move forward with the implementation.',
    out: 'Following up — several items need clarification before we move forward.' },
  { id: 4, mode: 'Documentation', iconName: 'text', provider: 'Claude 3.5 Sonnet', when: '1 hr ago', ms: 3120,
    src: 'this hook debounces a value and returns the debounced version',
    out: '`useDebounce(value, delay)` returns the latest value after `delay` ms without changes. Useful for taming high-frequency inputs like search fields.' },
  { id: 5, mode: 'Friendly', iconName: 'friendly', provider: 'GPT-4.1', when: '2 hr ago', ms: 1420,
    src: 'I am writing to inform you that the meeting has been rescheduled',
    out: 'Hey! Quick heads up — we ended up bumping the meeting. New time coming over shortly.', fav: true },
  { id: 6, mode: 'Developer', iconName: 'code', provider: 'llama3.1:8b', when: 'yesterday', ms: 4280,
    src: 'fix bug where component renders twice on mount',
    out: 'fix(home): prevent double-mount render caused by missing useEffect dependency' },
  { id: 7, mode: 'Formal', iconName: 'formal', provider: 'Claude 3.5 Sonnet', when: 'yesterday', ms: 1820,
    src: 'we need to push back on this deadline',
    out: 'We would like to formally request an adjustment to the proposed deadline to ensure quality of delivery.' },
];

const SHORTCUTS: ShortcutItem[] = [
  { id: 'palette', label: 'Open Command Palette', hint: 'The main entry point.', iconName: 'wand', keys: ['Ctrl', 'Shift', 'Space'] },
  { id: 'rewrite', label: 'Rewrite selection', hint: 'Improve writing in place.', iconName: 'pen', keys: ['Ctrl', 'Shift', 'R'] },
  { id: 'grammar', label: 'Fix grammar', hint: 'Quick grammar pass.', iconName: 'text', keys: ['Ctrl', 'Shift', 'G'] },
  { id: 'summary', label: 'Quick summarize', hint: 'Compress to bullets.', iconName: 'summarize', keys: ['Ctrl', 'Shift', 'S'] },
  { id: 'modes', label: 'Toggle modes', hint: 'Cycle the active mode.', iconName: 'layers', keys: ['Ctrl', 'Shift', 'M'] },
];

export const settingsApi = {
  getTabs: async () => TABS,
  getModes: async () => MODES,
  getProviders: async () => PROVIDERS,
  getOllamaModels: async () => OLLAMA_MODELS,
  getHistory: async () => HISTORY,
  getShortcuts: async () => SHORTCUTS,
};
