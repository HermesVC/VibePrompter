/** Persist chat-window transcript between app sessions (text only — no images). */

import type { ChatContextState } from './chatContext';
import { DEFAULT_CHAT_CONTEXT } from './chatContext';

const STORAGE_KEY = 'vp_chat_window_session';

export function createChatSessionId(): string {
  return crypto.randomUUID();
}

export interface PersistedChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  scopedText?: string;
  error?: string;
  meta?: { model: string; latencyMs: number };
}

export interface PersistedChatSession {
  version: 1;
  savedAt: string;
  sessionId: string;
  messages: PersistedChatMessage[];
  chatContext: ChatContextState;
  connectionId: string;
  sessionSummary?: string;
}

export function loadChatSession(): PersistedChatSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedChatSession;
    if (parsed?.version !== 1 || !Array.isArray(parsed.messages)) return null;
    return {
      version: 1,
      savedAt: parsed.savedAt ?? '',
      sessionId:
        typeof parsed.sessionId === 'string' && parsed.sessionId.trim()
          ? parsed.sessionId
          : createChatSessionId(),
      messages: parsed.messages.filter(
        (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
      ),
      chatContext: parsed.chatContext ?? DEFAULT_CHAT_CONTEXT,
      connectionId: typeof parsed.connectionId === 'string' ? parsed.connectionId : '',
      sessionSummary:
        typeof parsed.sessionSummary === 'string' ? parsed.sessionSummary : undefined,
    };
  } catch {
    return null;
  }
}

export function saveChatSession(
  session: Omit<PersistedChatSession, 'version' | 'savedAt'>
): void {
  try {
    const payload: PersistedChatSession = {
      version: 1,
      savedAt: new Date().toISOString(),
      sessionId: session.sessionId,
      messages: session.messages,
      chatContext: session.chatContext,
      connectionId: session.connectionId,
      sessionSummary: session.sessionSummary,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota or private mode — ignore */
  }
}

export function clearChatSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
