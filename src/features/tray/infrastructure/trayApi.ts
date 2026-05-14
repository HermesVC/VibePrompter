import type { TrayMenuItem, TrayToggleConfig } from '../domain';

const TOGGLES: TrayToggleConfig[] = [
  { id: 'enabled', label: 'Enable AI', iconName: 'bolt', defaultValue: true },
  { id: 'shortcuts', label: 'Global shortcuts', iconName: 'keyboard', defaultValue: true, kbd: ['Ctrl', '⇧', '␣'] },
  { id: 'boot', label: 'Start on boot', iconName: 'power', defaultValue: true },
  { id: 'clip', label: 'Clipboard monitor', iconName: 'clipboard', defaultValue: false },
];

const ITEMS_PRIMARY: TrayMenuItem[] = [
  { id: 'palette', label: 'Open Palette', iconName: 'wand', kbd: ['Ctrl', '⇧', '␣'], accent: true },
  { id: 'mode', label: 'Switch Mode', iconName: 'layers', kbd: ['Ctrl', '⇧', 'M'] },
  { id: 'history', label: 'History', iconName: 'history', kbd: ['Ctrl', '⇧', 'H'] },
  { id: 'settings', label: 'Settings…', iconName: 'cog', kbd: ['⌘', ','] },
];

const ITEMS_SECONDARY: TrayMenuItem[] = [
  { id: 'restart', label: 'Restart service', iconName: 'refresh' },
  { id: 'updates', label: 'Check for updates', iconName: 'download', badge: 'Up to date' },
  { id: 'quit', label: 'Quit PromptHelper', iconName: 'power', danger: true },
];

export const trayApi = {
  getToggles: async () => TOGGLES,
  getPrimaryItems: async () => ITEMS_PRIMARY,
  getSecondaryItems: async () => ITEMS_SECONDARY,
};
