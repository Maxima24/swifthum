import crypto from 'node:crypto';
import { createId } from '@paralleldrive/cuid2';

export type IdPrefix =
  | 'u'
  | 'r'
  | 'e'
  | 'i'
  | 'tx'
  | 'ps'
  | 'sa'
  | 'sh'
  | 'so'
  | 'la' // LedgerAccount
  | 'lt' // LedgerTransaction
  | 'le' // LedgerEntry
  | 'g' // Gift
  | 'esc' // Escrow
  | 'rcpt'; // Receipt

export function prefixedId(prefix: IdPrefix): string {
  return `${prefix}_${createId()}`;
}

/**
 * High-entropy, single-use **claim code** for gift deep-links. Unlike a cuid2
 * (sortable, lower entropy) this is 16 random bytes → 22 url-safe base64 chars
 * (~128 bits), unguessable, and fits Telegram's 64-char `?start=` budget as
 * `gift_<code>`. It is the capability itself (server-authoritative, unique-
 * indexed on Gift.claimCode), so it must not be derivable from anything public.
 */
export function generateClaimCode(): string {
  return crypto
    .randomBytes(16)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
