import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type {
  IntentStatus,
  PaymentIntent,
  RedemptionResult,
  SendToUserResult,
  UserLookupResult,
  UserPreferences,
  Wallet,
} from '../types';

export function useWallet() {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: () => api<Wallet>('/wallets/me'),
  });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prefs: Partial<UserPreferences>) =>
      api<UserPreferences>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(prefs),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallet'] }),
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

export function useCancelIntent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (intentId: string) =>
      api<{ status: 'refunded' }>(`/intents/${intentId}/cancel`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallet'] }),
  });
}

/** Polls an intent's status (every 2.5s) until it leaves `pending`. */
export function useIntentStatus(intentId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['intent', intentId],
    queryFn: () => api<IntentStatus>(`/intents/${intentId}`),
    enabled: enabled && !!intentId,
    refetchInterval: (query) =>
      query.state.data && query.state.data.status !== 'pending' ? false : 2500,
  });
}

/** Resolve a typed @handle to a SwiftHum user (debounced by the caller). */
export function useLookupUser(username: string) {
  const handle = username.trim().replace(/^@+/, '');
  return useQuery({
    queryKey: ['user-lookup', handle.toLowerCase()],
    queryFn: () => api<UserLookupResult>(`/users/lookup?username=${encodeURIComponent(handle)}`),
    enabled: handle.length >= 3,
    staleTime: 10_000,
  });
}

export interface SendToUserInput {
  recipientUsername: string;
  amountMinor: number;
}

/** Direct wallet → wallet send to a @username. */
export function useSendToUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SendToUserInput) =>
      api<SendToUserResult>('/transfers', {
        method: 'POST',
        body: JSON.stringify({ currency: 'NGN', ...data }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
    },
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
