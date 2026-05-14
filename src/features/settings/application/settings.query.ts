import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '../infrastructure/settingsApi';

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
