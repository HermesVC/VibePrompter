import { useQuery } from '@tanstack/react-query';
import { paletteApi } from '../infrastructure/paletteApi';

export function useQuickActionsQuery() {
  return useQuery({
    queryKey: ['command-palette', 'quick-actions'],
    queryFn: paletteApi.getQuickActions,
  });
}

export function useRecentModesQuery() {
  return useQuery({
    queryKey: ['command-palette', 'recent-modes'],
    queryFn: paletteApi.getRecentModes,
  });
}

export const getSampleResponse = paletteApi.getSampleResponse;
