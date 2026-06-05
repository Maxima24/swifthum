import { ApiError } from './api';

// Backend machine codes (common/errors.ts) → human-friendly copy.
const FRIENDLY: Record<string, string> = {
  expired: 'This payment expired. Ask the sender to generate a fresh QR.',
  invalid_or_expired: "Couldn't read that token. Scan a fresh QR from the sender.",
  already_redeemed: 'This payment was already received.',
  insufficient_balance: 'The sender no longer has enough balance.',
  unauthorized: 'Your session expired — reopen SwiftHum from Telegram.',
  not_found: 'That payment could not be found.',
  validation_error: "That token isn't valid.",
};

const KNOWN_CODES = Object.keys(FRIENDLY);

/**
 * Pull the stable backend error code off an unknown thrown value. Prefers the
 * structured ApiError.code; for mock-mode plain Errors (e.g. "410 expired") it
 * scans the message for a known code so the UI is consistent in both modes.
 */
export function apiErrorCode(e: unknown): string | null {
  if (e instanceof ApiError) return e.code;
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return KNOWN_CODES.find((c) => msg.includes(c)) ?? null;
}

/** Friendly message for a failed payment redeem. */
export function friendlyRedeemError(e: unknown): string {
  const code = apiErrorCode(e);
  if (code === 'validation_error') {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('your own')) return "You can't redeem your own payment.";
  }
  if (code && FRIENDLY[code]) return FRIENDLY[code];
  if (e instanceof ApiError && e.status === 410) return FRIENDLY.expired;
  return "Couldn't redeem that token. Try a fresh QR from the sender.";
}
