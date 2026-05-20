import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Check if the application is running inside the Tauri Windows desktop environment.
 */
export function isWindowsTauri(): boolean {
  try {
    const label = getCurrentWindow().label;
    const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('windows');
    return !!label && isWindows;
  } catch {
    return false;
  }
}
