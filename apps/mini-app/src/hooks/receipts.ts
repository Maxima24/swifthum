import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ReceiptListItem, ReceiptVerifyResult } from '../types';

/** The caller's receipts (sent + received) with shareable links. */
export function useReceipts() {
  return useQuery({
    queryKey: ['receipts'],
    queryFn: () => api<{ items: ReceiptListItem[] }>('/receipts'),
  });
}

export interface EmailReceiptResult {
  status: 'ok' | 'no_email' | 'not_configured';
  to?: string;
}

/** Email a receipt to the caller (their saved email, or one passed in). */
export function useEmailReceipt() {
  return useMutation({
    mutationFn: ({ receiptId, email }: { receiptId: string; email?: string }) =>
      api<EmailReceiptResult>(`/receipts/${receiptId}/email`, {
        method: 'POST',
        body: JSON.stringify(email ? { email } : {}),
      }),
  });
}

/**
 * Public verification of a shared receipt token. No auth — the whole point is
 * third-party verifiability. `retry: false` so a tampered token surfaces the
 * invalid result immediately instead of retrying.
 */
export function useVerifyReceipt(token: string | null) {
  return useQuery({
    queryKey: ['receipt-verify', token],
    queryFn: () =>
      api<ReceiptVerifyResult>(`/receipts/verify?token=${encodeURIComponent(token ?? '')}`),
    enabled: !!token,
    retry: false,
  });
}
