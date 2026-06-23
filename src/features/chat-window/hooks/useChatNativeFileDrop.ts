import { useEffect, useRef } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { ingestRustDroppedFiles } from '@shared/lib/chatAttachments';

interface UseChatNativeFileDropOptions {
  streaming: boolean;
  pendingImageCount: number;
  onDragOverChange: (over: boolean) => void;
  onIngest: (result: ReturnType<typeof ingestRustDroppedFiles>) => void;
}

/**
 * Tauri intercepts OS file drops before the WebView sees dataTransfer.files.
 * Subscribe once to the native drag-drop event and read paths via Rust.
 */
export function useChatNativeFileDrop({
  streaming,
  pendingImageCount,
  onDragOverChange,
  onIngest,
}: UseChatNativeFileDropOptions) {
  const streamingRef = useRef(streaming);
  const pendingRef = useRef(pendingImageCount);
  const onDragOverRef = useRef(onDragOverChange);
  const onIngestRef = useRef(onIngest);
  const dropTokenRef = useRef(0);

  streamingRef.current = streaming;
  pendingRef.current = pendingImageCount;
  onDragOverRef.current = onDragOverChange;
  onIngestRef.current = onIngest;

  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | undefined;
    let disposed = false;

    void getCurrentWebviewWindow()
      .onDragDropEvent(async (event) => {
        if (streamingRef.current) return;
        const { type } = event.payload;
        if (type === 'enter' || type === 'over') {
          onDragOverRef.current(true);
          return;
        }
        if (type === 'leave') {
          onDragOverRef.current(false);
          return;
        }
        if (type !== 'drop') return;

        onDragOverRef.current(false);
        const paths = event.payload.paths;
        if (!paths?.length) return;

        // Guard against duplicate drop delivery when listeners were stacked.
        const token = ++dropTokenRef.current;

        try {
          const dropped = await invoke<
            Array<{
              name: string;
              mimeType: string;
              dataBase64?: string | null;
              text?: string | null;
            }>
          >('read_chat_attachment_paths', { paths });

          if (disposed || token !== dropTokenRef.current) return;

          onIngestRef.current(
            ingestRustDroppedFiles(dropped, pendingRef.current)
          );
        } catch (e) {
          if (disposed || token !== dropTokenRef.current) return;
          const msg = e instanceof Error ? e.message : String(e);
          onIngestRef.current({ images: [], draftAppend: '', error: msg });
        }
      })
      .then((fn) => {
        if (disposed) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}
