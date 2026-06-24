export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ConnContextInfo {
  id: string;
  hasKey: boolean;
  isDefault: boolean;
  contextWindowSize: number;
  baseUrl?: string;
}

/** Compact token count for tooltips (e.g. 54.2k, 128k, 1.0M). */
export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

/** Rough char/4 estimate when the vendor omits usage metadata. */
export function estimateTokensFromChars(charCount: number, imageCount = 0): number {
  return Math.ceil(charCount / 4) + imageCount * 500;
}

export function estimateMessageTokens(message: {
  content: string;
  images?: readonly unknown[] | null;
}): number {
  return estimateTokensFromChars(message.content.length, message.images?.length ?? 0);
}

/** Drop oldest turns so the next request fits the model context (keeps recent history). */
export function trimMessagesToTokenBudget<T extends { role: string; content: string; images?: readonly unknown[] | null }>(
  messages: T[],
  contextLimit: number,
  reserveOutputTokens = 1536
): { messages: T[]; droppedCount: number } {
  if (contextLimit <= 0 || messages.length === 0) {
    return { messages, droppedCount: 0 };
  }

  const inputBudget = Math.max(512, contextLimit - reserveOutputTokens);
  const tokenCount = (list: T[]) =>
    list.reduce((sum, m) => sum + estimateMessageTokens(m), 0);

  let working = [...messages];
  let droppedCount = 0;
  const initialLen = working.length;

  while (working.length > 1 && tokenCount(working) > inputBudget) {
    if (
      working.length >= 2 &&
      working[0].role === 'user' &&
      working[1].role === 'assistant'
    ) {
      working.splice(0, 2);
      droppedCount += 2;
    } else {
      working.shift();
      droppedCount += 1;
    }
  }

  if (working.length === 0 && messages.length > 0) {
    working = [messages[messages.length - 1]];
    droppedCount = initialLen - 1;
  }

  return { messages: working, droppedCount };
}

export function resolveContextUsed(
  usage: TokenUsage | null | undefined,
  fallbackEstimate: number
): number {
  if (usage && usage.inputTokens > 0) return usage.inputTokens;
  return fallbackEstimate;
}

/** Rough token budget for the next chat request (messages + session summary). */
export function estimateChatRequestTokens(
  messages: ReadonlyArray<{ role: string; content: string; images?: readonly unknown[] | null }>,
  sessionSummary = ''
): number {
  let chars = sessionSummary.length;
  let images = 0;
  for (const m of messages) {
    chars += m.content.length;
    images += m.images?.length ?? 0;
  }
  // System prompt, tools protocol, scope metadata (not always in message bodies).
  chars += 2_500;
  return estimateTokensFromChars(chars, images);
}

export function resolveActiveConnection(
  conns: ConnContextInfo[],
  connectionId: string
): ConnContextInfo | null {
  if (connectionId) {
    const picked = conns.find((c) => c.id === connectionId);
    if (picked) return picked;
  }
  return (
    conns.find((c) => c.isDefault) ??
    conns.find((c) => c.hasKey) ??
    conns.find((c) => (c.baseUrl ?? '').trim().length > 0) ??
    conns[0] ??
    null
  );
}

/** Normalize usage from Tauri events (camelCase or snake_case). */
export function normalizeTokenUsage(raw: unknown): TokenUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  const input = Number(u.inputTokens ?? u.input_tokens ?? 0);
  const output = Number(u.outputTokens ?? u.output_tokens ?? 0);
  if (!Number.isFinite(input) || !Number.isFinite(output)) return null;
  if (input <= 0 && output <= 0) return null;
  return {
    inputTokens: Math.max(0, Math.floor(input)),
    outputTokens: Math.max(0, Math.floor(output)),
  };
}

export function contextTokensRemaining(used: number, limit: number): number | null {
  if (limit <= 0 || used < 0) return null;
  return Math.max(0, limit - used);
}

/** Merge a probed context limit from a completion into the local connection list. */
export function applyCompletionContextUpdate<T extends ConnContextInfo>(
  conns: T[],
  connectionId: string,
  contextWindowSize?: number
): T[] {
  if (!connectionId || !contextWindowSize || contextWindowSize <= 0) return conns;
  return conns.map((c) =>
    c.id === connectionId ? { ...c, contextWindowSize } : c
  );
}

export function contextFillPercent(used: number, limit: number): number | null {
  if (limit <= 0 || used < 0) return null;
  return Math.min(100, Math.round((used / limit) * 100));
}

/** Fallback limits when the user has not set context window on the connection. */
export function effectiveContextLimit(
  conn: { contextWindowSize: number; baseUrl?: string } | null | undefined
): number {
  if (!conn) return 0;
  if (conn.contextWindowSize > 0) return conn.contextWindowSize;
  const url = (conn.baseUrl ?? '').toLowerCase();
  if (url.includes('localhost:11434') || url.includes('localhost:1234')) return 8192;
  if (url.includes('api.anthropic.com')) return 200_000;
  if (url.includes('api.deepseek.com')) return 64_000;
  if (url.includes('generativelanguage.googleapis.com')) return 1_000_000;
  if (
    url.includes('openrouter.ai') ||
    url.includes('api.openai.com') ||
    url.includes('api.groq.com') ||
    url.includes('api.mistral.ai') ||
    url.includes('api.together.xyz') ||
    url.includes('api.x.ai')
  ) {
    return 128_000;
  }
  return 0;
}

export function isContextLimitInferred(
  conn: { contextWindowSize: number; baseUrl?: string } | null | undefined
): boolean {
  if (!conn) return false;
  return conn.contextWindowSize <= 0 && effectiveContextLimit(conn) > 0;
}
