import { invoke } from '@tauri-apps/api/core';

export interface ContextArtifactInput {
  path: string;
  content: string;
}

/** Index contextual file artifacts (plans, markdown) into session vector memory. */
export async function indexContextArtifacts(
  sessionId: string,
  artifacts: ContextArtifactInput[],
  opts?: { connectionId?: string; modeId?: string }
): Promise<void> {
  if (!sessionId.trim() || !artifacts.length) return;
  await invoke('chat_index_context_artifacts', {
    sessionId,
    connectionId: opts?.connectionId,
    modeId: opts?.modeId,
    artifacts,
  });
}

/** Index folder symbol outline into session vector memory. */
export async function indexFolderOutline(
  sessionId: string,
  folderPath: string,
  outlineSummary: string,
  opts?: { connectionId?: string; modeId?: string }
): Promise<void> {
  if (!sessionId.trim() || !outlineSummary.trim()) return;
  await invoke('chat_index_folder_outline', {
    sessionId,
    connectionId: opts?.connectionId,
    modeId: opts?.modeId,
    input: { folderPath, outlineSummary },
  });
}

/** Index a brief plan-step summary into session vector memory. */
export async function indexPlanStepSummary(
  sessionId: string,
  summary: string,
  opts?: { connectionId?: string; modeId?: string }
): Promise<void> {
  if (!sessionId.trim() || !summary.trim()) return;
  await invoke('chat_index_plan_step_summary', {
    sessionId,
    connectionId: opts?.connectionId,
    modeId: opts?.modeId,
    summary,
  });
}

/** Upsert canonical plan state from an applied PLAN.md. */
export async function indexPlanCanonical(
  sessionId: string,
  path: string,
  content: string,
  opts?: { connectionId?: string; modeId?: string }
): Promise<void> {
  if (!sessionId.trim() || !path.trim() || !content.trim()) return;
  await invoke('chat_index_plan_canonical', {
    sessionId,
    connectionId: opts?.connectionId,
    modeId: opts?.modeId,
    path,
    content,
  });
}
