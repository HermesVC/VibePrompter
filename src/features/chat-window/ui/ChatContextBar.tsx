import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import {
  type ChatContextState,
  type ChatModifier,
  type ChatScope,
  scopeLabel,
  toggleModifier,
} from '@shared/lib/chatContext';
import { captureEditorSelection, languageIdForSnippet } from '@shared/lib/clipboard';
import { errorMessage } from '@shared/lib/utils';
import {
  listChatModifiers,
  loadFolderScope,
  pickWorkspaceFile,
  pickWorkspaceFolder,
  readWorkspaceFile,
  resolveWorkspaceFilePath,
  workspaceTreeSummary,
} from '@shared/lib/workspaceApi';

interface ChatContextBarProps {
  ctx: ChatContextState;
  disabled?: boolean;
  onChange: Dispatch<SetStateAction<ChatContextState>>;
  onError: (msg: string | null) => void;
}

export function ChatContextBar({ ctx, disabled, onChange, onError }: ChatContextBarProps) {
  const [modifiers, setModifiers] = useState<ChatModifier[]>([]);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    listChatModifiers().then(setModifiers).catch(() => setModifiers([]));
  }, []);

  const setScope = useCallback(
    (scope: ChatScope) => {
      onChange((prev) => {
        const keepsDev =
          scope.kind === 'file' || scope.kind === 'folder' || scope.kind === 'workspace';
        return {
          ...prev,
          scope,
          modifiers: keepsDev
            ? prev.modifiers
            : prev.modifiers.filter((m) => m !== 'developer'),
        };
      });
    },
    [onChange]
  );

  const attachSnippetFromSelection = useCallback(async () => {
    setCapturing(true);
    onError(null);
    try {
      const text = await captureEditorSelection();
      const trimmed = text.trim();
      if (!trimmed) {
        onError(
          'Сначала выделите код в редакторе и нажмите Ctrl+C, затем снова Snippet'
        );
        return;
      }
      setScope({
        kind: 'snippet',
        original: trimmed,
        working: trimmed,
        languageId: languageIdForSnippet(trimmed),
      });
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setCapturing(false);
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
      onError(errorMessage(e));
    }
  }, [onError, setScope]);

  const attachFolder = useCallback(async () => {
    onError(null);
    try {
      const picked = await pickWorkspaceFolder();
      if (!picked) return;
      const bundle = await loadFolderScope(picked, 12_000);
      setScope({
        kind: 'folder',
        path: bundle.path,
        treeSummary: bundle.treeSummary,
        files: bundle.files.map((f) => ({
          path: f.path,
          content: f.content,
          contentHash: f.contentHash,
          languageId: f.languageId,
        })),
        truncated: bundle.truncated,
      });
    } catch (e) {
      onError(errorMessage(e));
    }
  }, [onError, setScope]);

  const attachWorkspace = useCallback(async () => {
    onError(null);
    try {
      const tree = await workspaceTreeSummary();
      setScope({ kind: 'workspace', treeSummary: tree });
    } catch (e) {
      onError(errorMessage(e));
    }
  }, [onError, setScope]);

  const clearScope = useCallback(() => {
    onChange((prev) => ({ ...prev, scope: { kind: 'none' } }));
    onError(null);
  }, [onChange, onError]);

  const label = scopeLabel(ctx.scope);
  const fileScope =
    ctx.scope.kind === 'file' ||
    ctx.scope.kind === 'folder' ||
    ctx.scope.kind === 'workspace';

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
          onClick={() => {
            onError(null);
            setScope({ kind: 'none' });
          }}
          title="Free chat — model does not see your editor"
        >
          Free
        </ScopeBtn>
        <ScopeBtn
          active={ctx.scope.kind === 'snippet'}
          disabled={disabled || capturing}
          onClick={attachSnippetFromSelection}
          title="Attach code from clipboard (Ctrl+C) or editor selection"
        >
          {capturing ? 'Snippet…' : 'Snippet'}
        </ScopeBtn>
        <ScopeBtn
          active={ctx.scope.kind === 'file'}
          disabled={disabled}
          onClick={attachFile}
          title="Pick a file — contents go into the prompt"
        >
          File
        </ScopeBtn>
        <ScopeBtn
          active={ctx.scope.kind === 'folder'}
          disabled={disabled}
          onClick={attachFolder}
          title="Pick a folder — tree + file bodies (within budget)"
        >
          Folder
        </ScopeBtn>
        <ScopeBtn
          active={ctx.scope.kind === 'workspace'}
          disabled={disabled}
          onClick={attachWorkspace}
          title="Load workspace file tree (needs workspace root in Settings)"
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
              maxWidth: 280,
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
      {ctx.scope.kind === 'none' && (
        <div style={{ fontSize: 10, color: 'var(--fg-dim)', lineHeight: 1.35 }}>
          <strong style={{ color: 'var(--fg)' }}>Free</strong> — модель не видит редактор. Для кода:{' '}
          <strong>Ctrl+C</strong> → <strong>Snippet</strong>. Для файла: <strong>File</strong> → выбрать
          файл.
        </div>
      )}
      {ctx.scope.kind === 'snippet' && (
        <ScopePreview
          title="Snippet прикреплён"
          preview={
            ctx.scope.kind === 'snippet'
              ? ctx.scope.working.split('\n').slice(0, 4).join('\n')
              : ''
          }
        />
      )}
      {ctx.scope.kind === 'file' && (
        <ScopePreview
          title={`Файл в контексте: ${ctx.scope.kind === 'file' ? ctx.scope.path : ''}`}
          preview={
            ctx.scope.kind === 'file'
              ? ctx.scope.content.split('\n').slice(0, 4).join('\n')
              : ''
          }
        />
      )}
      {ctx.scope.kind === 'folder' && (
        <ScopePreview
          title={
            ctx.scope.kind === 'folder'
              ? `Папка: ${ctx.scope.path} · ${ctx.scope.files.length} файлов${
                  ctx.scope.truncated ? ' (не все влезли)' : ''
                }`
              : ''
          }
          preview={
            ctx.scope.kind === 'folder'
              ? ctx.scope.treeSummary.split('\n').slice(0, 5).join('\n')
              : ''
          }
        />
      )}
      {modifiers.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--fg-dim)', marginRight: 2 }}>+</span>
          {modifiers.map((m) => {
            const on = ctx.modifiers.includes(m.id);
            const devLocked = m.id === 'developer' && !fileScope;
            return (
              <button
                key={m.id}
                type="button"
                disabled={disabled || devLocked}
                title={
                  devLocked
                    ? 'Сначала привяжите File, Folder или Workspace'
                    : m.description
                }
                onClick={() =>
                  onChange((prev) => ({
                    ...prev,
                    modifiers: toggleModifier(prev.modifiers, m.id),
                  }))
                }
                style={{
                  fontSize: 10,
                  padding: '2px 7px',
                  borderRadius: 999,
                  border: '.5px solid var(--border-strong)',
                  background: on ? 'var(--accent-tint)' : 'transparent',
                  color: devLocked
                    ? 'var(--fg-dim)'
                    : on
                      ? 'var(--accent)'
                      : 'var(--fg-mute)',
                  cursor: disabled || devLocked ? 'not-allowed' : 'pointer',
                  opacity: devLocked ? 0.55 : 1,
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

function ScopePreview({ title, preview }: { title: string; preview: string }) {
  return (
    <div
      style={{
        fontSize: 10,
        color: 'var(--accent)',
        lineHeight: 1.35,
        padding: '4px 8px',
        borderRadius: 6,
        background: 'var(--accent-tint)',
        border: '.5px solid var(--accent-tint-2)',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{title}</div>
      <pre
        style={{
          margin: 0,
          fontSize: 9.5,
          color: 'var(--fg-mute)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          maxHeight: 56,
          overflow: 'hidden',
        }}
      >
        {preview}
        {preview.includes('\n') ? '\n…' : ''}
      </pre>
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
        opacity: disabled ? 0.7 : 1,
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
