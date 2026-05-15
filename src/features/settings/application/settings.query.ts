import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '../infrastructure/settingsApi';
import { invokeCommand } from '@kernel/infrastructure/tauri';

const k = (...parts: string[]) => ['settings', ...parts];

export const useTabsQuery = () =>
  useQuery({ queryKey: k('tabs'), queryFn: settingsApi.getTabs });
export const useModesQuery = () =>
  useQuery({ queryKey: k('modes'), queryFn: settingsApi.getModes });
export const useProvidersQuery = () =>
  useQuery({ queryKey: k('providers'), queryFn: settingsApi.getProviders });
export const useOllamaModelsQuery = () =>
  useQuery({ queryKey: k('ollama'), queryFn: settingsApi.getOllamaModels });
export const useHistoryQuery = () =>
  useQuery({ queryKey: k('history'), queryFn: settingsApi.getHistory });
export const useShortcutsQuery = () =>
  useQuery({ queryKey: k('shortcuts'), queryFn: settingsApi.getShortcuts });

/** The user-facing settings aggregate — mirrors the Rust `Settings` struct. */
export interface AppSettings {
  boot_start: boolean;
  minimize_to_tray: boolean;
  quit_on_close: boolean;
  auto_paste: boolean;
  notifications: boolean;
  stream_response: boolean;
  clipboard_fallback: boolean;
  low_memory_mode: boolean;
  response_timeout: number;
  concurrent_requests: number;
  theme: string;
  accent: string;
  density: string;
  history_retention: string;
  dev_tools: boolean;
  log_raw_responses: boolean;
  proxy_url: string;
}

export const useAppSettingsQuery = () =>
  useQuery({
    queryKey: k('app-settings'),
    queryFn: () => invokeCommand<AppSettings>('get_settings'),
  });

export const useSaveSettingsMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: AppSettings) =>
      invokeCommand<void>('save_settings', { settings }),
    onSuccess: () => qc.invalidateQueries({ queryKey: k('app-settings') }),
  });
};
