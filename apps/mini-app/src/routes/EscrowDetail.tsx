import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEscrow, useEscrowAction } from '../hooks/escrow';
import { useBackButton } from '../hooks/useBackButton';
import { haptic, copyText, shareTelegramLink } from '../lib/tg';
import { formatNgn } from '../lib/format';
import { friendlySendError } from '../lib/errors';
import { ESCROW_STATE_META } from '../lib/escrowState';
import { Icon } from '../components/Icon';
import type { EscrowAction, EscrowDetail as EscrowDetailT } from '../types';
import { Header, Card, Button, Badge, Spinner, EmptyState } from '../ui';

/** Available actions for the viewer, derived from role + state (server still enforces). */
function actionsFor(e: EscrowDetailT): { action: EscrowAction; label: string; variant?: 'secondary' | 'danger' }[] {
  const { role, state } = e;
  if (role === 'buyer' && state === 'PROPOSED') return [{ action: 'cancel', label: 'Cancel & refund', variant: 'danger' }];
  if (role === 'seller' && state === 'PROPOSED')
    return [
      { action: 'accept', label: 'Accept' },
      { action: 'decline', label: 'Decline', variant: 'danger' },
    ];
  if (role === 'buyer' && state === 'ACCEPTED')
    return [
      { action: 'mark-paid', label: 'Mark as paid' },
      { action: 'dispute', label: 'Open dispute', variant: 'secondary' },
    ];
  if (role === 'seller' && state === 'PAID_MARKED')
    return [
      { action: 'release', label: 'Release funds' },
      { action: 'dispute', label: 'Open dispute', variant: 'secondary' },
    ];
  if (state === 'ACCEPTED' || state === 'PAID_MARKED')
    return [{ action: 'dispute', label: 'Open dispute', variant: 'secondary' }];
  return [];
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function remaining(ttlExpiresAt: string, now: number): string {
  const ms = new Date(ttlExpiresAt).getTime() - now;
  if (ms <= 0) return 'expired';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

export function EscrowDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { data: escrow, isLoading } = useEscrow(id);
  const act = useEscrowAction(id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const now = useNow(1000);

  useBackButton(useCallback(() => navigate('/pay/escrow'), [navigate]));

  const runAction = useCallback(
    async (action: EscrowAction) => {
      haptic('medium');
      setError(null);
      try {
        await act.mutateAsync(action);
        haptic('success');
      } catch (e) {
        haptic('error');
        setError(friendlySendError(e));
      }
    },
    [act],
  );

  if (isLoading) {
    return (
      <>
        <Header back onBack={() => navigate('/pay/escrow')} title="Escrow" />
        <div className="flex justify-center pt-16">
          <Spinner />
        </div>
      </>
    );
  }
  if (!escrow) {
    return (
      <>
        <Header back onBack={() => navigate('/pay/escrow')} title="Escrow" />
        <EmptyState icon="alert" title="Not found" description="This escrow doesn't exist or isn't yours." />
      </>
    );
  }

  const meta = ESCROW_STATE_META[escrow.state];
  const actions = actionsFor(escrow);
  const showCountdown = escrow.state === 'PROPOSED';

  return (
    <>
      <Header
        back
        onBack={() => navigate('/pay/escrow')}
        title={formatNgn(escrow.amountMinor)}
        subtitle={escrow.role === 'buyer' ? 'You’re buying' : escrow.role === 'seller' ? 'You’re selling' : 'Escrow'}
      />

      <div className="flex flex-col gap-5 pt-5">
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Status</span>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          {escrow.counterparty && (
            <Row label={escrow.role === 'buyer' ? 'Seller' : 'Buyer'} value={escrow.counterparty.displayName} />
          )}
          {escrow.terms && <Row label="Terms" value={escrow.terms} />}
          {showCountdown && <Row label="Expires in" value={remaining(escrow.ttlExpiresAt, now)} />}
        </Card>

        {escrow.deepLink && escrow.state === 'PROPOSED' && (
          <Card className="flex flex-col gap-3">
            <p className="text-sm text-text-secondary">Invite the other party to this escrow.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  haptic('medium');
                  shareTelegramLink(escrow.deepLink!, 'Let’s use a SwiftHum escrow 🛡');
                }}
              >
                Share invite
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  haptic('light');
                  if (await copyText(escrow.deepLink!)) {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }
                }}
              >
                {copied ? 'Copied ✓' : 'Copy link'}
              </Button>
            </div>
          </Card>
        )}

        {error && (
          <Card padded={false} className="p-3 bg-danger-soft border-0 flex items-start gap-2">
            <Icon name="alert" size={16} className="shrink-0 mt-0.5 text-danger" />
            <span className="text-sm text-danger">{error}</span>
          </Card>
        )}

        {actions.length > 0 && (
          <div className="flex flex-col gap-3">
            {actions.map((a) => (
              <Button
                key={a.action}
                size="lg"
                block
                variant={a.variant}
                disabled={act.isPending}
                onClick={() => void runAction(a.action)}
              >
                {act.isPending ? 'Working…' : a.label}
              </Button>
            ))}
          </div>
        )}

        {escrow.state === 'DISPUTED' && (
          <p className="text-xs text-text-tertiary text-center px-2 leading-snug">
            This escrow is under dispute. Funds stay locked in escrow until an admin resolves it.
          </p>
        )}

        <Timeline events={escrow.events} />
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-text-tertiary shrink-0">{label}</span>
      <span className="text-[15px] font-semibold text-text-primary text-right">{value}</span>
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = {
  proposed: 'Created & funded',
  joined: 'Counterparty joined',
  accepted: 'Accepted',
  declined: 'Declined — refunded',
  cancelled: 'Cancelled — refunded',
  paid_marked: 'Buyer marked paid',
  released: 'Released to seller',
  disputed: 'Dispute opened',
  resolved_released: 'Resolved — released',
  resolved_refunded: 'Resolved — refunded',
  expired: 'Expired — refunded',
};

function Timeline({ events }: { events: EscrowDetailT['events'] }) {
  if (!events || events.length === 0) return null;
  return (
    <div>
      <p className="px-1 mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-text-tertiary">
        Timeline
      </p>
      <Card className="flex flex-col gap-3">
        {events.map((e, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
            <span className="text-sm text-text-primary flex-1">{EVENT_LABEL[e.type] ?? e.type}</span>
            <span className="text-xs text-text-tertiary">
              {new Date(e.createdAt).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}
