import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { I, ContextUsageRing, type IconName } from '@shared/ui';
import {
  applyCompletionContextUpdate,
  effectiveContextLimit,
  estimateTokensFromChars,
  estimateChatRequestTokens,
  isContextLimitInferred,
  normalizeTokenUsage,
  resolveActiveConnection,
  resolveContextUsed,
  type TokenUsage,
} from '@shared/lib/contextUsage';
import {
  clearChatSession,
  createChatSessionId,
  loadChatSession,
  saveChatSession,
  type PersistedChatMessage,
} from '@shared/lib/chatSessionStorage';
import {
  stripVpSummaryForDisplay,
  trimSummaryToBudget,
} from '@shared/lib/chatSessionSummary';
import { indexContextArtifacts, indexPlanCanonical, indexPlanStepSummary } from '@shared/lib/chatMemoryApi';
import {
  parseGeneratedFileBlocks,
  extractContextArtifacts,
  resolveGeneratedApplyPath,
  stripGeneratedFileBlocks,
  type GeneratedFileBlock,
} from '@shared/lib/generatedFiles';
import { extractPlanStepSummary } from '@shared/lib/planMemory';

import {
  clipboardHasAttachableFiles,
  filesFromClipboardEvent,
  filesFromDataTransfer,
  ingestChatFiles,
  ingestRustDroppedFiles,
  MAX_CHAT_IMAGES,
  type ChatImageAttachment,
} from '@shared/lib/chatAttachments';
import { writeClipboardText, isApplyableScopedEdit, extractScopedCodeForApply } from '@shared/lib/clipboard';
import { errorMessage } from '@shared/lib/utils';
import {
  buildChatContextPayload,
  DEFAULT_CHAT_CONTEXT,
  formatScopeUserContext,
  splitUserMessageScope,
  type ChatContextState,
} from '@shared/lib/chatContext';
import {
  applyWorkspaceWrite,
  getWorkspaceSettings,
  loadFolderScope,
  previewWorkspaceWrite,
  readWorkspaceFile,
  saveWorkspaceSettings,
  type PolicyDecision,
} from '@shared/lib/workspaceApi';
import { useChatNativeFileDrop } from '../hooks/useChatNativeFileDrop';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { ChatContextBar } from './ChatContextBar';
import { ApplyConfirmDialog } from './ApplyConfirmDialog';
import { BatchApplyConfirmDialog, type BatchApplyItem } from './BatchApplyConfirmDialog';
import { AutonomousPlanStrip } from './AutonomousPlanStrip';
import { useAutonomousChatRun } from '../hooks/useAutonomousChatRun';

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
  sessionSummary?: string;
  memoryCompressed?: boolean;
  evictedTurns?: number;
  contextRecovered?: boolean;
  outputTruncated?: boolean;
  finishReason?: string;
  retrievedMemory?: string;
  vectorChunksUsed?: number;
  vectorMemoryCompressed?: boolean;
}

interface StatusPayload {
  phase: 'recovering' | 'continuing' | 'compressing_memory' | 'tools' | 'provider_retry';
  generation?: number;
  attempt?: number;
  kind?: 'rolling' | 'vector';
  message?: string;
}

interface TokenPayload {
  generation?: number;
  delta?: string;
}

interface MemoryPayload {
  sessionSummary?: string;
  contextWindowSize?: number;
}

function parseTokenDelta(payload: string | TokenPayload): { generation: number; delta: string } {
  if (typeof payload === 'string') {
    return { generation: 0, delta: payload };
  }
  return {
    generation: payload.generation ?? 0,
    delta: payload.delta ?? '',
  };
}

/** Persists the chat window's mode choice — independent of tray/global active mode. */
const CHAT_MODE_STORAGE_KEY = 'vp_chat_window_mode_id';

function readInitialChatSession() {
  return loadChatSession();
}

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
  const initialSession = useMemo(() => readInitialChatSession(), []);
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => (initialSession?.messages as ChatMessage[]) ?? []
  );
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
  const [connectionId, setConnectionId] = useState(initialSession?.connectionId ?? '');
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [modes, setModes] = useState<ChatModeOption[]>([]);
  const [modeId, setModeId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [chatContext, setChatContext] = useState<ChatContextState>(
    () => initialSession?.chatContext ?? DEFAULT_CHAT_CONTEXT
  );
  const [contextTrimNotice, setContextTrimNotice] = useState<string | null>(null);
  const [contextNoticeKind, setContextNoticeKind] = useState<'info' | 'warn'>('info');
  const [isRecoveringContext, setIsRecoveringContext] = useState(false);
  const [isContinuingOutput, setIsContinuingOutput] = useState(false);
  const [providerRetryWarning, setProviderRetryWarning] = useState<string | null>(null);
  const [sessionSummary, setSessionSummary] = useState(
    () => initialSession?.sessionSummary ?? ''
  );
  const [sessionId, setSessionId] = useState(
    () => initialSession?.sessionId ?? createChatSessionId()
  );
  const [retrievedMemory, setRetrievedMemory] = useState<string | null>(null);
  const [memoryDebugLabel, setMemoryDebugLabel] = useState('Vector memory: idle');
  const [applyDialog, setApplyDialog] = useState<{
    title: string;
    path?: string;
    before: string;
    after: string;
    decision: PolicyDecision;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [batchApplyDialog, setBatchApplyDialog] = useState<{
    items: BatchApplyItem[];
    onConfirm: () => Promise<void>;
  } | null>(null);
  const chatContextRef = useRef(chatContext);
  chatContextRef.current = chatContext;
  const sessionSummaryRef = useRef(sessionSummary);
  sessionSummaryRef.current = sessionSummary;
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  // Scope tabs only attach context — they do not override the user's chosen chat mode.
  // (snippet-editor / file-assistant modes force code-only output and break Q&A.)

  const voice = useVoiceInput({
    value: draft,
    onChange: setDraft,
    disabled: streaming,
  });

  const {
    autonomousMode,
    setAutonomousMode,
    plan: autonomousPlan,
    phase: autonomousPhase,
    phaseDetail: autonomousPhaseDetail,
    sendAutonomous,
    syncPlanFromStream,
    clearAutonomousUi,
  } = useAutonomousChatRun();

  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bufRef = useRef('');
  const flushPendingRef = useRef(false);
  const assistantIdRef = useRef<string | null>(null);
  const streamGenerationRef = useRef(0);
  const cancelledRef = useRef(false);
  const modeConnSyncedRef = useRef(false);
  const activeConnIdRef = useRef('');

  useEffect(() => {
    const persistable: PersistedChatMessage[] = messages
      .filter((m) => !m.streaming && !m.error)
      .map(({ id, role, content, scopedText, meta }) => ({
        id,
        role,
        content,
        scopedText,
        meta,
      }));
    const t = window.setTimeout(() => {
      saveChatSession({
        sessionId,
        messages: persistable,
        chatContext,
        connectionId,
        sessionSummary: sessionSummary.trim() || undefined,
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [messages, chatContext, connectionId, sessionSummary, sessionId]);

  const scheduleFlush = useCallback((assistantId: string) => {
    if (flushPendingRef.current) return;
    flushPendingRef.current = true;
    requestAnimationFrame(() => {
      flushPendingRef.current = false;
      const text = stripVpSummaryForDisplay(bufRef.current);
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

  const applySessionSummaryFromPayload = useCallback(
    (summary: string | undefined, contextLimit: number) => {
      if (!summary?.trim()) return;
      setSessionSummary(trimSummaryToBudget(summary, contextLimit));
    },
    []
  );

  const applyRetrievedMemoryFromPayload = useCallback((preview: string | undefined) => {
    const trimmed = preview?.trim();
    setRetrievedMemory(trimmed || null);
  }, []);

  const applyMemoryDebugFromPayload = useCallback(
    (
      payload: Pick<
        DonePayload,
        'vectorChunksUsed' | 'memoryCompressed' | 'evictedTurns' | 'vectorMemoryCompressed'
      >
    ) => {
      const parts: string[] = [];
      if (payload.vectorChunksUsed && payload.vectorChunksUsed > 0) {
        parts.push(`vector used: ${payload.vectorChunksUsed}/4 retrieved`);
      } else {
        parts.push('vector unused: no relevant chunks');
      }
      if (payload.memoryCompressed) {
        const suffix = payload.evictedTurns ? ` (${payload.evictedTurns} turns)` : '';
        parts.push(`rolling compressed${suffix}`);
      }
      if (payload.vectorMemoryCompressed) {
        parts.push('vector compressed');
      }
      setMemoryDebugLabel(parts.join(' · '));
    },
    []
  );

  const applyContextNotice = useCallback(
    (
      payload: Pick<
        DonePayload,
        | 'memoryCompressed'
        | 'evictedTurns'
        | 'contextRecovered'
        | 'outputTruncated'
        | 'vectorChunksUsed'
      >,
      contextLimit: number
    ) => {
      setIsRecoveringContext(false);
      const parts: string[] = [];
      if (payload.outputTruncated) {
        parts.push(
          'Ответ обрезан лимитом вывода (max_tokens) — в окне контекста место ещё есть, но модель упёрлась в cap ответа'
        );
      }
      if (payload.contextRecovered) {
        parts.push('Контекст автоматически подстроен под лимит модели');
      }
      if (payload.memoryCompressed && payload.evictedTurns) {
        parts.push(`${payload.evictedTurns} старых сообщений сохранены в память диалога`);
      }
      if (payload.vectorChunksUsed && payload.vectorChunksUsed > 0) {
        parts.push(
          `подтянуто ${payload.vectorChunksUsed} фрагм. из семантической памяти сессии`
        );
      }
      if (!parts.length) {
        setContextTrimNotice(null);
        setIsContinuingOutput(false);
        return;
      }
      const limitHint =
        contextLimit > 0 && !payload.contextRecovered && !payload.outputTruncated
          ? ` (лимит ${formatContextLimit(contextLimit)})`
          : '';
      setContextTrimNotice(`${parts.join('. ')}${limitHint}. В чате история целиком.`);
      setContextNoticeKind(
        payload.outputTruncated ? 'warn' : payload.contextRecovered ? 'info' : 'warn'
      );
    },
    []
  );

  const refreshFolderScope = useCallback(async () => {
    const scope = chatContextRef.current.scope;
    if (scope.kind !== 'folder') return;
    try {
      const bundle = await loadFolderScope(scope.path, 12_000);
      setChatContext((prev) =>
        prev.scope.kind === 'folder'
          ? {
              ...prev,
              scope: {
                kind: 'folder',
                path: bundle.path,
                treeSummary: bundle.treeSummary,
                outlineSummary: bundle.outlineSummary,
                files: bundle.files.map((f) => ({
                  path: f.path,
                  content: f.content,
                  contentHash: f.contentHash,
                  languageId: f.languageId,
                })),
                truncated: bundle.truncated,
              },
            }
          : prev
      );
    } catch {
      /* best-effort — scope bar may stay stale until manual re-attach */
    }
  }, []);

  const processScopedCompletion = useCallback(
    (payload: { scopedText?: string; text: string }) => {
      const planSummary = extractPlanStepSummary(payload.text);
      if (planSummary) {
        void indexPlanStepSummary(sessionIdRef.current, planSummary, {
          connectionId: connectionId || undefined,
          modeId: modeId ?? undefined,
        }).catch(() => {});
      }
      const artifacts = extractContextArtifacts(
        payload.text,
        chatContextRef.current.scope
      );
      if (artifacts.length) {
        void indexContextArtifacts(sessionIdRef.current, artifacts, {
          connectionId: connectionId || undefined,
          modeId: modeId ?? undefined,
        }).catch(() => {});
      }
      if (
        chatContextRef.current.scope.kind === 'folder' &&
        (payload.text.includes('[Tool result:') ||
          payload.text.includes('Created ') ||
          artifacts.length > 0)
      ) {
        void refreshFolderScope();
      }
    },
    [connectionId, modeId, refreshFolderScope]
  );

  const rememberAppliedContextArtifacts = useCallback(
    (applied: Array<{ path: string; content: string }>) => {
      const artifacts = applied
        .filter((f) => f.content.trim())
        .map((f) => ({ path: f.path, content: f.content.trim() }));
      if (!artifacts.length) return;
      void indexContextArtifacts(sessionIdRef.current, artifacts, {
        connectionId: connectionId || undefined,
        modeId: modeId ?? undefined,
      }).catch(() => {});
      for (const artifact of artifacts) {
        if (artifact.path.replace(/\\/g, '/').split('/').pop()?.toLowerCase() === 'plan.md') {
          void indexPlanCanonical(sessionIdRef.current, artifact.path, artifact.content, {
            connectionId: connectionId || undefined,
            modeId: modeId ?? undefined,
          }).catch(() => {});
        }
      }
    },
    [connectionId, modeId]
  );

  const promptApplyScoped = useCallback(async (assistantText: string, scopedText?: string) => {
    const scope = chatContextRef.current.scope;
    const scopeWorking =
      scope.kind === 'file' ? scope.content : scope.kind === 'snippet' ? scope.working : '';
    const content = extractScopedCodeForApply(
      (scopedText ?? assistantText).trim(),
      scopeWorking || undefined
    );
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

  const updateScopeAfterGeneratedWrite = useCallback((path: string, content: string, contentHash: string) => {
    setChatContext((prev) => {
      if (prev.scope.kind === 'file' && prev.scope.path === path) {
        return {
          ...prev,
          scope: { ...prev.scope, content, contentHash },
        };
      }
      if (prev.scope.kind === 'folder') {
        const existing = prev.scope.files.find((f) => f.path === path);
        const files = existing
          ? prev.scope.files.map((f) =>
              f.path === path ? { ...f, content, contentHash } : f
            )
          : [
              ...prev.scope.files,
              { path, content, contentHash, languageId: undefined },
            ];
        return { ...prev, scope: { ...prev.scope, files } };
      }
      return prev;
    });
  }, []);

  const promptApplyGeneratedFiles = useCallback(
    async (files: GeneratedFileBlock[]) => {
      const scope = chatContextRef.current.scope;
      const targets = files
        .filter((f) => f.complete && f.content.trim())
        .map((file) => ({
          ...file,
          path: resolveGeneratedApplyPath(file.path, scope),
        }));
      if (!targets.length) return;
      setAttachError(null);
      try {
        const items = await Promise.all(
          targets.map(async (file) => {
            const preview = await previewWorkspaceWrite(file.path, file.content);
            const before =
              preview.lineCountBefore > 0
                ? await readWorkspaceFile(file.path)
                    .then((f) => f.content)
                    .catch(() => '')
                : '';
            return { file, preview, before };
          })
        );

        const worst: PolicyDecision = items.some((i) => i.preview.decision === 'deny')
          ? 'deny'
          : items.some((i) => i.preview.decision === 'ask')
            ? 'ask'
            : 'allow';

        const applyAll = async () => {
          const applied: Array<{ path: string; content: string }> = [];
          for (const { file, preview } of items) {
            if (preview.decision === 'deny') continue;
            const result = await applyWorkspaceWrite(
              file.path,
              file.content,
              preview.contentHashBefore,
              true
            );
            updateScopeAfterGeneratedWrite(file.path, file.content, result.contentHash);
            applied.push({ path: file.path, content: file.content });
          }
          rememberAppliedContextArtifacts(applied);
        };

        const settings = await getWorkspaceSettings();
        if (worst === 'allow' && settings.applyPolicy === 'always_apply') {
          await applyAll();
          return;
        }

        if (items.length === 1) {
          const { file, preview, before } = items[0];
          setBatchApplyDialog(null);
          setApplyDialog({
            title: preview.lineCountBefore > 0 ? 'Apply generated file' : 'Create generated file',
            path: file.path,
            before,
            after: file.content,
            decision: preview.decision,
            onConfirm: async () => {
              const result = await applyWorkspaceWrite(
                file.path,
                file.content,
                preview.contentHashBefore,
                true
              );
              updateScopeAfterGeneratedWrite(file.path, file.content, result.contentHash);
              rememberAppliedContextArtifacts([{ path: file.path, content: file.content }]);
            },
          });
          return;
        }

        setBatchApplyDialog({
          items: items.map(({ file, preview, before }) => ({
            path: file.path,
            before,
            after: file.content,
            decision: preview.decision,
          })),
          onConfirm: applyAll,
        });
        setApplyDialog(null);
      } catch (e) {
        setAttachError(errorMessage(e));
      }
    },
    [updateScopeAfterGeneratedWrite, rememberAppliedContextArtifacts]
  );

  const promptApplyGeneratedFile = useCallback(async (file: GeneratedFileBlock) => {
    await promptApplyGeneratedFiles([file]);
  }, [promptApplyGeneratedFiles]);

  const runAssistantCompletion = useCallback(
    async (
      apiMessages: Array<{
        role: string;
        content: string;
        images?: Array<{ mimeType: string; dataBase64: string }>;
      }>,
      assistantId: string,
      sid: string,
      autonomousGoal: string | null
    ) => {
      const connForSend = resolveActiveConnection(conns, connectionId || activeConnIdRef.current);
      const contextLimit = effectiveContextLimit(connForSend);
      setContextTrimNotice(null);
      setIsRecoveringContext(false);
      setIsContinuingOutput(false);
      setProviderRetryWarning(null);
      setMemoryDebugLabel('Vector memory: checking...');
      setTokenUsage(null);
      setStreaming(true);

      if (autonomousMode && autonomousGoal) {
        try {
          await sendAutonomous({
            streamId: sid,
            goal: autonomousGoal,
            apiMessages,
            modeId,
            connectionId,
            chatContext: chatContextRef.current,
            sessionSummary: sessionSummaryRef.current,
            sessionId: sessionIdRef.current,
            onToken: (generation, delta) => {
              if (generation !== streamGenerationRef.current || !delta) return;
              setProviderRetryWarning(null);
              bufRef.current += delta;
              syncPlanFromStream(bufRef.current);
              scheduleFlush(assistantId);
            },
            onChatStatus: (payload) => {
              if (typeof payload.generation === 'number') {
                streamGenerationRef.current = payload.generation;
              }
              if (payload.phase === 'provider_retry') {
                setProviderRetryWarning(
                  payload.message?.trim() ||
                    `Prompt template error (retry ${payload.attempt ?? 1}/3)…`
                );
                return;
              }
              if (payload.phase === 'compressing_memory') {
                const kind = payload.kind === 'vector' ? 'vector' : 'rolling';
                setMemoryDebugLabel(`Memory compression: ${kind}`);
                return;
              }
              if (payload.phase === 'tools') {
                bufRef.current = '';
                flushPendingRef.current = false;
                setMemoryDebugLabel('Running workspace tools…');
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: '', streaming: true } : m
                  )
                );
                return;
              }
              if (payload.phase === 'recovering') {
                bufRef.current = '';
                flushPendingRef.current = false;
                setIsRecoveringContext(true);
                setIsContinuingOutput(false);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: '', streaming: true } : m
                  )
                );
                return;
              }
              if (payload.phase === 'continuing') {
                setIsContinuingOutput(true);
              }
            },
            onMemory: (payload) => {
              applySessionSummaryFromPayload(
                payload.sessionSummary,
                payload.contextWindowSize ?? contextLimit
              );
            },
            onComplete: (result) => {
              if (cancelledRef.current) return;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: result.finalText,
                        streaming: false,
                        meta: { model: 'autonomous', latencyMs: 0 },
                      }
                    : m
                )
              );
              void refreshFolderScope();
              const inner = extractPlanStepSummary(result.finalText);
              if (inner) {
                void indexPlanStepSummary(sessionIdRef.current, inner, {
                  connectionId: connectionId || undefined,
                });
              }
            },
            onError: (msg, cancelled) => {
              setIsRecoveringContext(false);
              setIsContinuingOutput(false);
              setProviderRetryWarning(null);
              if (cancelled) cancelledRef.current = true;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: cancelled ? stripVpSummaryForDisplay(bufRef.current) : '',
                        streaming: false,
                        error: cancelled ? 'Cancelled' : msg,
                      }
                    : m
                )
              );
            },
          });
        } catch (e) {
          if (!cancelledRef.current) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, streaming: false, error: errorMessage(e) }
                  : m
              )
            );
          }
        } finally {
          setStreaming(false);
          setIsRecoveringContext(false);
          setIsContinuingOutput(false);
          setProviderRetryWarning(null);
          setStreamId(null);
          assistantIdRef.current = null;
        }
        return;
      }

      const tokenEvent = `chat:${sid}:token`;
      const doneEvent = `chat:${sid}:done`;
      const errEvent = `chat:${sid}:error`;
      const statusEvent = `chat:${sid}:status`;
      const memoryEvent = `chat:${sid}:memory`;

      const unlistens: Array<() => void> = [];
      try {
        const listeners = await Promise.all([
          listen<string | TokenPayload>(tokenEvent, (e) => {
            if (assistantIdRef.current !== assistantId) return;
            const { generation, delta } = parseTokenDelta(e.payload);
            if (generation !== streamGenerationRef.current || !delta) return;
            setProviderRetryWarning(null);
            bufRef.current += delta;
            scheduleFlush(assistantId);
          }),
          listen<StatusPayload>(statusEvent, (e) => {
            if (assistantIdRef.current !== assistantId) return;
            if (typeof e.payload.generation === 'number') {
              streamGenerationRef.current = e.payload.generation;
            }
            if (e.payload.phase === 'provider_retry') {
              setProviderRetryWarning(
                e.payload.message?.trim() ||
                  `Prompt template error (retry ${e.payload.attempt ?? 1}/3)…`
              );
              return;
            }
            if (e.payload.phase === 'compressing_memory') {
              const kind = e.payload.kind === 'vector' ? 'vector' : 'rolling';
              setMemoryDebugLabel(`Memory compression: ${kind}`);
              return;
            }
            if (e.payload.phase === 'tools') {
              bufRef.current = '';
              flushPendingRef.current = false;
              setMemoryDebugLabel('Running workspace tools…');
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: '', streaming: true }
                    : m
                )
              );
              return;
            }
            if (e.payload.phase === 'continuing') {
              setIsContinuingOutput(true);
              return;
            }
            if (e.payload.phase !== 'recovering') return;
            if (typeof e.payload.generation !== 'number') {
              streamGenerationRef.current += 1;
            } else {
              streamGenerationRef.current = e.payload.generation;
            }
            bufRef.current = '';
            flushPendingRef.current = false;
            setIsRecoveringContext(true);
            setIsContinuingOutput(false);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: '', streaming: true } : m
              )
            );
          }),
          listen<MemoryPayload>(memoryEvent, (e) => {
            if (assistantIdRef.current !== assistantId) return;
            if (e.payload.contextWindowSize) {
              setConns((prev) =>
                applyCompletionContextUpdate(
                  prev,
                  activeConnIdRef.current,
                  e.payload.contextWindowSize
                )
              );
            }
            applySessionSummaryFromPayload(
              e.payload.sessionSummary,
              e.payload.contextWindowSize ?? contextLimit
            );
          }),
          listen<DonePayload>(doneEvent, (e) => {
            if (assistantIdRef.current !== assistantId) return;
            if (cancelledRef.current) return;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: e.payload.text,
                      scopedText: e.payload.scopedText,
                      streaming: false,
                      meta: {
                        model: e.payload.model,
                        latencyMs: e.payload.latencyMs,
                      },
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
            applySessionSummaryFromPayload(
              e.payload.sessionSummary,
              e.payload.contextWindowSize ?? contextLimit
            );
            applyRetrievedMemoryFromPayload(e.payload.retrievedMemory);
            applyMemoryDebugFromPayload(e.payload);
            applyContextNotice(e.payload, e.payload.contextWindowSize ?? contextLimit);
            processScopedCompletion(e.payload);
          }),
          listen<string>(errEvent, (e) => {
            if (assistantIdRef.current !== assistantId) return;
            setIsRecoveringContext(false);
            setIsContinuingOutput(false);
            setProviderRetryWarning(null);
            const cancelled = e.payload === 'cancelled';
            if (cancelled) cancelledRef.current = true;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: cancelled
                        ? stripVpSummaryForDisplay(bufRef.current)
                        : '',
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
          sessionSummary: sessionSummaryRef.current.trim() || undefined,
          sessionId: sessionIdRef.current,
        });

        if (cancelledRef.current) return;

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
        applySessionSummaryFromPayload(
          result.sessionSummary,
          result.contextWindowSize ?? contextLimit
        );
        applyRetrievedMemoryFromPayload(result.retrievedMemory);
        applyMemoryDebugFromPayload(result);
        applyContextNotice(result, result.contextWindowSize ?? contextLimit);
        processScopedCompletion(result);
      } catch (e) {
        setIsRecoveringContext(false);
        setIsContinuingOutput(false);
        setProviderRetryWarning(null);
        if (cancelledRef.current) return;
        const msg = errorMessage(e);
        if (msg.toLowerCase().includes('cancelled')) {
          cancelledRef.current = true;
          return;
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, streaming: false, error: msg } : m
          )
        );
      } finally {
        unlistens.forEach((u) => u());
        setStreaming(false);
        setIsRecoveringContext(false);
        setIsContinuingOutput(false);
        setProviderRetryWarning(null);
        setStreamId(null);
        assistantIdRef.current = null;
      }
    },
    [
      autonomousMode,
      sendAutonomous,
      syncPlanFromStream,
      scheduleFlush,
      connectionId,
      conns,
      modeId,
      refreshFolderScope,
      applySessionSummaryFromPayload,
      applyRetrievedMemoryFromPayload,
      applyMemoryDebugFromPayload,
      applyContextNotice,
      processScopedCompletion,
    ]
  );

  const regenerateAssistant = useCallback(
    async (assistantMessageId: string) => {
      if (streaming) return;
      const idx = messages.findIndex((m) => m.id === assistantMessageId);
      if (idx < 1 || idx !== messages.length - 1) return;
      const assistant = messages[idx];
      if (assistant.role !== 'assistant' || assistant.streaming) return;
      const user = messages[idx - 1];
      if (user.role !== 'user') return;

      if (voice.isListening) voice.stop();

      const history = messages.slice(0, idx);
      const apiMessages = history
        .filter((m) => !m.streaming && !m.error)
        .map((m) => ({
          role: m.role,
          content: m.content,
          images: (m.images ?? []).map(({ mimeType, dataBase64 }) => ({
            mimeType,
            dataBase64,
          })),
        }));

      const assistantId = crypto.randomUUID();
      assistantIdRef.current = assistantId;
      streamGenerationRef.current = 0;
      cancelledRef.current = false;
      const sid = crypto.randomUUID();
      setStreamId(sid);
      bufRef.current = '';
      setAttachError(null);

      if (autonomousMode) {
        clearAutonomousUi();
      }

      setMessages([
        ...history,
        { id: assistantId, role: 'assistant', content: '', streaming: true },
      ]);

      const { userText } = splitUserMessageScope(user.content);
      const autonomousGoal =
        autonomousMode && (userText.trim() || user.content.trim())
          ? userText.trim() || user.content.trim()
          : null;

      await runAssistantCompletion(apiMessages, assistantId, sid, autonomousGoal);
    },
    [
      streaming,
      messages,
      voice,
      autonomousMode,
      clearAutonomousUi,
      runAssistantCompletion,
    ]
  );

  const send = useCallback(async () => {
    const text = draft.trim();
    const scopeOnly =
      !text &&
      pendingImages.length === 0 &&
      formatScopeUserContext(chatContextRef.current.scope);
    if ((!text && !scopeOnly && pendingImages.length === 0) || streaming) return;

    if (voice.isListening) voice.stop();

    const scopeBlock = formatScopeUserContext(chatContextRef.current.scope);
    const userText = text
      ? scopeBlock
        ? `${text}\n\n${scopeBlock}`
        : text
      : scopeBlock;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userText,
      images: pendingImages.length ? [...pendingImages] : undefined,
    };
    const assistantId = crypto.randomUUID();
    assistantIdRef.current = assistantId;
    streamGenerationRef.current = 0;
    cancelledRef.current = false;
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

    await runAssistantCompletion(
      apiMessages,
      assistantId,
      sid,
      autonomousMode && text ? text : null
    );
  }, [
    draft,
    pendingImages,
    streaming,
    messages,
    voice,
    autonomousMode,
    runAssistantCompletion,
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

  const clearChatHistory = () => {
    if (streaming) cancelStream();
    voice.stop();
    const oldSessionId = sessionIdRef.current;
    if (oldSessionId) {
      void invoke('chat_clear_session_memory', { sessionId: oldSessionId }).catch(() => {});
    }
    const preservedContext = chatContextRef.current;
    const preservedConnection = connectionId;
    const newSessionId = createChatSessionId();
    setSessionId(newSessionId);
    setMessages([]);
    setDraft('');
    setPendingImages([]);
    setAttachError(null);
    setTokenUsage(null);
    setContextTrimNotice(null);
    setIsContinuingOutput(false);
    setSessionSummary('');
    setRetrievedMemory(null);
    setMemoryDebugLabel('Vector memory: idle');
    clearAutonomousUi();
    saveChatSession({
      sessionId: newSessionId,
      messages: [],
      chatContext: preservedContext,
      connectionId: preservedConnection,
      sessionSummary: undefined,
    });
  };

  const clearChat = () => {
    if (streaming) cancelStream();
    voice.stop();
    const oldSessionId = sessionIdRef.current;
    if (oldSessionId) {
      void invoke('chat_clear_session_memory', { sessionId: oldSessionId }).catch(() => {});
    }
    setSessionId(createChatSessionId());
    setMessages([]);
    setDraft('');
    setPendingImages([]);
    setAttachError(null);
    setTokenUsage(null);
    setContextTrimNotice(null);
    setIsContinuingOutput(false);
    setSessionSummary('');
    setRetrievedMemory(null);
    setMemoryDebugLabel('Vector memory: idle');
    setChatContext(DEFAULT_CHAT_CONTEXT);
    clearAutonomousUi();
    clearChatSession();
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
  const contextEstimate = useMemo(
    () => estimateChatRequestTokens(messages, sessionSummary),
    [messages, sessionSummary]
  );
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
            <div
              style={{
                fontSize: 10.5,
                color: 'var(--fg-dim)',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {providerRetryWarning && (
                <span
                  data-no-drag
                  title={providerRetryWarning}
                  style={{
                    pointerEvents: 'auto',
                    display: 'inline-flex',
                    alignItems: 'center',
                    color: 'var(--warn)',
                    cursor: 'help',
                  }}
                >
                  <I.info size={13} sw={2} />
                </span>
              )}
              <span>
                {isRecoveringContext
                  ? 'Подстраиваем контекст…'
                  : isContinuingOutput
                    ? 'Continuing...'
                    : providerRetryWarning
                      ? 'Повтор запроса к модели…'
                      : streaming
                        ? 'Thinking…'
                        : 'Local mode · stays open'}
              </span>
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
          {streaming && (
            <button
              type="button"
              data-no-drag
              onPointerDown={(e) => {
                e.preventDefault();
                cancelStream();
              }}
              title="Stop generation"
              style={{
                ...iconBtnStyle(),
                color: 'var(--danger)',
                borderColor: 'color-mix(in srgb, var(--danger) 35%, var(--border))',
              }}
            >
              <I.close size={12} />
            </button>
          )}
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
              clearChatHistory();
            }}
            title="Clear history (keep scope & attachments)"
            style={iconBtnStyle()}
          >
            <I.history size={12} />
          </button>
          <button
            type="button"
            data-no-drag
            onPointerDown={(e) => {
              e.preventDefault();
              clearChat();
            }}
            title="New chat (clear messages, memory, and scope)"
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
          sessionId={sessionId}
          connectionId={connectionId}
        />

        <div
          data-no-drag
          style={{
            margin: '0 12px 6px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 11,
            color: 'var(--fg-dim)',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: streaming ? 'not-allowed' : 'pointer' }}>
            <input
              type="checkbox"
              checked={autonomousMode}
              disabled={streaming}
              onChange={(e) => {
                const on = e.target.checked;
                setAutonomousMode(on);
                if (!on) clearAutonomousUi();
              }}
            />
            Autonomous (plan → steps → verify)
          </label>
        </div>

        {(autonomousMode || autonomousPlan || autonomousPhase) && (
          <div data-no-drag style={{ margin: '0 12px' }}>
            <AutonomousPlanStrip
              phase={autonomousPhase}
              phaseDetail={autonomousPhaseDetail}
              plan={autonomousPlan}
            />
          </div>
        )}

        {contextTrimNotice && (
          <div
            data-no-drag
            style={{
              margin: '0 12px',
              padding: '6px 10px',
              fontSize: 10.5,
              lineHeight: 1.4,
              color: contextNoticeKind === 'info' ? 'var(--accent)' : 'var(--warn)',
              background:
                contextNoticeKind === 'info'
                  ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                  : 'color-mix(in srgb, var(--warn) 12%, transparent)',
              border:
                contextNoticeKind === 'info'
                  ? '.5px solid color-mix(in srgb, var(--accent) 28%, transparent)'
                  : '.5px solid color-mix(in srgb, var(--warn) 35%, transparent)',
              borderRadius: 8,
            }}
          >
            {contextTrimNotice}
          </div>
        )}

        <div
          data-no-drag
          title="Lightweight memory debug"
          style={{
            margin: contextTrimNotice ? '4px 12px 0' : '0 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            lineHeight: 1.3,
            color: 'var(--fg-dim)',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: retrievedMemory
                ? 'var(--accent)'
                : memoryDebugLabel.includes('compressed')
                  ? 'var(--warn)'
                  : 'var(--border-strong)',
              flexShrink: 0,
            }}
          />
          <span>{memoryDebugLabel}</span>
        </div>

        {sessionSummary.trim() && (
          <details
            data-no-drag
            style={{
              margin: '0 12px',
              fontSize: 10.5,
              color: 'var(--fg-dim)',
              border: '.5px solid var(--border)',
              borderRadius: 8,
              padding: '4px 8px',
              background: 'var(--surface-2)',
            }}
          >
            <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
              Память диалога (~{estimateTokensFromChars(sessionSummary.length)} tok)
            </summary>
            <pre
              style={{
                margin: '6px 0 0',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 10,
                color: 'var(--fg-mute)',
              }}
            >
              {sessionSummary}
            </pre>
          </details>
        )}

        {retrievedMemory && (
          <details
            data-no-drag
            style={{
              margin: '0 12px',
              fontSize: 10.5,
              color: 'var(--fg-dim)',
              border: '.5px solid var(--border)',
              borderRadius: 8,
              padding: '4px 8px',
              background: 'color-mix(in srgb, var(--accent) 6%, var(--surface-2))',
            }}
          >
            <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
              Семантическая память (~{estimateTokensFromChars(retrievedMemory.length)} tok)
            </summary>
            <pre
              style={{
                margin: '6px 0 0',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 10,
                color: 'var(--fg-mute)',
              }}
            >
              {retrievedMemory}
            </pre>
          </details>
        )}

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
          {messages.map((m, i) => (
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
              onRegenerate={
                !streaming &&
                i === messages.length - 1 &&
                m.role === 'assistant' &&
                !m.streaming
                  ? () => void regenerateAssistant(m.id)
                  : undefined
              }
              onApplyGeneratedFile={(file) => void promptApplyGeneratedFile(file)}
              onApplyGeneratedFiles={(files) => void promptApplyGeneratedFiles(files)}
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
      <BatchApplyConfirmDialog
        open={batchApplyDialog !== null}
        items={batchApplyDialog?.items ?? []}
        onCancel={() => setBatchApplyDialog(null)}
        onConfirm={async () => {
          if (!batchApplyDialog) return;
          await batchApplyDialog.onConfirm();
        }}
      />
    </div>
  );
}

function formatContextLimit(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function UserMessageBody({ content }: { content: string }) {
  const { userText, attachment } = splitUserMessageScope(content);
  const [expanded, setExpanded] = useState(false);

  if (!attachment) {
    return <>{content}</>;
  }

  const previewLines = attachment.body.split('\n').slice(0, 2).join('\n');
  const lineCount = attachment.body.split('\n').length;
  const attachTitle =
    attachment.kind === 'file'
      ? `File · ${attachment.label}`
      : attachment.kind === 'folder'
        ? `Folder · ${attachment.label}`
      : attachment.kind === 'snippet'
        ? 'Snippet'
        : attachment.label;

  return (
    <>
      {userText ? <div style={{ marginBottom: 8 }}>{userText}</div> : null}
      <div
        style={{
          fontSize: 11,
          borderRadius: 8,
          border: '.5px solid var(--accent-tint-2)',
          background: 'var(--surface)',
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: '100%',
            padding: '6px 8px',
            border: 'none',
            background: 'transparent',
            color: 'var(--accent)',
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: 11,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              width: 14,
              height: 14,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 3,
              border: '.5px solid var(--border-strong)',
              fontSize: 9,
              flexShrink: 0,
            }}
            aria-hidden
          >
            {expanded ? '−' : '+'}
          </span>
          <span style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {attachTitle}
          </span>
          <span style={{ color: 'var(--fg-dim)', fontSize: 10, flexShrink: 0 }}>
            {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          </span>
        </button>
        {expanded ? (
          <pre
            style={{
              margin: 0,
              padding: '6px 8px 8px',
              borderTop: '.5px solid var(--border)',
              fontSize: 10,
              color: 'var(--fg-mute)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 240,
              overflow: 'auto',
            }}
          >
            {attachment.body}
          </pre>
        ) : (
          previewLines && (
            <pre
              style={{
                margin: 0,
                padding: '0 8px 6px',
                fontSize: 9.5,
                color: 'var(--fg-dim)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 36,
                overflow: 'hidden',
              }}
            >
              {previewLines}
              {lineCount > 2 ? '\n…' : ''}
            </pre>
          )
        )}
      </div>
    </>
  );
}

function MessageBubble({
  message: m,
  scopeKind,
  scopeWorking,
  onApply,
  onRegenerate,
  onApplyGeneratedFile,
  onApplyGeneratedFiles,
}: {
  message: ChatMessage;
  scopeKind?: string;
  scopeWorking?: string;
  onApply?: () => void;
  onRegenerate?: () => void;
  onApplyGeneratedFile?: (file: GeneratedFileBlock) => void;
  onApplyGeneratedFiles?: (files: GeneratedFileBlock[]) => void;
}) {
  const isUser = m.role === 'user';
  const generatedFiles = !isUser ? parseGeneratedFileBlocks(m.content) : [];
  const assistantDisplay = !isUser && generatedFiles.length
    ? stripGeneratedFileBlocks(m.content)
    : m.content;
  const applyCandidate = extractScopedCodeForApply(
    (m.scopedText ?? m.content).trim(),
    scopeWorking
  );
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
        {isUser ? (
          <UserMessageBody content={m.content} />
        ) : (
          assistantDisplay || null
        )}
        {!isUser && generatedFiles.length > 0 && (
          <GeneratedFilesList
            files={generatedFiles}
            onApply={onApplyGeneratedFile}
            onApplySelected={onApplyGeneratedFiles}
          />
        )}
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
        {(showApply || onRegenerate) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                title="Повторить ответ"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 10.5,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '.5px solid var(--border-strong)',
                  background: 'var(--surface)',
                  color: 'var(--fg-dim)',
                  cursor: 'pointer',
                }}
              >
                <I.refresh size={11} />
                Повторить
              </button>
            )}
            {showApply && (
              <button
                type="button"
                onClick={onApply}
                style={{
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
        )}
      </div>
    </div>
  );
}

function GeneratedFilesList({
  files,
  onApply,
  onApplySelected,
}: {
  files: GeneratedFileBlock[];
  onApply?: (file: GeneratedFileBlock) => void;
  onApplySelected?: (files: GeneratedFileBlock[]) => void;
}) {
  const completePaths = useMemo(
    () => files.filter((f) => f.complete && f.content.trim()).map((f) => f.path),
    [files]
  );
  const [openPath, setOpenPath] = useState(files[0]?.path ?? '');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(completePaths));

  useEffect(() => {
    setSelected(new Set(completePaths));
  }, [completePaths.join('|')]);

  const open = files.find((f) => f.path === openPath) ?? files[0];
  if (!open) return null;

  const selectedFiles = files.filter((f) => selected.has(f.path) && f.complete);
  const toggle = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div
      style={{
        marginTop: 8,
        borderTop: '.5px solid var(--border)',
        paddingTop: 8,
        whiteSpace: 'normal',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 6,
          color: 'var(--fg-mute)',
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        <I.code size={13} />
        <span>Generated files</span>
        <span style={{ color: 'var(--fg-dim)', fontWeight: 500 }}>({files.length})</span>
        {selectedFiles.length > 1 && onApplySelected ? (
          <button
            type="button"
            onClick={() => onApplySelected(selectedFiles)}
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 6,
              border: '.5px solid var(--accent-tint-2)',
              background: 'var(--accent-tint)',
              color: 'var(--accent)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Apply selected ({selectedFiles.length})
          </button>
        ) : null}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {files.map((file) => {
          const active = file.path === open.path;
          const checked = selected.has(file.path);
          return (
            <div
              key={file.path}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto auto',
                alignItems: 'center',
                gap: 6,
                width: '100%',
                minHeight: 28,
                border: '.5px solid var(--border)',
                borderRadius: 6,
                background: active ? 'var(--accent-tint)' : 'var(--surface)',
                padding: '3px 6px',
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!file.complete}
                onChange={() => toggle(file.path)}
                title="Include in batch apply"
              />
              <button
                type="button"
                onClick={() => setOpenPath(file.path)}
                style={{
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  border: 'none',
                  background: 'transparent',
                  color: active ? 'var(--accent)' : 'var(--fg)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 11,
                  padding: 0,
                }}
              >
                {file.path}
              </button>
              <span style={{ color: file.complete ? 'var(--fg-dim)' : 'var(--warn)', fontSize: 10 }}>
                {file.complete ? file.language ?? 'file' : 'incomplete'}
              </span>
              <button
                type="button"
                onClick={() => onApply?.(file)}
                disabled={!file.complete || !onApply}
                title={file.complete ? 'Apply this file' : 'Wait until generation completes'}
                style={miniFileBtnStyle(!file.complete || !onApply)}
              >
                <I.download size={11} />
              </button>
            </div>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 6,
          border: '.5px solid var(--border)',
          borderRadius: 6,
          overflow: 'hidden',
          background: 'var(--bg-2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            minHeight: 30,
            padding: '5px 7px',
            borderBottom: '.5px solid var(--border)',
            color: 'var(--fg-mute)',
            fontSize: 10.5,
          }}
        >
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {open.path}
          </span>
          <button
            type="button"
            onClick={() => void writeClipboardText(open.content)}
            title="Copy file content"
            style={miniFileBtnStyle(false)}
          >
            <I.copy size={11} />
          </button>
          <button
            type="button"
            onClick={() => onApply?.(open)}
            disabled={!open.complete || !onApply}
            title={open.complete ? 'Apply generated file to workspace' : 'Wait until generation completes'}
            style={miniFileBtnStyle(!open.complete || !onApply)}
          >
            <I.download size={11} />
          </button>
        </div>
        <pre
          style={{
            margin: 0,
            padding: '7px',
            maxHeight: 220,
            overflow: 'auto',
            color: 'var(--fg)',
            fontSize: 10.5,
            lineHeight: 1.45,
            whiteSpace: 'pre',
            wordBreak: 'normal',
          }}
        >
          {open.content}
        </pre>
      </div>
    </div>
  );
}

function miniFileBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: 5,
    border: '.5px solid var(--border)',
    background: 'var(--surface)',
    color: disabled ? 'var(--fg-dim)' : 'var(--fg-mute)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    padding: 0,
  };
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
