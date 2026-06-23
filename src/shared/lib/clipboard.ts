import { invoke, isTauri } from '@tauri-apps/api/core';
import { detectLanguageFromPath } from './snippetScope';

/** Write text to the OS clipboard — uses Tauri in the desktop app (reliable in WebView2). */
export async function writeClipboardText(text: string): Promise<void> {
  if (isTauri()) {
    await invoke('write_clipboard_text', { text });
    return;
  }
  await navigator.clipboard.writeText(text);
}

export async function readClipboardText(): Promise<string> {
  if (isTauri()) {
    return invoke<string>('read_clipboard_text');
  }
  return navigator.clipboard.readText();
}

/** Grab selection — clipboard first (user copies before switching to chat), then UIA/Ctrl+C. */
export async function captureEditorSelection(): Promise<string> {
  const fromClipboard = (await readClipboardText()).trim();
  if (fromClipboard) return fromClipboard;

  if (isTauri()) {
    try {
      const captured = await invoke<string>('capture_editor_selection');
      if (captured.trim()) return captured;
    } catch {
      // ignore — surfaced by empty result below
    }
  }
  return '';
}

const CODE_SIGNAL =
  /[{}();=<>[\]]|function\s|class\s|def\s|public\s|private\s|const\s|let\s|var\s|import\s|#include|->|::/;

/** Whether an assistant reply is worth offering as a snippet/file apply target. */
export function isApplyableScopedEdit(working: string, candidate: string): boolean {
  const before = working.trim();
  const after = candidate.trim();
  if (!after || before === after) return false;

  const lines = after.split('\n').length;
  if (lines <= 2 && after.length < 120 && !CODE_SIGNAL.test(after)) {
    return false;
  }
  return true;
}

export function languageIdForSnippet(text: string, path?: string): string | undefined {
  if (path) {
    const fromPath = detectLanguageFromPath(path);
    if (fromPath) return fromPath;
  }
  if (/^\s*<\?php/m.test(text)) return 'php';
  if (/^\s*#!/.test(text) || /\bdef\s+\w+\s*\(/.test(text)) return 'python';
  if (/\b(fn|let|const)\s+\w+/.test(text) || /:\s*\w+(\[\])?\s*=>/.test(text)) return 'typescript';
  if (/\b(function|jQuery|\$\()/.test(text)) return 'javascript';
  return undefined;
}
