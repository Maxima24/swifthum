import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMyEscrows } from '../hooks/escrow';
import { useBackButton } from '../hooks/useBackButton';
import { haptic } from '../lib/tg';
import { formatNgn, formatRelativeTime } from '../lib/format';
import { ESCROW_STATE_META } from '../lib/escrowState';
import { Header, Card, Button, Badge, Spinner, EmptyState } from '../ui';

export function EscrowList() {
  const navigate = useNavigate();
  const { data, isLoading } = useMyEscrows();

  useBackButton(useCallback(() => navigate('/pay'), [navigate]));

  const items = data?.items ?? [];

  return (
    <>
      <Header
        back
        onBack={() => navigate('/pay')}
        title="Escrow"
        subtitle="Money held safely until both sides agree"
        right={
          <Button variant="ghost" onClick={() => navigate('/pay/escrow/new')}>
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
          icon="check-circle"
          title="No escrows yet"
          description="Lock NGN into an escrow and share the invite — funds release only when you're both happy."
          action={<Button onClick={() => navigate('/pay/escrow/new')}>New escrow</Button>}
        />
      ) : (
        <div className="flex flex-col gap-3 pt-5">
          {items.map((e) => {
            const meta = ESCROW_STATE_META[e.state];
            return (
              <button
                key={e.id}
                className="text-left w-full"
                onClick={() => {
                  haptic('light');
                  navigate(`/pay/escrow/${e.id}`);
                }}
              >
                <Card className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-display text-[22px] font-bold tracking-[-0.01em] tnum text-text-primary">
                      {formatNgn(e.amountMinor)}
                    </span>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                  </div>
                  <p className="text-[13px] text-text-tertiary">
                    {e.role === 'buyer' ? 'You’re buying' : 'You’re selling'}
                    {e.counterparty ? ` · ${e.counterparty.displayName}` : ''} ·{' '}
                    {formatRelativeTime(e.createdAt)}
                  </p>
                  {e.terms && (
                    <p className="text-sm text-text-secondary leading-snug truncate">{e.terms}</p>
                  )}
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
