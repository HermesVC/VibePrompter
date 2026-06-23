/** Layered chat context — mirrors backend `ChatContextPayload`. */

export type ChatScopeKind = 'none' | 'snippet' | 'file' | 'workspace';

export type ApplyPolicy = 'always_ask' | 'always_apply' | 'allow_list_only';

export interface WorkspaceSettings {
  workspaceRoot: string;
  applyPolicy: ApplyPolicy;
  allowPaths: string[];
  allowGlobs: string[];
  allowDirs: string[];
  allowExtensions: string[];
  denyGlobs: string[];
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
  return {
    scope: ctx.scope,
    modifiers: ctx.modifiers,
    languageId: ctx.languageId,
  };
}

/** Duplicate scoped content into the user turn — local models often ignore system. */
export function formatScopeUserContext(scope: ChatScope): string {
  switch (scope.kind) {
    case 'snippet':
      return `[Attached snippet — edit only this code]\n\`\`\`\n${scope.working}\n\`\`\``;
    case 'file':
      return `[Attached file: ${scope.path} (lines ${scope.lineStart}-${scope.lineEnd})]\n\`\`\`\n${scope.content}\n\`\`\``;
    case 'workspace':
      return scope.treeSummary
        ? `[Workspace tree]\n${scope.treeSummary}`
        : '';
    default:
      return '';
  }
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
  allowExtensions: ['.php', '.ts', '.tsx', '.js', '.rs'],
  denyGlobs: ['.env', '**/.env', '**/vendor/**', '**/node_modules/**'],
};
