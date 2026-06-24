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

/** True when `after` looks like a whole-file paste, not a surgical edit. */
export function isWholeFileRewrite(before: string, after: string): boolean {
  const a = after.trim();
  const b = before.trim();
  if (!a || a === b) return false;

  const afterLines = a.split('\n').length;
  const beforeLines = Math.max(1, b.split('\n').length);

  if (afterLines <= 8 && a.length <= 400) return false;

  if (afterLines >= 30) return true;

  if (beforeLines >= 20 && afterLines >= Math.ceil(beforeLines * 0.55)) {
    return true;
  }

  if (b.length >= 800 && a.length >= b.length * 0.75) {
    return true;
  }

  return false;
}

/** Strip model prose; keep fenced code for Apply (prefer smallest surgical fence). */
export function extractScopedCodeForApply(text: string, scopeWorking?: string): string {
  const tag = text.match(/<(?:snippet|file)>([\s\S]*?)<\/(?:snippet|file)>/i);
  if (tag?.[1]) {
    const inner = tag[1].trim();
    if (scopeWorking && isWholeFileRewrite(scopeWorking, inner)) return '';
    return inner;
  }

  const fences = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1].trimEnd());
  if (fences.length === 0) return text.trim();

  const before = scopeWorking?.trim() ?? '';
  const candidates = fences
    .map((f) => f.trim())
    .filter((f) => f && f !== before)
    .sort((a, b) => a.length - b.length);

  for (const candidate of candidates) {
    if (!before || !isWholeFileRewrite(before, candidate)) {
      return candidate;
    }
  }

  return '';
}

/** Whether an assistant reply is worth offering as a snippet/file apply target. */
export function isApplyableScopedEdit(working: string, candidate: string): boolean {
  const before = working.trim();
  const after = candidate.trim();
  if (!after || before === after) return false;

  if (isWholeFileRewrite(before, after)) return false;

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
