import { useQuery } from '@tanstack/react-query';
import { trayApi } from '../infrastructure/trayApi';

export const useTrayTogglesQuery = () =>
  useQuery({ queryKey: ['tray', 'toggles'], queryFn: trayApi.getToggles });
export const useTrayPrimaryQuery = () =>
  useQuery({ queryKey: ['tray', 'primary'], queryFn: trayApi.getPrimaryItems });
export const useTraySecondaryQuery = () =>
  useQuery({ queryKey: ['tray', 'secondary'], queryFn: trayApi.getSecondaryItems });
