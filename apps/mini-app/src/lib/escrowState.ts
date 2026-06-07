import type { EscrowState } from '../types';

type Tone = 'accent' | 'success' | 'warning' | 'danger' | 'muted';

/** Display label + badge tone per escrow state (shared by list + detail). */
export const ESCROW_STATE_META: Record<EscrowState, { label: string; tone: Tone }> = {
  PROPOSED: { label: 'Proposed', tone: 'accent' },
  ACCEPTED: { label: 'Accepted', tone: 'accent' },
  PAID_MARKED: { label: 'Awaiting release', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  DECLINED: { label: 'Declined', tone: 'muted' },
  CANCELLED: { label: 'Cancelled', tone: 'muted' },
  EXPIRED: { label: 'Expired', tone: 'muted' },
  DISPUTED: { label: 'Disputed', tone: 'danger' },
  RESOLVED_RELEASED: { label: 'Resolved · released', tone: 'success' },
  RESOLVED_REFUNDED: { label: 'Resolved · refunded', tone: 'muted' },
};
