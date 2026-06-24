import { invoke } from '@tauri-apps/api/core';
import type { ChatModifier, WorkspaceSettings } from './chatContext';

export interface FileContentDto {
  path: string;
  content: string;
  contentHash: string;
  lineCount: number;
  languageId: string;
  lineStart: number;
  lineEnd: number;
}

export type PolicyDecision = 'allow' | 'ask' | 'deny';

export interface WritePreviewDto {
  path: string;
  decision: PolicyDecision;
  contentHashBefore?: string;
  lineCountBefore: number;
  lineCountAfter: number;
}

export interface WriteResultDto {
  path: string;
  contentHash: string;
  applied: boolean;
}

export interface FolderScopeFileDto {
  path: string;
  content: string;
  contentHash: string;
  languageId?: string;
}

export interface FolderScopeDto {
  path: string;
  treeSummary: string;
  outlineSummary: string;
  files: FolderScopeFileDto[];
  truncated: boolean;
}

export async function listWorkspaceDir(
  path?: string,
  depth?: number
): Promise<string[]> {
  return invoke<string[]>('list_workspace_dir', { path, depth });
}

export async function loadFolderScope(
  path: string,
  maxContentChars?: number
): Promise<FolderScopeDto> {
  return invoke<FolderScopeDto>('load_folder_scope', {
    path,
    maxContentChars,
  });
}

export async function pickWorkspaceFolder(): Promise<string | null> {
  return invoke<string | null>('pick_workspace_folder');
}

export async function getWorkspaceSettings(): Promise<WorkspaceSettings> {
  return invoke<WorkspaceSettings>('get_workspace_settings');
}

export async function saveWorkspaceSettings(settings: WorkspaceSettings): Promise<void> {
  await invoke('save_workspace_settings', { settings });
}

export async function listChatModifiers(): Promise<ChatModifier[]> {
  return invoke<ChatModifier[]>('list_chat_modifiers');
}

export async function readWorkspaceFile(
  path: string,
  startLine?: number,
  endLine?: number
): Promise<FileContentDto> {
  return invoke<FileContentDto>('read_workspace_file', {
    path,
    startLine,
    endLine,
  });
}

export async function resolveWorkspaceFilePath(absolutePath: string): Promise<FileContentDto> {
  return invoke<FileContentDto>('resolve_workspace_file_path', { absolutePath });
}

export async function workspaceTreeSummary(): Promise<string> {
  return invoke<string>('workspace_tree_summary');
}

export async function pickWorkspaceRoot(): Promise<string | null> {
  return invoke<string | null>('pick_workspace_root');
}

export async function pickWorkspaceFile(): Promise<string | null> {
  return invoke<string | null>('pick_workspace_file');
}

export async function previewWorkspaceWrite(
  path: string,
  content: string,
  contentHash?: string
): Promise<WritePreviewDto> {
  return invoke<WritePreviewDto>('preview_workspace_write', { path, content, contentHash });
}

export async function applyWorkspaceWrite(
  path: string,
  content: string,
  contentHash?: string,
  force = false
): Promise<WriteResultDto> {
  return invoke<WriteResultDto>('apply_workspace_write', {
    path,
    content,
    contentHash,
    force,
  });
}
