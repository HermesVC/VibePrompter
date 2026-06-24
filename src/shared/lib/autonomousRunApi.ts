import { invoke } from '@tauri-apps/api/core';
import type { ChatDebugMessage } from './chatDebugApi';

export type AutonomousPhase =
  | 'planning'
  | 'executing'
  | 'verifying'
  | 'replanning'
  | 'completing'
  | 'done'
  | 'failed'
  | 'cancelled';

export type StepStatus = 'pending' | 'in_progress' | 'done' | 'failed' | 'skipped';

export interface AutonomousRunConfig {
  maxSteps?: number;
  maxReplans?: number;
  planningEnabled?: boolean;
  verifySteps?: boolean;
  maxStepRetries?: number;
}

export interface StepSnapshot {
  id: number;
  title: string;
  status: StepStatus;
}

export interface AutonomousPlanSnapshot {
  progress: string;
  /** Orchestrator step id (in_progress or next pending). */
  currentStepId?: number | null;
  steps: StepSnapshot[];
  planningWarning?: string | null;
  specPath?: string | null;
  stepWarning?: string | null;
}

export interface AutonomousStepRecord {
  stepId: number;
  title: string;
  phase: AutonomousPhase;
  assistantPreview: string;
  verifyOk?: boolean | null;
  verifyMessage?: string | null;
}

export interface AutonomousRunResult {
  phase: AutonomousPhase;
  plan?: { steps: StepSnapshot[] } | null;
  steps: AutonomousStepRecord[];
  finalText: string;
  replansUsed: number;
  memoryDiagnostics?: MemoryDiagnostics | null;
  vectorChunksUsed?: number | null;
  retrievedMemory?: string | null;
}

export interface MemoryDiagnostics {
  rollingSummaryChars?: number;
  evictedTurns?: number;
  vectorAvailable?: boolean;
  vectorChunksIndexed?: number;
  vectorChunksRetrieved?: number;
  retrievalQueryPreview?: string;
  retrievedMemoryChars?: number;
  degradeLevelUsed?: number;
  degradeLabel?: string;
  inputEstimateFirst?: number;
  inputEstimateFinal?: number;
  contextLimit?: number;
}

export interface AutonomousRunStreamInput {
  streamId: string;
  goal: string;
  messages: ChatDebugMessage[];
  modeId?: string | null;
  connectionId?: string | null;
  chatContext?: unknown;
  sessionSummary?: string | null;
  sessionId?: string | null;
  config?: AutonomousRunConfig;
}

export async function autonomousRunStream(
  input: AutonomousRunStreamInput
): Promise<AutonomousRunResult> {
  return invoke<AutonomousRunResult>('autonomous_run_stream', { input });
}

export interface AutonomousDebugRunOutput {
  trace: Array<Record<string, unknown>>;
  result: AutonomousRunResult | null;
  error: string | null;
}

export async function autonomousDebugRun(
  input: Omit<AutonomousRunStreamInput, 'streamId'>
): Promise<AutonomousDebugRunOutput> {
  return invoke<AutonomousDebugRunOutput>('autonomous_debug_run', { input });
}
