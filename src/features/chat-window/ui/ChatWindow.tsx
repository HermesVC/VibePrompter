import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { I, type IconName } from '@shared/ui';

interface ChatImage {
  mimeType: string;
  dataBase64: string;
  previewUrl: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: ChatImage[];
  streaming?: boolean;
  error?: string;
  meta?: { model: string; latencyMs: number };
}

interface DonePayload {
  text: string;
  model: string;
  latencyMs: number;
}

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
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
    Array<{ id: string; label: string; hasKey: boolean; isDefault: boolean }>
  >([]);
  const [connectionId, setConnectionId] = useState('');
  const [modes, setModes] = useState<ChatModeOption[]>([]);
  const [modeId, setModeId] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bufRef = useRef('');
  const flushPendingRef = useRef(false);
  const assistantIdRef = useRef<string | null>(null);
  const modeConnSyncedRef = useRef(false);

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
    invoke<typeof conns>('list_connections').then(setConns).catch(() => setConns([]));
    loadModes();
    let unlisten: (() => void) | null = null;
    listen('modes_changed', () => loadModes()).then((u) => {
      unlisten = u;
    });
    return () => {
      unlisten?.();
    };
  }, [loadModes]);

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

  const send = useCallback(async () => {
    const text = draft.trim();
    if ((!text && pendingImages.length === 0) || streaming) return;

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
                    streaming: false,
                    meta: { model: e.payload.model, latencyMs: e.payload.latencyMs },
                  }
                : m
            )
          );
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

      await invoke('chat_complete_stream', {
        streamId: sid,
        messages: apiMessages,
        modeId: modeId ?? undefined,
        connectionId: connectionId || undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
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
  ]);

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setAttachError(null);
    const next = [...pendingImages];
    for (const file of Array.from(files)) {
      if (next.length >= MAX_IMAGES) {
        setAttachError(`At most ${MAX_IMAGES} images`);
        break;
      }
      if (!file.type.startsWith('image/')) {
        setAttachError('Only images are supported');
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setAttachError('Each image must be under 4 MB');
        continue;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        const comma = dataUrl.indexOf(',');
        if (comma < 0) continue;
        next.push({
          mimeType: file.type,
          dataBase64: dataUrl.slice(comma + 1),
          previewUrl: dataUrl,
        });
      } catch {
        setAttachError('Could not read image');
      }
    }
    setPendingImages(next);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearChat = () => {
    if (streaming) cancelStream();
    setMessages([]);
    setDraft('');
    setPendingImages([]);
    setAttachError(null);
  };

  const activeMode = modes.find((m) => m.id === modeId) ?? modes[0];
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
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--glass)',
          backdropFilter: 'blur(20px) saturate(160%)',
          WebkitBackdropFilter: 'blur(20px) saturate(160%)',
          border: '1px solid var(--border-strong)',
          borderRadius: 14,
          boxShadow: 'none',
          isolation: 'isolate',
          overflow: 'hidden',
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
          }}
        >
          {messages.length === 0 && (
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
              <span>Ask anything — attach images for vision models.</span>
              <span style={{ fontSize: 11, opacity: 0.8 }}>
                This window stays open until you hide it.
              </span>
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
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
              accept="image/*"
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
              title="Attach image"
              style={iconBtnStyle(streaming)}
            >
              <I.image size={13} />
            </button>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  hide();
                }
              }}
              placeholder="Message… (Enter to send, Shift+Enter for newline)"
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
          {attachError && (
            <div style={{ padding: '0 10px 8px', fontSize: 10.5, color: 'var(--danger)' }}>
              {attachError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message: m }: { message: ChatMessage }) {
  const isUser = m.role === 'user';
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('read failed'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
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
