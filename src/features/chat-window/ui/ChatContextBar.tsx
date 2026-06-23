import { useCallback, useEffect, useState } from 'react';
import {
  type ChatContextState,
  type ChatModifier,
  type ChatScope,
  scopeLabel,
  toggleModifier,
} from '@shared/lib/chatContext';
import { readClipboardText } from '@shared/lib/clipboard';
import {
  listChatModifiers,
  pickWorkspaceFile,
  readWorkspaceFile,
  resolveWorkspaceFilePath,
  workspaceTreeSummary,
} from '@shared/lib/workspaceApi';

interface ChatContextBarProps {
  ctx: ChatContextState;
  disabled?: boolean;
  onChange: (next: ChatContextState) => void;
  onError: (msg: string | null) => void;
}

export function ChatContextBar({ ctx, disabled, onChange, onError }: ChatContextBarProps) {
  const [modifiers, setModifiers] = useState<ChatModifier[]>([]);

  useEffect(() => {
    listChatModifiers().then(setModifiers).catch(() => setModifiers([]));
  }, []);

  const setScope = useCallback(
    (scope: ChatScope) => {
      onChange({ ...ctx, scope });
    },
    [ctx, onChange]
  );

  const attachSnippetFromClipboard = useCallback(async () => {
    try {
      const text = await readClipboardText();
      const trimmed = text.trim();
      if (!trimmed) {
        onError('Clipboard is empty');
        return;
      }
      onError(null);
      setScope({
        kind: 'snippet',
        original: trimmed,
        working: trimmed,
      });
    } catch {
      onError('Could not read clipboard');
    }
  }, [onError, setScope]);

  const attachFile = useCallback(async () => {
    onError(null);
    try {
      const picked = await pickWorkspaceFile();
      if (!picked) return;
      const file = await resolveWorkspaceFilePath(picked);
      setScope({
        kind: 'file',
        path: file.path,
        content: file.content,
        contentHash: file.contentHash,
        lineStart: file.lineStart,
        lineEnd: file.lineEnd,
        languageId: file.languageId,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [onError, setScope]);

  const attachWorkspace = useCallback(async () => {
    onError(null);
    try {
      const tree = await workspaceTreeSummary();
      setScope({ kind: 'workspace', treeSummary: tree });
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [onError, setScope]);

  const clearScope = useCallback(() => {
    onChange({ ...ctx, scope: { kind: 'none' } });
  }, [ctx, onChange]);

  const label = scopeLabel(ctx.scope);

  return (
    <div
      data-no-drag
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '6px 12px',
        borderBottom: '.5px solid var(--divider)',
        background: 'var(--bg-2)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <ScopeBtn
          active={ctx.scope.kind === 'none'}
          disabled={disabled}
          onClick={() => setScope({ kind: 'none' })}
          title="Free chat"
        >
          Free
        </ScopeBtn>
        <ScopeBtn
          active={ctx.scope.kind === 'snippet'}
          disabled={disabled}
          onClick={attachSnippetFromClipboard}
          title="Paste selection from clipboard as scoped snippet"
        >
          Snippet
        </ScopeBtn>
        <ScopeBtn active={ctx.scope.kind === 'file'} disabled={disabled} onClick={attachFile} title="Attach a file">
          File
        </ScopeBtn>
        <ScopeBtn
          active={ctx.scope.kind === 'workspace'}
          disabled={disabled}
          onClick={attachWorkspace}
          title="Load workspace file tree"
        >
          Workspace
        </ScopeBtn>
        {label && (
          <span
            style={{
              fontSize: 10.5,
              color: 'var(--accent)',
              background: 'var(--accent-tint)',
              padding: '2px 8px',
              borderRadius: 999,
              maxWidth: 220,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={label}
          >
            {label}
          </span>
        )}
        {ctx.scope.kind !== 'none' && (
          <button
            type="button"
            disabled={disabled}
            onClick={clearScope}
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              color: 'var(--fg-dim)',
              background: 'transparent',
              border: 'none',
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            Clear scope
          </button>
        )}
      </div>
      {modifiers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--fg-dim)', marginRight: 2 }}>+</span>
          {modifiers.map((m) => {
            const on = ctx.modifiers.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                disabled={disabled}
                title={m.description}
                onClick={() =>
                  onChange({
                    ...ctx,
                    modifiers: toggleModifier(ctx.modifiers, m.id),
                  })
                }
                style={{
                  fontSize: 10,
                  padding: '2px 7px',
                  borderRadius: 999,
                  border: '.5px solid var(--border-strong)',
                  background: on ? 'var(--accent-tint)' : 'transparent',
                  color: on ? 'var(--accent)' : 'var(--fg-mute)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScopeBtn({
  children,
  active,
  disabled,
  onClick,
  title,
}: {
  children: React.ReactNode;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      style={{
        fontSize: 10.5,
        padding: '3px 9px',
        borderRadius: 6,
        border: active ? '.5px solid var(--accent)' : '.5px solid var(--border)',
        background: active ? 'var(--accent-tint)' : 'var(--surface)',
        color: active ? 'var(--accent)' : 'var(--fg)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}

/** Reload file scope content from disk (e.g. before apply). */
export async function refreshFileScope(scope: Extract<ChatScope, { kind: 'file' }>) {
  const file = await readWorkspaceFile(scope.path, scope.lineStart, scope.lineEnd);
  return {
    ...scope,
    content: file.content,
    contentHash: file.contentHash,
    languageId: file.languageId,
  };
}
