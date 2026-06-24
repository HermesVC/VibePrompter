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

export interface HarnessDeterministicReport {
  checks: Array<{ id: string; pass: boolean; detail: string }>;
  allPass: boolean;
}

export async function runHarnessDeterministic(): Promise<HarnessDeterministicReport> {
  return invoke<HarnessDeterministicReport>('harness_run_deterministic');
}

export async function harnessCheckWorkspaceFiles(
  paths: string[]
): Promise<{ present: string[]; missing: string[] }> {
  return invoke<{ present: string[]; missing: string[] }>('harness_check_workspace_files', {
    paths,
  });
}

export async function harnessApplyGeneratedFences(text: string): Promise<string[]> {
  return invoke<string[]>('harness_apply_generated_fences', { text });
}

export async function harnessResetSyntheticFixture(): Promise<string> {
  return invoke<string>('harness_reset_synthetic_fixture');
}
