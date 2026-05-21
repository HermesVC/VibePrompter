/**
 * Warn (but never block) on obvious key/vendor mismatches. Pattern checks
 * are heuristic — Ollama needs no key, OpenAI keys start with `sk-`,
 * Anthropic with `sk-ant-`, Groq with `gsk_`, OpenRouter with `sk-or-`,
 * Gemini AI Studio keys start with `AIza`. Heuristics are derived from
 * the URL since `kind` only tells us protocol.
 */
export function keyFormatHint(draft: { baseUrl: string; apiKey: string; kind: string }): string | null {
  const k = draft.apiKey.trim();
  if (!k) return null;
  const url = draft.baseUrl.toLowerCase();

  if (url.includes('api.openai.com') && !k.startsWith('sk-')) {
    return 'OpenAI keys usually start with "sk-". Double-check you pasted the right one.';
  }
  if (url.includes('api.anthropic.com') && !k.startsWith('sk-ant-')) {
    return 'Anthropic keys usually start with "sk-ant-".';
  }
  if (url.includes('groq.com') && !k.startsWith('gsk_')) {
    return 'Groq keys usually start with "gsk_".';
  }
  if (url.includes('openrouter.ai') && !k.startsWith('sk-or-')) {
    return 'OpenRouter keys usually start with "sk-or-".';
  }
  if (url.includes('generativelanguage.googleapis.com') && !k.startsWith('AIza')) {
    return 'Gemini AI Studio keys usually start with "AIza".';
  }
  if (url.includes('localhost') && k.length > 0) {
    return 'Local servers (Ollama / LM Studio) typically need no key.';
  }
  return null;
}

export function isValidBaseUrl(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  if (/\s/.test(trimmed)) return false;
  try {
    new URL(trimmed);
    return true;
  } catch {
    return false;
  }
}

export function isValidJsonObject(s: string): boolean {
  try {
    const v = JSON.parse(s);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
    return Object.values(v).every((x) => typeof x === 'string');
  } catch {
    return false;
  }
}
