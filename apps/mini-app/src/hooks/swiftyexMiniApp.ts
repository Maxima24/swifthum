import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

/**
 * Hooks for the real SwiftyEx Mini App API (proxied by the SwiftHum backend).
 * Each returns a `{ configured, … }` envelope — `configured:false` means
 * SWIFTYEX_MINIAPP_BASE_URL isn't set, so the UI shows a "Connect SwiftyEx" state.
 * Shapes under `rates`/`wallets`/`profile`/`transactions` are upstream-owned and
 * rendered defensively.
 */
export interface SxEnvelope {
  configured: boolean;
  rates?: unknown;
  wallets?: unknown;
  profile?: unknown;
  transactions?: unknown;
}

export function useSwiftyexRates() {
  return useQuery({
    queryKey: ['sx-rates'],
    queryFn: () => api<SxEnvelope>('/swiftyex/rates'),
    staleTime: 30_000,
  });
}

export function useSwiftyexWallets() {
  return useQuery({
    queryKey: ['sx-wallets'],
    queryFn: () => api<SxEnvelope>('/swiftyex/wallets'),
    staleTime: 30_000,
  });
}

export function useSwiftyexIdentity() {
  return useQuery({
    queryKey: ['sx-me'],
    queryFn: () => api<SxEnvelope>('/swiftyex/me'),
    staleTime: 60_000,
  });
}

export function useSwiftyexTransactions(page: number) {
  return useQuery({
    queryKey: ['sx-tx', page],
    queryFn: () => api<SxEnvelope>(`/swiftyex/sx-transactions?page=${page}`),
  });
}
