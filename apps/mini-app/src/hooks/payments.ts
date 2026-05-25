import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { PaymentIntent, RedemptionResult, Wallet } from '../types';

export function useWallet() {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: () => api<Wallet>('/wallets/me'),
  });
}

export interface NewIntentInput {
  amountMinor: number;
  currency?: 'NGN';
}

export function useCreateIntent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: NewIntentInput) =>
      api<PaymentIntent>('/intents', {
        method: 'POST',
        body: JSON.stringify({ currency: 'NGN', ...data }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallet'] }),
  });
}

export function useRedeem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      api<RedemptionResult>('/redeem', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}
