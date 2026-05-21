import type { IconName } from '@shared/ui';

export interface Mode {
  id: string;
  name: string;
  desc: string;
  sys: string;
  temp: number;
  maxTok: number;
  provider?: string | null;
  iconName: string;
  /** JSON object string of `{ "var": "default value" }`. Substituted into
   *  `sys` at run time wherever `{{var}}` appears. Empty `{}` if no
   *  variables. Kept as a string here to match the backend's storage
   *  shape and avoid round-trip drift through the IPC boundary. */
  variables: string;
  enabled: boolean;
  isSystem: boolean;
}

export interface Connection {
  id: string;
  label: string;
}

export interface ActiveMode {
  id: string;
}

export interface Template {
  name: string;
  desc: string;
  sys: string;
  temp: number;
  maxTok: number;
  iconName: IconName;
}

export const ICON_CHOICES: IconName[] = [
  'bolt', 'wand', 'code', 'mail', 'pen', 'text',
  'summarize', 'shorten', 'formal', 'friendly', 'translate', 'expand',
];

export const blank = (): Mode => ({
  id: '',
  name: '',
  desc: '',
  sys: '',
  temp: 0.5,
  maxTok: 1024,
  provider: null,
  iconName: 'bolt',
  variables: '{}',
  enabled: true,
  isSystem: false,
});

/** Curated starter prompts. Each one drops into a fresh draft as a starting
 *  point — the user owns the resulting mode and can edit anything. */
export const TEMPLATES: Template[] = [
  { name: 'Blank',              desc: 'Start from an empty prompt.',                                  sys: '',                                                                                                                                                                                                                       temp: 0.5, maxTok: 1024, iconName: 'bolt' },
  { name: 'Improve writing',    desc: 'Polish grammar, clarity, and flow without changing meaning.',  sys: 'You improve the writing of the user\'s text. Fix grammar, clarity, and flow. Keep the meaning, tone, and language exactly the same. Reply with ONLY the improved text — no preamble, no explanation, no quotes.', temp: 0.3, maxTok: 2048, iconName: 'pen' },
  { name: 'Make concise',       desc: 'Shorten text while preserving all key information.',          sys: 'Rewrite the user\'s text to be as concise as possible without losing any key information. Drop filler, hedging, and redundancy. Reply with ONLY the shortened text.',                                              temp: 0.3, maxTok: 1024, iconName: 'shorten' },
  { name: 'Formal tone',        desc: 'Polished, professional voice.',                                sys: 'Rewrite the user\'s text in a polished, professional, formal voice suitable for business communication. Keep the meaning unchanged. Reply with ONLY the rewritten text.',                                          temp: 0.4, maxTok: 2048, iconName: 'formal' },
  { name: 'Friendly tone',      desc: 'Warm and approachable.',                                       sys: 'Rewrite the user\'s text to sound warm, friendly, and approachable. Keep it professional enough for work. Reply with ONLY the rewritten text.',                                                                  temp: 0.5, maxTok: 2048, iconName: 'friendly' },
  { name: 'Translate to English', desc: 'Natural English translation (auto-detects source language).', sys: 'You are a professional translator. Auto-detect the source language of the user\'s text — it could be any language. Translate it into natural, fluent English.\n\nHard rules:\n- Preserve tone, register, and intent of the original (formal stays formal, casual stays casual).\n- Preserve proper nouns, names, code identifiers, URLs, and numbers exactly.\n- Idioms: prefer the closest English equivalent over a literal translation.\n- If the input is already English (or mixed with English), translate only the non-English portions and leave the English parts unchanged.\n- Do not add notes about the source language or your translation choices.\n- Output ONLY the translated text — no preamble, no commentary, no surrounding quotes.', temp: 0.3, maxTok: 2048, iconName: 'translate' },
  { name: 'Explain like I\'m 5', desc: 'Plain-language explanation of complex text.',                  sys: 'Explain the user\'s text in plain language a smart 12-year-old would understand. Use short sentences and concrete examples. No jargon.',                                                                          temp: 0.5, maxTok: 2048, iconName: 'wand' },
  { name: 'Code review',        desc: 'Critique code for bugs, style, and readability.',              sys: 'You are a senior software engineer reviewing the user\'s code. Identify bugs, security issues, performance problems, and readability improvements. Be specific — quote the relevant code when you flag something.', temp: 0.2, maxTok: 3072, iconName: 'code' },
];

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
