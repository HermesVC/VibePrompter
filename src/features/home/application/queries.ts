import { useQuery } from '@tanstack/react-query';
import { homeApi } from '../infrastructure';
import type { HomeStats, ActivityItem } from '../domain';

/**
 * Query keys for home feature
 */
export const homeQueryKeys = {
  all: ['home'] as const,
  stats: () => [...homeQueryKeys.all, 'stats'] as const,
  activity: (limit?: number) => [...homeQueryKeys.all, 'activity', { limit }] as const,
};

/**
 * Query: Get home stats
 * Uses TanStack Query for server state management
 */
export function useHomeStats() {
  return useQuery<HomeStats, Error>({
    queryKey: homeQueryKeys.stats(),
    queryFn: homeApi.getStats,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Query: Get recent activity
 */
export function useRecentActivity(limit = 10) {
  return useQuery<ActivityItem[], Error>({
    queryKey: homeQueryKeys.activity(limit),
    queryFn: () => homeApi.getRecentActivity(limit),
    staleTime: 60 * 1000, // 1 minute
  });
}
