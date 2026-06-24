/** Layered chat context — mirrors backend `ChatContextPayload`. */

export type ChatScopeKind = 'none' | 'snippet' | 'file' | 'folder' | 'workspace';

export type ApplyPolicy = 'always_ask' | 'always_apply' | 'allow_list_only';

export type PatchPolicy = 'strict' | 'warn' | 'off';

export interface WorkspaceSettings {
  workspaceRoot: string;
  applyPolicy: ApplyPolicy;
  allowPaths: string[];
  allowGlobs: string[];
  allowDirs: string[];
  allowExtensions: string[];
  denyGlobs: string[];
  /** How apply_patch enforces minimal edit size. Default: strict */
  patchPolicy?: PatchPolicy;
  /** Max lines in old_text per edit. Default: 15 */
  patchMaxLines?: number;
  /** LLM summary of tool-loop findings into semantic memory. Default: true */
  memoryLlmSummarize?: boolean;
}

export interface ChatModifier {
  id: string;
  label: string;
  description: string;
}

export type ChatScope =
  | { kind: 'none' }
  | {
      kind: 'snippet';
      original: string;
      working: string;
      path?: string;
      lineStart?: number;
      lineEnd?: number;
      languageId?: string;
    }
  | {
      kind: 'file';
      path: string;
      content: string;
      contentHash: string;
      lineStart: number;
      lineEnd: number;
      languageId?: string;
    }
  | {
      kind: 'workspace';
      treeSummary?: string;
    }
  | {
      kind: 'folder';
      path: string;
      treeSummary: string;
      outlineSummary: string;
      files: Array<{
        path: string;
        content: string;
        contentHash: string;
        languageId?: string;
      }>;
      truncated?: boolean;
    };

export interface ChatContextState {
  scope: ChatScope;
  modifiers: string[];
  languageId?: string;
}

export const DEFAULT_CHAT_CONTEXT: ChatContextState = {
  scope: { kind: 'none' },
  modifiers: [],
};

export function scopeKind(scope: ChatScope): ChatScopeKind {
  return scope.kind;
}

export function buildChatContextPayload(ctx: ChatContextState): {
  scope: ChatScope;
  modifiers: string[];
  languageId?: string;
} {
  let scope = ctx.scope;
  if (scope.kind === 'file') {
    const lines = Math.max(1, scope.content.split('\n').length);
    scope = {
      ...scope,
      contentHash: scope.contentHash || '',
      lineStart: scope.lineStart ?? 1,
      lineEnd: scope.lineEnd ?? lines,
    };
  }
  return {
    scope,
    modifiers: ctx.modifiers,
    languageId: ctx.languageId,
  };
}

/** Scopes that use workspace agent tools (read_file / apply_patch) on the backend. */
export function scopeUsesAgentTools(scope: ChatScope): boolean {
  return scope.kind === 'file' || scope.kind === 'folder' || scope.kind === 'workspace';
}

/** Duplicate scoped content into the user turn — skipped for agent-tool scopes (backend adds a short pointer). */
const SCOPE_TREE_MAX_CHARS = 10_000;

function capText(text: string, maxChars: number, label: string): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n… (${label} truncated)`;
}

export function formatScopeUserContext(scope: ChatScope, toolsActive = scopeUsesAgentTools(scope)): string {
  switch (scope.kind) {
    case 'snippet':
      return `[Attached snippet for reference]\n\`\`\`\n${scope.working}\n\`\`\``;
    case 'file':
      if (toolsActive) {
        return `[Scoped file: ${scope.path} (lines ${scope.lineStart}-${scope.lineEnd}) — use read_file tool]`;
      }
      return `[Attached file: ${scope.path} (lines ${scope.lineStart}-${scope.lineEnd})]\n\`\`\`\n${scope.content}\n\`\`\``;
    case 'workspace':
      if (toolsActive) {
        return '[Workspace scope — file tree is in the system prompt; use read_file for file bodies]';
      }
      return scope.treeSummary
        ? `[Workspace tree]\n${capText(scope.treeSummary, SCOPE_TREE_MAX_CHARS, 'workspace tree')}`
        : '';
    case 'folder':
      if (toolsActive) {
        return `[Scoped folder: ${scope.path} — tree/outline in system prompt; use list_dir / read_file]`;
      }
      return `[Attached folder: ${scope.path}]\n[Folder tree]\n${capText(scope.treeSummary, SCOPE_TREE_MAX_CHARS, 'folder tree')}\n\n[Folder outline]\n${capText(scope.outlineSummary, SCOPE_TREE_MAX_CHARS, 'folder outline')}`;
    default:
      return '';
  }
}

export type ScopeAttachmentKind = 'snippet' | 'file' | 'folder' | 'workspace';

export interface ParsedScopeAttachment {
  kind: ScopeAttachmentKind;
  label: string;
  body: string;
}

/** Split user bubble text vs embedded scope block (for compact UI). */
export function splitUserMessageScope(content: string): {
  userText: string;
  attachment: ParsedScopeAttachment | null;
} {
  const scopedPointer =
    /(?:^|\n\n)(\[Scoped file:[^\n]+\]|\[Scoped folder:[^\n]+\]|\[Workspace scope[^\n]*\])\s*$/;
  const scopedMatch = content.match(scopedPointer);
  if (scopedMatch) {
    const line = scopedMatch[1];
    const userText = content.slice(0, scopedMatch.index).trim();
    if (line.startsWith('[Scoped file:')) {
      const label = line.replace(/^\[Scoped file:\s*/, '').replace(/\s*—.*$/, '').replace(/\]$/, '');
      return { userText, attachment: { kind: 'file', label, body: '' } };
    }
    if (line.startsWith('[Scoped folder:')) {
      const label = line.replace(/^\[Scoped folder:\s*/, '').replace(/\s*—.*$/, '');
      return { userText, attachment: { kind: 'folder', label, body: '' } };
    }
    return { userText, attachment: { kind: 'workspace', label: 'Workspace', body: '' } };
  }

  const fenced =
    /(?:^|\n\n)((\[Attached snippet for reference\]|\[Attached snippet — edit only this code\]|\[Attached file:[^\n]+|\[Scoped file:[^\n]+)\n(?:```\n)?)([\s\S]*?)(?:```\s*)?$/;
  const fencedMatch = content.match(fenced);
  if (fencedMatch) {
    const header = fencedMatch[2];
    const body = fencedMatch[3];
    const userText = content.slice(0, fencedMatch.index).trim();
    const kind: ScopeAttachmentKind = header.startsWith('[Attached file:')
      ? 'file'
      : header.startsWith('[Scoped file:')
        ? 'file'
        : 'snippet';
    const label =
      kind === 'file'
        ? header.replace(/^\[Attached file:\s*/, '').replace(/\]$/, '')
        : header === '[Attached snippet for reference]'
          ? 'Snippet'
          : header;
    return { userText, attachment: { kind, label, body } };
  }

  const folder = /(?:^|\n\n)(\[Attached folder:[^\n]+\]\n[\s\S]*)$/;
  const folderMatch = content.match(folder);
  if (folderMatch) {
    return {
      userText: content.slice(0, folderMatch.index).trim(),
      attachment: {
        kind: 'folder',
        label: folderMatch[0].match(/\[Attached folder:\s*([^\]]+)\]/)?.[1] ?? 'Folder',
        body: folderMatch[1].trim(),
      },
    };
  }

  const tree = /(?:^|\n\n)(\[Workspace tree\]\n)([\s\S]*)$/;
  const treeMatch = content.match(tree);
  if (treeMatch) {
    return {
      userText: content.slice(0, treeMatch.index).trim(),
      attachment: {
        kind: 'workspace',
        label: 'Workspace tree',
        body: treeMatch[2].trim(),
      },
    };
  }

  return { userText: content, attachment: null };
}

export function toggleModifier(modifiers: string[], id: string): string[] {
  return modifiers.includes(id)
    ? modifiers.filter((m) => m !== id)
    : [...modifiers, id];
}

export function scopeLabel(scope: ChatScope): string | null {
  switch (scope.kind) {
    case 'none':
      return null;
    case 'snippet':
      return scope.path
        ? `Snippet · ${scope.path}`
        : `Snippet · ${scope.working.split('\n').length} lines`;
    case 'file':
      return `File · ${scope.path} (${scope.lineStart}-${scope.lineEnd})`;
    case 'workspace':
      return 'Workspace';
    case 'folder': {
      const lines = scope.treeSummary.split('\n').filter((l) => l && !l.endsWith('/')).length;
      return `Folder · ${scope.path} (${lines} files, tools)`;
    }
    default:
      return null;
  }
}

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  workspaceRoot: '',
  applyPolicy: 'always_ask',
  allowPaths: [],
  allowGlobs: [],
  allowDirs: [],
  allowExtensions: ['.php', '.ts', '.tsx', '.js', '.jsx', '.html', '.css', '.rs'],
  denyGlobs: ['.env', '**/.env', '**/vendor/**', '**/node_modules/**'],
  patchPolicy: 'strict',
  patchMaxLines: 40,
  memoryLlmSummarize: true,
};
