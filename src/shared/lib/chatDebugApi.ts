import { invoke } from '@tauri-apps/api/core';

export interface ChatDebugMessage {
  role: 'user' | 'assistant' | 'system' | string;
  content: string;
  images?: Array<{ mimeType: string; dataBase64: string }>;
}

export interface ChatDebugScenarioInput {
  messages: ChatDebugMessage[];
  modeId?: string | null;
  connectionId?: string | null;
  chatContext?: unknown;
  sessionSummary?: string | null;
  sessionId?: string | null;
}

export interface ChatDebugScenarioOutput {
  trace: Array<Record<string, unknown>>;
  result: unknown | null;
  error: string | null;
}

export async function runChatDebugScenario(
  input: ChatDebugScenarioInput
): Promise<ChatDebugScenarioOutput> {
  return invoke<ChatDebugScenarioOutput>('chat_debug_run_scenario', { input });
}
