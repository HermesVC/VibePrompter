import type { QuickAction } from '../domain';

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'improve', label: 'Improve Writing', hint: 'Polish for clarity & tone', iconName: 'sparkles', kbd: ['⌘', 'I'] },
  { id: 'grammar', label: 'Fix Grammar', hint: 'Spelling, punctuation, syntax', iconName: 'text', kbd: ['⌘', 'G'] },
  { id: 'summary', label: 'Summarize', hint: 'Condense to key points', iconName: 'summarize', kbd: ['⌘', 'S'] },
  { id: 'explain', label: 'Explain', hint: 'Break it down step by step', iconName: 'info', kbd: ['⌘', 'E'] },
  { id: 'translate', label: 'Translate', hint: 'Detect language and convert', iconName: 'translate', kbd: ['⌘', 'T'] },
  { id: 'pro', label: 'Make Professional', hint: 'Business-formal register', iconName: 'formal', kbd: ['⌘', 'P'] },
  { id: 'friendly', label: 'Make Friendly', hint: 'Warm and conversational', iconName: 'friendly', kbd: ['⌘', 'F'] },
  { id: 'shorten', label: 'Shorten', hint: 'Tighten by ~50%', iconName: 'shorten', kbd: ['⌘', '-'] },
  { id: 'expand', label: 'Expand', hint: 'Add detail and context', iconName: 'expand', kbd: ['⌘', '+'] },
  { id: 'email', label: 'Convert to Email', hint: 'Format as a polite reply', iconName: 'mail', kbd: ['⌘', 'M'] },
  { id: 'commit', label: 'Commit Message', hint: 'Conventional commits', iconName: 'code', kbd: ['⌘', '/'] },
  { id: 'docs', label: 'Generate Docs', hint: 'API & inline comments', iconName: 'text', kbd: ['⌘', 'D'] },
];

const RECENT_MODES = ['Developer', 'Email', 'Formal', 'Code Review', 'Documentation', 'Concise'];

const SAMPLE_OUTPUT =
  'The function iterates over the collection, filtering out null entries before processing each item. This guards against runtime errors in downstream consumers.';

export const paletteApi = {
  getQuickActions: async (): Promise<QuickAction[]> => QUICK_ACTIONS,
  getRecentModes: async (): Promise<string[]> => RECENT_MODES,
  getSampleResponse: (): string => SAMPLE_OUTPUT,
};
