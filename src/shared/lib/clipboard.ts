import { invoke, isTauri } from '@tauri-apps/api/core';

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
