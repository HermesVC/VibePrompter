import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { I, ContextUsageRing, type IconName } from '@shared/ui';
import {
  applyCompletionContextUpdate,
  effectiveContextLimit,
  estimateTokensFromChars,
  isContextLimitInferred,
  normalizeTokenUsage,
  resolveActiveConnection,
  resolveContextUsed,
  type TokenUsage,
} from '@shared/lib/contextUsage';

import {
  clipboardHasAttachableFiles,
  filesFromClipboardEvent,
  filesFromDataTransfer,
  ingestChatFiles,
  ingestRustDroppedFiles,
  MAX_CHAT_IMAGES,
  type ChatImageAttachment,
} from '@shared/lib/chatAttachments';
import { writeClipboardText, isApplyableScopedEdit } from '@shared/lib/clipboard';
import { errorMessage } from '@shared/lib/utils';
import {
  buildChatContextPayload,
  DEFAULT_CHAT_CONTEXT,
  type ChatContextState,
} from '@shared/lib/chatContext';
import {
  applyWorkspaceWrite,
  getWorkspaceSettings,
  previewWorkspaceWrite,
  saveWorkspaceSettings,
  type PolicyDecision,
} from '@shared/lib/workspaceApi';
import { useChatNativeFileDrop } from '../hooks/useChatNativeFileDrop';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { ChatContextBar } from './ChatContextBar';
import { ApplyConfirmDialog } from './ApplyConfirmDialog';

interface ChatImage extends ChatImageAttachment {}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  scopedText?: string;
  images?: ChatImage[];
  streaming?: boolean;
  error?: string;
  meta?: { model: string; latencyMs: number };
}

interface DonePayload {
  text: string;
  model: string;
  latencyMs: number;
  usage?: TokenUsage;
  contextWindowSize?: number;
  scopedText?: string;
}

/** Persists the chat window's mode choice — independent of tray/global active mode. */
const CHAT_MODE_STORAGE_KEY = 'vp_chat_window_mode_id';

interface ChatModeOption {
  id: string;
  name: string;
  iconName: string;
  provider: string | null;
  enabled?: boolean;
}

/**
 * Persistent chat window — multi-turn LLM conversation that stays open until
 * the user explicitly hides it. No blur-dismiss, no selection capture.
 */
export function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pendingImages, setPendingImages] = useState<ChatImage[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamId, setStreamId] = useState<string | null>(null);
  const [conns, setConns] = useState<
    Array<{
      id: string;
      label: string;
      hasKey: boolean;
      isDefault: boolean;
      contextWindowSize: number;
      baseUrl: string;
    }>
  >([]);
  const [connectionId, setConnectionId] = useState('');
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [modes, setModes] = useState<ChatModeOption[]>([]);
  const [modeId, setModeId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [chatContext, setChatContext] = useState<ChatContextState>(DEFAULT_CHAT_CONTEXT);
  const [applyDialog, setApplyDialog] = useState<{
    title: string;
    path?: string;
    before: string;
    after: string;
    decision: PolicyDecision;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const chatContextRef = useRef(chatContext);
  chatContextRef.current = chatContext;

  const voice = useVoiceInput({
    value: draft,
    onChange: setDraft,
    disabled: streaming,
  });

  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bufRef = useRef('');
  const flushPendingRef = useRef(false);
  const assistantIdRef = useRef<string | null>(null);
  const modeConnSyncedRef = useRef(false);
  const activeConnIdRef = useRef('');

  const scheduleFlush = useCallback((assistantId: string) => {
    if (flushPendingRef.current) return;
    flushPendingRef.current = true;
    requestAnimationFrame(() => {
      flushPendingRef.current = false;
      const text = bufRef.current;
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: text } : m))
      );
    });
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlBg: html.style.background,
      bodyBg: body.style.background,
      bodyOverflow: body.style.overflow,
    };
    html.style.background = 'transparent';
    body.style.background = 'transparent';
    body.style.overflow = 'hidden';
    return () => {
      html.style.background = prev.htmlBg;
      body.style.background = prev.bodyBg;
      body.style.overflow = prev.bodyOverflow;
    };
  }, []);

  const applyLocalMode = useCallback((mode: ChatModeOption) => {
    setModeId(mode.id);
    try {
      localStorage.setItem(CHAT_MODE_STORAGE_KEY, mode.id);
    } catch {
      /* best-effort */
    }
    if (mode.provider) {
      setConnectionId(mode.provider);
    }
  }, []);

  const loadModes = useCallback(() => {
    invoke<ChatModeOption[]>('list_modes')
      .then((all) => {
        const enabled = all.filter((m) => m.enabled !== false);
        setModes(enabled);
        setModeId((current) => {
          if (current && enabled.some((m) => m.id === current)) {
            return current;
          }
          let stored: string | null = null;
          try {
            stored = localStorage.getItem(CHAT_MODE_STORAGE_KEY);
          } catch {
            /* ignore */
          }
          const pick =
            (stored ? enabled.find((m) => m.id === stored) : undefined) ?? enabled[0];
          return pick?.id ?? current;
        });
      })
      .catch(() => setModes([]));
  }, []);

  useEffect(() => {
    const loadConns = () => {
      invoke<typeof conns>('list_connections').then(setConns).catch(() => setConns([]));
    };
    loadConns();
    loadModes();
    let unlistenModes: (() => void) | null = null;
    let unlistenSettings: (() => void) | null = null;
    listen('modes_changed', () => loadModes()).then((u) => {
      unlistenModes = u;
    });
    listen('settings_changed', () => loadConns()).then((u) => {
      unlistenSettings = u;
    });
    return () => {
      unlistenModes?.();
      unlistenSettings?.();
    };
  }, [loadModes]);

  useEffect(() => {
    setTokenUsage(null);
  }, [connectionId]);

  // On first load, apply the pinned connection from the restored local mode.
  useEffect(() => {
    if (!modeId || !modes.length || modeConnSyncedRef.current) return;
    modeConnSyncedRef.current = true;
    const mode = modes.find((m) => m.id === modeId);
    if (mode?.provider) {
      setConnectionId(mode.provider);
    }
  }, [modeId, modes]);

  useEffect(() => {
    const applySettings = (s: { theme?: string; accent?: string }) => {
      const html = document.documentElement;
      if (s.theme === 'light' || s.theme === 'dark') {
        html.setAttribute('data-theme', s.theme);
      } else if (s.theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        html.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      }
      if (s.accent) html.setAttribute('data-accent', s.accent);
    };
    const reload = () =>
      invoke<{ theme?: string; accent?: string }>('get_settings')
        .then(applySettings)
        .catch(() => {});
    reload();
    let unlisten: (() => void) | null = null;
    listen('settings_changed', () => reload()).then((u) => {
      unlisten = u;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const hide = useCallback(() => {
    invoke<void>('chat_hide').catch(() => {
      getCurrentWindow().hide().catch(() => {});
    });
  }, []);

  const cancelStream = useCallback(() => {
    if (!streamId) return;
    invoke('cancel_stream', { streamId }).catch(() => {});
  }, [streamId]);

  const processScopedCompletion = useCallback((_payload: { scopedText?: string; text: string }) => {
    // Working snippet/file content updates only on explicit Apply — not on every reply.
  }, []);

  const promptApplyScoped = useCallback(async (assistantText: string, scopedText?: string) => {
    const scope = chatContextRef.current.scope;
    const content = (scopedText ?? assistantText).trim();
    if (!content) return;

    if (scope.kind === 'snippet') {
      setApplyDialog({
        title: 'Apply snippet',
        before: scope.working,
        after: content,
        decision: 'ask',
        onConfirm: async () => {
          await writeClipboardText(content);
          setChatContext((prev) =>
            prev.scope.kind === 'snippet'
              ? { ...prev, scope: { ...prev.scope, working: content } }
              : prev
          );
        },
      });
      return;
    }

    if (scope.kind !== 'file') return;

    try {
      const preview = await previewWorkspaceWrite(scope.path, content, scope.contentHash);
      const settings = await getWorkspaceSettings();
      const autoApply =
        preview.decision === 'allow' && settings.applyPolicy === 'always_apply';

      const doWrite = async () => {
        const result = await applyWorkspaceWrite(scope.path, content, scope.contentHash, true);
        setChatContext((prev) =>
          prev.scope.kind === 'file'
            ? { ...prev, scope: { ...prev.scope, content, contentHash: result.contentHash } }
            : prev
        );
      };

      if (autoApply) {
        await doWrite();
        return;
      }

      setApplyDialog({
        title: 'Apply to file',
        path: scope.path,
        before: scope.content,
        after: content,
        decision: preview.decision,
        onConfirm: doWrite,
      });
    } catch (e) {
      setAttachError(errorMessage(e));
    }
  }, []);

  const send = useCallback(async () => {
    const text = draft.trim();
    if ((!text && pendingImages.length === 0) || streaming) return;

    if (voice.isListening) voice.stop();

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      images: pendingImages.length ? [...pendingImages] : undefined,
    };
    const assistantId = crypto.randomUUID();
    assistantIdRef.current = assistantId;
    const sid = crypto.randomUUID();
    setStreamId(sid);
    bufRef.current = '';

    const apiMessages = [...messages, userMsg]
      .filter((m) => !m.streaming && !m.error)
      .map((m) => ({
        role: m.role,
        content: m.content,
        images: (m.images ?? []).map(({ mimeType, dataBase64 }) => ({
          mimeType,
          dataBase64,
        })),
      }));

    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '', streaming: true },
    ]);
    setDraft('');
    setPendingImages([]);
    setAttachError(null);
    setStreaming(true);

    const tokenEvent = `chat:${sid}:token`;
    const doneEvent = `chat:${sid}:done`;
    const errEvent = `chat:${sid}:error`;

    const unlistens: Array<() => void> = [];
    try {
      const listeners = await Promise.all([
        listen<string>(tokenEvent, (e) => {
          if (assistantIdRef.current !== assistantId) return;
          bufRef.current += e.payload;
          scheduleFlush(assistantId);
        }),
        listen<DonePayload>(doneEvent, (e) => {
          if (assistantIdRef.current !== assistantId) return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: e.payload.text,
                    scopedText: e.payload.scopedText,
                    streaming: false,
                    meta: { model: e.payload.model, latencyMs: e.payload.latencyMs },
                  }
                : m
            )
          );
          const usage = normalizeTokenUsage(e.payload.usage);
          if (usage) setTokenUsage(usage);
          if (e.payload.contextWindowSize) {
            setConns((prev) =>
              applyCompletionContextUpdate(
                prev,
                activeConnIdRef.current,
                e.payload.contextWindowSize
              )
            );
          }
          processScopedCompletion(e.payload);
        }),
        listen<string>(errEvent, (e) => {
          if (assistantIdRef.current !== assistantId) return;
          const cancelled = e.payload === 'cancelled';
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: cancelled ? bufRef.current : '',
                    streaming: false,
                    error: cancelled ? 'Cancelled' : e.payload,
                  }
                : m
            )
          );
        }),
      ]);
      unlistens.push(...listeners);

      const result = await invoke<DonePayload>('chat_complete_stream', {
        streamId: sid,
        messages: apiMessages,
        modeId: modeId ?? undefined,
        connectionId: connectionId || undefined,
        chatContext: buildChatContextPayload(chatContextRef.current),
      });

      // Authoritative completion payload — the event listener can race with
      // cleanup in `finally` when Tauri delivers `done` after invoke resolves.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: result.text,
                scopedText: result.scopedText,
                streaming: false,
                meta: { model: result.model, latencyMs: result.latencyMs },
              }
            : m
        )
      );
      const usage = normalizeTokenUsage(result.usage);
      if (usage) setTokenUsage(usage);
      if (result.contextWindowSize) {
        setConns((prev) =>
          applyCompletionContextUpdate(
            prev,
            activeConnIdRef.current,
            result.contextWindowSize
          )
        );
      }
      processScopedCompletion(result);
    } catch (e) {
      const msg = errorMessage(e);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, streaming: false, error: msg } : m
        )
      );
    } finally {
      unlistens.forEach((u) => u());
      setStreaming(false);
      setStreamId(null);
      assistantIdRef.current = null;
    }
  }, [
    draft,
    pendingImages,
    streaming,
    messages,
    modeId,
    connectionId,
    scheduleFlush,
    voice,
    processScopedCompletion,
  ]);

  const applyIngestResult = useCallback(
    (result: ReturnType<typeof ingestRustDroppedFiles>) => {
      if (streaming) return;
      setAttachError(null);
      const { images, draftAppend, error } = result;
      if (images.length) {
        setPendingImages((prev) => [...prev, ...images].slice(0, MAX_CHAT_IMAGES));
      }
      if (draftAppend) {
        setDraft((prev) => (prev.trim() ? `${prev.trim()}\n\n${draftAppend}` : draftAppend));
      }
      if (error) setAttachError(error);
    },
    [streaming]
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!files.length || streaming) return;
      setAttachError(null);
      const { images, draftAppend, error } = await ingestChatFiles(files, pendingImages.length);
      applyIngestResult({ images, draftAppend, error });
    },
    [applyIngestResult, pendingImages.length, streaming]
  );

  useChatNativeFileDrop({
    streaming,
    pendingImageCount: pendingImages.length,
    onDragOverChange: setDragOver,
    onIngest: applyIngestResult,
  });

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    await addFiles(Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (streaming || !clipboardHasAttachableFiles(e.nativeEvent)) return;
    const files = filesFromClipboardEvent(e.nativeEvent);
    if (!files.length) return;
    e.preventDefault();
    void addFiles(files);
  };

  const onDragOver = (e: React.DragEvent) => {
    if (streaming || isTauri()) return;
    const types = Array.from(e.dataTransfer.types);
    const hasFiles = types.some(
      (t) => t === 'Files' || t === 'application/x-moz-file'
    );
    if (!hasFiles) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };

  const onDragEnter = (e: React.DragEvent) => {
    if (streaming || isTauri()) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    if (streaming || isTauri()) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = filesFromDataTransfer(e.dataTransfer);
    if (files.length) void addFiles(files);
  };

  const clearChat = () => {
    if (streaming) cancelStream();
    voice.stop();
    setMessages([]);
    setDraft('');
    setPendingImages([]);
    setAttachError(null);
    setTokenUsage(null);
    setChatContext(DEFAULT_CHAT_CONTEXT);
  };

  const activeMode = modes.find((m) => m.id === modeId) ?? modes[0];
  const effectiveConnectionId = connectionId || activeMode?.provider || '';
  const activeConn = useMemo(
    () => resolveActiveConnection(conns, effectiveConnectionId),
    [conns, effectiveConnectionId]
  );
  activeConnIdRef.current = connectionId || activeConn?.id || '';
  const contextLimit = effectiveContextLimit(activeConn);
  const contextLimitInferred = isContextLimitInferred(activeConn);
  const contextEstimate = useMemo(() => {
    let chars = 0;
    let images = 0;
    for (const m of messages) {
      if (m.error) continue;
      chars += m.content.length;
      images += m.images?.length ?? 0;
    }
    return estimateTokensFromChars(chars, images);
  }, [messages]);
  const contextUsed = resolveContextUsed(tokenUsage, contextEstimate);
  const contextEstimated = !(tokenUsage && tokenUsage.inputTokens > 0);

  const iconKey = (activeMode?.iconName ?? 'mail') as IconName;
  const ModeIcon =
    (I as Record<string, React.ComponentType<{ size?: number }>>)[iconKey] ?? I.mail;

  return (
    <div
      className="ph-root"
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        background: 'transparent',
      }}
    >
      <div
        className="ph-anim-pop-in"
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--glass)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          border: dragOver
            ? '1px solid var(--accent)'
            : '1px solid var(--border-strong)',
          borderRadius: 14,
          boxShadow: dragOver ? '0 0 0 2px var(--accent-tint)' : 'none',
          isolation: 'isolate',
          overflow: 'hidden',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        }}
      >
        <WindowResizeHandles />
        {/* Header — drag via empty strip + startDragging; controls opt out */}
        <div
          onPointerDown={beginWindowDrag}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            borderBottom: '.5px solid var(--divider)',
            cursor: 'grab',
          }}
        >
          <div
            data-tauri-drag-region
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flex: 1,
              minWidth: 0,
              minHeight: 36,
            }}
          >
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                background: 'var(--accent-tint)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '.5px solid var(--accent-tint-2)',
                pointerEvents: 'none',
                flexShrink: 0,
              }}
            >
              <ModeIcon size={14} />
            </span>
            <div
              data-tauri-drag-region
              style={{ flex: 1, alignSelf: 'stretch', minWidth: 32 }}
            />
          </div>
          <div style={{ minWidth: 0, flexShrink: 0 }} data-no-drag>
            {modes.length > 0 ? (
              <select
                value={modeId ?? ''}
                onChange={(e) => {
                  const next = modes.find((m) => m.id === e.target.value);
                  if (next) applyLocalMode(next);
                }}
                disabled={streaming}
                title="Chat mode (local to this window)"
                style={{
                  display: 'block',
                  width: '100%',
                  maxWidth: 200,
                  padding: 0,
                  margin: 0,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: 'var(--fg-strong)',
                  fontSize: 12.5,
                  fontWeight: 600,
                  fontFamily: 'var(--sans)',
                  cursor: streaming ? 'not-allowed' : 'pointer',
                  opacity: streaming ? 0.6 : 1,
                }}
              >
                {modes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: 12.5, color: 'var(--fg-strong)', fontWeight: 600 }}>
                Chat
              </div>
            )}
            <div style={{ fontSize: 10.5, color: 'var(--fg-dim)', pointerEvents: 'none' }}>
              {streaming ? 'Thinking…' : 'Local mode · stays open'}
            </div>
          </div>
          <ContextUsageRing
            usedTokens={contextUsed}
            contextWindowSize={contextLimit}
            usage={tokenUsage}
            estimated={contextEstimated}
            limitInferred={contextLimitInferred}
            streaming={streaming}
          />
          {conns.filter((c) => c.hasKey).length > 1 && (
            <select
              data-no-drag
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              disabled={streaming}
              className="text-[10.5px] rounded px-1.5 py-0.5 outline-none"
              style={{
                background: 'var(--surface-2)',
                border: '.5px solid var(--border)',
                color: 'var(--fg-mute)',
                cursor: streaming ? 'not-allowed' : 'pointer',
                maxWidth: 120,
              }}
              title="Connection / model"
            >
              <option value="">{connectionId ? 'Switch…' : 'Default'}</option>
              {conns
                .filter((c) => c.hasKey)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
            </select>
          )}
          <button
            type="button"
            data-no-drag
            onPointerDown={(e) => {
              e.preventDefault();
              clearChat();
            }}
            title="New chat"
            style={iconBtnStyle()}
          >
            <I.plus size={12} />
          </button>
          <button
            type="button"
            data-no-drag
            onPointerDown={(e) => {
              e.preventDefault();
              hide();
            }}
            title="Hide (Ctrl+Alt+C)"
            style={iconBtnStyle()}
          >
            <I.close size={12} />
          </button>
        </div>

        <ChatContextBar
          ctx={chatContext}
          disabled={streaming}
          onChange={setChatContext}
          onError={setAttachError}
        />

        {/* Messages */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            position: 'relative',
          }}
        >
          {dragOver && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 5,
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                background: 'color-mix(in srgb, var(--accent) 10%, var(--glass))',
                borderRadius: 8,
                color: 'var(--accent)',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <I.image size={28} style={{ opacity: 0.85 }} />
              <span>Drop images or text files</span>
            </div>
          )}
          {messages.length === 0 && !dragOver && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                color: 'var(--fg-dim)',
                fontSize: 12.5,
                textAlign: 'center',
                padding: '0 20px',
              }}
            >
              <I.sparkles size={22} style={{ color: 'var(--accent)', opacity: 0.7 }} />
              <span>Ask anything — drop files, paste images, or attach below.</span>
              <span style={{ fontSize: 11, opacity: 0.8 }}>
                This window stays open until you hide it.
              </span>
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              scopeKind={chatContext.scope.kind}
              scopeWorking={
                chatContext.scope.kind === 'snippet'
                  ? chatContext.scope.working
                  : chatContext.scope.kind === 'file'
                    ? chatContext.scope.content
                    : undefined
              }
              onApply={
                m.role === 'assistant' && !m.streaming && !m.error && m.content
                  ? () => void promptApplyScoped(m.content, m.scopedText)
                  : undefined
              }
            />
          ))}
        </div>

        {/* Composer */}
        <div
          style={{
            borderTop: '.5px solid var(--divider)',
            background: 'var(--surface)',
          }}
        >
          {pendingImages.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: 6,
                padding: '8px 10px 0',
                flexWrap: 'wrap',
              }}
            >
              {pendingImages.map((img, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img
                    src={img.previewUrl}
                    alt=""
                    style={{
                      width: 44,
                      height: 44,
                      objectFit: 'cover',
                      borderRadius: 6,
                      border: '.5px solid var(--border)',
                    }}
                  />
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      setPendingImages((prev) => prev.filter((_, j) => j !== i));
                    }}
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      width: 16,
                      height: 16,
                      borderRadius: 999,
                      border: '.5px solid var(--border-strong)',
                      background: 'var(--surface)',
                      color: 'var(--fg)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <I.close size={8} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, padding: '8px 10px' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.txt,.md,.json,.csv,.xml,.yaml,.yml,text/plain,application/json"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                void onPickFiles(e.target.files);
              }}
            />
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                fileInputRef.current?.click();
              }}
              disabled={streaming}
              title="Attach image or text file"
              style={iconBtnStyle(streaming)}
            >
              <I.image size={13} />
            </button>
            {voice.isSupported && (
              <button
                type="button"
                data-no-drag
                onPointerDown={(e) => {
                  e.preventDefault();
                  voice.toggle();
                }}
                disabled={streaming}
                title={
                  voice.isListening
                    ? 'Stop voice input'
                    : 'Voice input (browser speech recognition · needs mic)'
                }
                style={{
                  ...iconBtnStyle(streaming),
                  ...(voice.isListening
                    ? {
                        background: 'var(--accent-tint)',
                        borderColor: 'var(--accent-tint-2)',
                        color: 'var(--accent)',
                        boxShadow: '0 0 0 2px var(--accent-tint)',
                      }
                    : {}),
                }}
              >
                {voice.isListening ? (
                  <I.micOff size={13} className="ph-pulse" />
                ) : (
                  <I.mic size={13} />
                )}
              </button>
            )}
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (voice.isListening) voice.stop();
                  void send();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  if (voice.isListening) voice.stop();
                  else hide();
                }
              }}
              placeholder={
                voice.isListening
                  ? 'Listening… speak now'
                  : 'Message… (Enter send · mic · Ctrl+V files)'
              }
              rows={1}
              style={{
                flex: 1,
                minHeight: 36,
                maxHeight: 120,
                resize: 'none',
                background: 'var(--bg-2)',
                border: '.5px solid var(--border)',
                borderRadius: 8,
                padding: '8px 10px',
                color: 'var(--fg)',
                fontSize: 12.5,
                fontFamily: 'var(--sans)',
                lineHeight: 1.45,
                outline: 'none',
              }}
            />
            {streaming ? (
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  cancelStream();
                }}
                title="Stop"
                style={sendBtnStyle(true)}
              >
                <I.close size={12} />
              </button>
            ) : (
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  void send();
                }}
                disabled={!draft.trim() && pendingImages.length === 0}
                title="Send"
                style={sendBtnStyle(!draft.trim() && pendingImages.length === 0)}
              >
                <I.arrowR size={12} />
              </button>
            )}
          </div>
          {(attachError || voice.error) && (
            <div style={{ padding: '0 10px 8px', fontSize: 10.5, color: 'var(--danger)' }}>
              {attachError || voice.error}
            </div>
          )}
        </div>
      </div>
      <ApplyConfirmDialog
        open={applyDialog !== null}
        title={applyDialog?.title ?? ''}
        path={applyDialog?.path}
        before={applyDialog?.before ?? ''}
        after={applyDialog?.after ?? ''}
        decision={applyDialog?.decision ?? 'ask'}
        onCancel={() => setApplyDialog(null)}
        onConfirm={async (remember) => {
          if (!applyDialog) return;
          await applyDialog.onConfirm();
          if (remember && applyDialog.path) {
            const s = await getWorkspaceSettings();
            if (!s.allowPaths.includes(applyDialog.path)) {
              await saveWorkspaceSettings({
                ...s,
                allowPaths: [...s.allowPaths, applyDialog.path],
              });
            }
          }
        }}
      />
    </div>
  );
}

function MessageBubble({
  message: m,
  scopeKind,
  scopeWorking,
  onApply,
}: {
  message: ChatMessage;
  scopeKind?: string;
  scopeWorking?: string;
  onApply?: () => void;
}) {
  const isUser = m.role === 'user';
  const applyCandidate = (m.scopedText ?? m.content).trim();
  const showApply =
    onApply &&
    (scopeKind === 'snippet' || scopeKind === 'file') &&
    !m.streaming &&
    scopeWorking !== undefined &&
    isApplyableScopedEdit(scopeWorking, applyCandidate);
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '88%',
          padding: '8px 11px',
          borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
          background: isUser ? 'var(--accent-tint)' : 'var(--surface-2)',
          border: `.5px solid ${isUser ? 'var(--accent-tint-2)' : 'var(--border)'}`,
          color: 'var(--fg-strong)',
          fontSize: 13,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {m.images && m.images.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: m.content ? 8 : 0 }}>
            {m.images.map((img, i) => (
              <img
                key={i}
                src={img.previewUrl}
                alt=""
                style={{
                  maxWidth: 120,
                  maxHeight: 120,
                  borderRadius: 6,
                  border: '.5px solid var(--border)',
                }}
              />
            ))}
          </div>
        )}
        {m.content}
        {m.streaming && (
          <span
            className="ph-caret"
            style={{
              display: 'inline-block',
              width: 6,
              height: 14,
              marginLeft: 2,
              background: 'var(--accent)',
              verticalAlign: 'text-bottom',
            }}
          />
        )}
        {m.error && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--danger)' }}>{m.error}</div>
        )}
        {m.meta && !m.streaming && (
          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--fg-dim)' }}>
            {m.meta.model} · {m.meta.latencyMs}ms
          </div>
        )}
        {showApply && (
          <button
            type="button"
            onClick={onApply}
            style={{
              marginTop: 8,
              fontSize: 10.5,
              padding: '4px 8px',
              borderRadius: 6,
              border: '.5px solid var(--border-strong)',
              background: 'var(--surface)',
              color: 'var(--accent)',
              cursor: 'pointer',
            }}
          >
            {scopeKind === 'file' ? 'Apply to file…' : 'Apply snippet…'}
          </button>
        )}
      </div>
    </div>
  );
}

function iconBtnStyle(disabled = false): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    borderRadius: 6,
    background: 'transparent',
    border: '.5px solid var(--border)',
    color: disabled ? 'var(--fg-dim)' : 'var(--fg-mute)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    flexShrink: 0,
  };
}

function sendBtnStyle(disabled = false): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 8,
    background: disabled ? 'var(--surface-2)' : 'var(--accent)',
    color: disabled ? 'var(--fg-dim)' : '#fff',
    border: '.5px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    flexShrink: 0,
  };
}

type ResizeDirection =
  | 'East'
  | 'North'
  | 'NorthEast'
  | 'NorthWest'
  | 'South'
  | 'SouthEast'
  | 'SouthWest'
  | 'West';

function isInteractiveDragTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('select, button, input, textarea, a, [data-no-drag]'));
}

function beginWindowDrag(e: React.PointerEvent) {
  if (isInteractiveDragTarget(e.target)) return;
  e.preventDefault();
  getCurrentWindow().startDragging().catch(() => {});
}

function beginWindowResize(direction: ResizeDirection) {
  return (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    getCurrentWindow().startResizeDragging(direction).catch(() => {});
  };
}

/** Invisible edge/corner hit targets — borderless windows need these on Windows. */
function WindowResizeHandles() {
  const edge = (
    direction: ResizeDirection,
    style: React.CSSProperties,
    cursor: string
  ) => (
    <div
      key={direction}
      onPointerDown={beginWindowResize(direction)}
      style={{
        position: 'absolute',
        zIndex: 30,
        cursor,
        touchAction: 'none',
        ...style,
      }}
    />
  );

  return (
    <>
      {edge('North', { top: 0, left: 8, right: 8, height: 6 }, 'ns-resize')}
      {edge('South', { bottom: 0, left: 8, right: 8, height: 6 }, 'ns-resize')}
      {edge('West', { left: 0, top: 8, bottom: 8, width: 6 }, 'ew-resize')}
      {edge('East', { right: 0, top: 8, bottom: 8, width: 6 }, 'ew-resize')}
      {edge('NorthWest', { top: 0, left: 0, width: 10, height: 10 }, 'nwse-resize')}
      {edge('NorthEast', { top: 0, right: 0, width: 10, height: 10 }, 'nesw-resize')}
      {edge('SouthWest', { bottom: 0, left: 0, width: 10, height: 10 }, 'nesw-resize')}
      <div
        onPointerDown={beginWindowResize('SouthEast')}
        title="Resize"
        style={{
          position: 'absolute',
          right: 3,
          bottom: 3,
          width: 14,
          height: 14,
          zIndex: 31,
          cursor: 'nwse-resize',
          touchAction: 'none',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'flex-end',
          color: 'var(--fg-dim)',
          opacity: 0.55,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
          <path d="M9 1v8H1V6h3V1h5Z" />
        </svg>
      </div>
    </>
  );
}
