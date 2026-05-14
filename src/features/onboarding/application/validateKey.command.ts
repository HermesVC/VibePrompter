import { useMutation } from '@tanstack/react-query';
import { onboardingApi } from '../infrastructure/onboardingApi';

export function useValidateKeyMutation() {
  return useMutation({
    mutationFn: (key: string) => onboardingApi.validateApiKey(key),
  });
}
