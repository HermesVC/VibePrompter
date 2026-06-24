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
