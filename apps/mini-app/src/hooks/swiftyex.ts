import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { SwiftyexAccountStatus, SwiftyexHolding } from '../types';

export function useSwiftyexAccount() {
  return useQuery({
    queryKey: ['swiftyex', 'account'],
    queryFn: () => api<SwiftyexAccountStatus>('/swiftyex/account'),
  });
}

export function useSwiftyexHoldings() {
  return useQuery({
    queryKey: ['swiftyex', 'holdings'],
    queryFn: () => api<SwiftyexHolding[]>('/swiftyex/holdings'),
  });
}

export function useLinkSwiftyex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (apiKey: string) =>
      api<SwiftyexAccountStatus>('/swiftyex/link', {
        method: 'POST',
        body: JSON.stringify({ apiKey }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['swiftyex', 'account'] }),
  });
}

export function useUnlinkSwiftyex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/swiftyex/link', { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['swiftyex', 'account'] }),
  });
}
