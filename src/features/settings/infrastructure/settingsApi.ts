import { invokeCommand } from '@kernel/infrastructure/tauri';
import type {
  HistoryItem,
  OllamaModel,
  PromptMode,
  ProviderInfo,
  SettingsTab,
  ShortcutItem,
} from '../domain';

// Pure-UI data — not backend-backed. The tab list is static layout metadata.
const TABS: SettingsTab[] = [
  { id: 'general', label: 'General', iconName: 'cog' },
  { id: 'shortcuts', label: 'Shortcuts', iconName: 'keyboard' },
  { id: 'modes', label: 'Modes', iconName: 'layers' },
  { id: 'providers', label: 'Providers', iconName: 'cloud' },
  { id: 'history', label: 'History', iconName: 'history' },
  { id: 'appearance', label: 'Appearance', iconName: 'paint' },
  { id: 'advanced', label: 'Advanced', iconName: 'cpu' },
  { id: 'about', label: 'About', iconName: 'info' },
];

// Still mock — Ollama model discovery arrives with sub-project 2 (AI Engine).
const OLLAMA_MODELS: OllamaModel[] = [
  { name: 'llama3.1:8b', size: '4.7 GB', active: true, pulled: '2d ago' },
  { name: 'qwen2.5-coder:7b', size: '4.4 GB', active: false, pulled: '5d ago' },
  { name: 'mistral:7b-instruct', size: '4.1 GB', active: false, pulled: '1w ago' },
  { name: 'phi3:mini', size: '2.3 GB', active: false, pulled: '2w ago' },
];

export const settingsApi = {
  getTabs: async (): Promise<SettingsTab[]> => TABS,
  getModes: (): Promise<PromptMode[]> => invokeCommand<PromptMode[]>('list_modes'),
  getProviders: (): Promise<ProviderInfo[]> => invokeCommand<ProviderInfo[]>('list_providers'),
  getOllamaModels: async (): Promise<OllamaModel[]> => OLLAMA_MODELS,
  getHistory: (): Promise<HistoryItem[]> => invokeCommand<HistoryItem[]>('get_history'),
  getShortcuts: (): Promise<ShortcutItem[]> => invokeCommand<ShortcutItem[]>('list_shortcuts'),
};
