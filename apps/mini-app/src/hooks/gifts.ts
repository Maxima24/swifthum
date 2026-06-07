import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { CreateGiftInput, Gift, GiftListItem } from '../types';

/** Create a gift link (locks funds into gift_unclaimed). */
export function useCreateGift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateGiftInput) =>
      api<Gift>('/gifts', {
        method: 'POST',
        body: JSON.stringify({ currency: 'NGN', ...data }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['gifts'] });
    },
  });
}

/** The caller's sent gifts with claim links + state. */
export function useMyGifts() {
  return useQuery({
    queryKey: ['gifts'],
    queryFn: () => api<{ items: GiftListItem[] }>('/gifts'),
  });
}

/** Reclaim an unclaimed gift; funds return to the sender's wallet. */
export function useCancelGift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (giftId: string) =>
      api<{ status: 'reclaimed' }>(`/gifts/${giftId}/cancel`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['gifts'] });
    },
  });
}
