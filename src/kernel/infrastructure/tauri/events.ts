import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/**
 * Shared event payload types — mirrors of the Rust `events::types` module.
 * Keep in sync with `src-tauri/src/events/types.rs`.
 */
export interface ShortcutUpdatedPayload {
  shortcut_id: string;
}
export interface ShortcutTriggeredPayload {
  shortcut_id: string;
  action: string;
}

/** Map of event name -> payload type. Payload-less events use `null`. */
export interface AppEventMap {
  app_ready: null;
  settings_changed: null;
  shortcut_updated: ShortcutUpdatedPayload;
  shortcut_triggered: ShortcutTriggeredPayload;
}

/** Typed wrapper over Tauri's `listen`. Returns the unlisten function. */
export async function onEvent<K extends keyof AppEventMap>(
  event: K,
  handler: (payload: AppEventMap[K]) => void,
): Promise<UnlistenFn> {
  return listen<AppEventMap[K]>(event, (e) => handler(e.payload));
}
