import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCancelGift, useMyGifts } from '../hooks/gifts';
import { useBackButton } from '../hooks/useBackButton';
import { haptic, copyText, shareTelegramLink } from '../lib/tg';
import { formatNgn, formatRelativeTime } from '../lib/format';
import { Header, Card, Button, Badge, Spinner, EmptyState } from '../ui';
import type { GiftListItem, GiftState } from '../types';

const STATE_META: Record<GiftState, { label: string; tone: 'accent' | 'success' | 'muted' }> = {
  UNCLAIMED: { label: 'Unclaimed', tone: 'accent' },
  CLAIMED: { label: 'Claimed', tone: 'success' },
  EXPIRED: { label: 'Expired', tone: 'muted' },
  RECLAIMED: { label: 'Reclaimed', tone: 'muted' },
};

function subtitleFor(g: GiftListItem): string {
  switch (g.state) {
    case 'CLAIMED':
      return `Claimed by ${g.claimedBy?.displayName ?? 'someone'} · ${formatRelativeTime(g.claimedAt)}`;
    case 'EXPIRED':
      return 'Expired — refunded to your wallet';
    case 'RECLAIMED':
      return 'Cancelled — refunded to your wallet';
    default:
      return `Created ${formatRelativeTime(g.createdAt)}`;
  }
}

export function GiftList() {
  const navigate = useNavigate();
  const { data, isLoading } = useMyGifts();
  const cancel = useCancelGift();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useBackButton(useCallback(() => navigate('/pay'), [navigate]));

  const handleCopy = useCallback(async (g: GiftListItem) => {
    haptic('light');
    if (await copyText(g.deepLink)) {
      setCopiedId(g.id);
      setTimeout(() => setCopiedId((c) => (c === g.id ? null : c)), 1500);
    }
  }, []);

  const handleCancel = useCallback(
    async (g: GiftListItem) => {
      haptic('medium');
      try {
        await cancel.mutateAsync(g.id);
        haptic('success');
      } catch {
        haptic('error');
      }
    },
    [cancel],
  );

  const items = data?.items ?? [];

  return (
    <>
      <Header
        back
        onBack={() => navigate('/pay')}
        title="My gifts"
        right={
          <Button variant="ghost" onClick={() => navigate('/pay/gifts')}>
            New
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center pt-16">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="send"
          title="No gifts yet"
          description="Lock some naira into a link and share it — whoever opens it gets onboarded instantly."
          action={<Button onClick={() => navigate('/pay/gifts')}>Send a gift</Button>}
        />
      ) : (
        <div className="flex flex-col gap-3 pt-5">
          {items.map((g) => {
            const meta = STATE_META[g.state];
            return (
              <Card key={g.id} className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display text-[22px] font-bold tracking-[-0.01em] tnum text-text-primary">
                    {formatNgn(g.amountMinor)}
                  </span>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
                {g.message && (
                  <p className="text-sm text-text-secondary leading-snug">“{g.message}”</p>
                )}
                <p className="text-[13px] text-text-tertiary">{subtitleFor(g)}</p>

                {g.state === 'UNCLAIMED' && (
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        haptic('medium');
                        shareTelegramLink(g.deepLink, g.message || 'A SwiftHum gift for you 🎁');
                      }}
                    >
                      Share
                    </Button>
                    <Button variant="secondary" onClick={() => void handleCopy(g)}>
                      {copiedId === g.id ? 'Copied ✓' : 'Copy'}
                    </Button>
                    <Button
                      variant="danger"
                      disabled={cancel.isPending}
                      onClick={() => void handleCancel(g)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
