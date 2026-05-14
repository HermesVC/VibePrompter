import { useQuery } from '@tanstack/react-query';
import { onboardingApi } from '../infrastructure/onboardingApi';

export function useProvidersQuery() {
  return useQuery({
    queryKey: ['onboarding', 'providers'],
    queryFn: onboardingApi.getProviders,
  });
}

export function useModesQuery() {
  return useQuery({
    queryKey: ['onboarding', 'modes'],
    queryFn: onboardingApi.getModes,
  });
}
