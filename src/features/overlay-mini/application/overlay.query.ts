import { useQuery } from '@tanstack/react-query';
import { overlayApi } from '../infrastructure/overlayApi';

export const useOverlayEditQuery = () =>
  useQuery({ queryKey: ['overlay', 'edit'], queryFn: overlayApi.getCurrentEdit });
