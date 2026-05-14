import { useQuery } from '@tanstack/react-query';
import { toastsApi } from '../infrastructure/toastsApi';

export const useDemoToastsQuery = () =>
  useQuery({ queryKey: ['toasts', 'demo'], queryFn: toastsApi.getDemoToasts });
