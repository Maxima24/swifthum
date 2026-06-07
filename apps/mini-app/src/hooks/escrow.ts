import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type {
  CreateEscrowInput,
  EscrowAction,
  EscrowCreated,
  EscrowDetail,
  EscrowSummary,
} from '../types';

/** Buyer creates + funds an escrow (wallet → escrow_hold). */
export function useCreateEscrow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateEscrowInput) =>
      api<EscrowCreated>('/escrows', {
        method: 'POST',
        body: JSON.stringify({ currency: 'NGN', ...data }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['escrows'] });
    },
  });
}

/** The caller's escrows (as buyer or seller). */
export function useMyEscrows() {
  return useQuery({
    queryKey: ['escrows'],
    queryFn: () => api<{ items: EscrowSummary[] }>('/escrows'),
  });
}

/** One escrow's detail + event timeline. Polls so state changes from the other
 *  party (or admin resolution) land without a manual refresh. */
export function useEscrow(id: string | undefined) {
  return useQuery({
    queryKey: ['escrow', id],
    queryFn: () => api<EscrowDetail>(`/escrows/${id}`),
    enabled: !!id,
    refetchInterval: 5000,
  });
}

/** Run a state-transition action on an escrow. */
export function useEscrowAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: EscrowAction) =>
      api<EscrowSummary>(`/escrows/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['escrows'] });
      qc.invalidateQueries({ queryKey: ['escrow', id] });
    },
  });
}
