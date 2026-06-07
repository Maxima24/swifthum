import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateEscrow } from '../hooks/escrow';
import { useWallet } from '../hooks/payments';
import { useBackButton } from '../hooks/useBackButton';
import { haptic, copyText, shareTelegramLink } from '../lib/tg';
import { formatNgn } from '../lib/format';
import { friendlySendError } from '../lib/errors';
import { QrDisplay } from '../components/QrDisplay';
import { Icon } from '../components/Icon';
import type { EscrowCreated } from '../types';
import { Header, Card, Button, AmountInput, Input } from '../ui';

type Stage = 'compose' | 'done';

const QUICK_AMOUNTS = [5000, 10000, 25000, 50000, 100000];

export function EscrowCreate() {
  const navigate = useNavigate();
  const { data: wallet } = useWallet();
  const create = useCreateEscrow();

  const [stage, setStage] = useState<Stage>('compose');
  const [amountNgn, setAmountNgn] = useState('10000');
  const [terms, setTerms] = useState('');
  const [escrow, setEscrow] = useState<EscrowCreated | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useBackButton(useCallback(() => navigate('/pay/escrow'), [navigate]));

  const amountMinor = Math.round(parseFloat(amountNgn || '0') * 100);
  const isValid =
    amountMinor > 0 && !!wallet && amountMinor <= wallet.balanceMinor && !create.isPending;

  const handleCreate = useCallback(async () => {
    if (!isValid) return;
    haptic('medium');
    setError(null);
    try {
      const result = await create.mutateAsync({ amountMinor, terms: terms.trim() || undefined });
      setEscrow(result);
      setStage('done');
      haptic('success');
    } catch (e) {
      haptic('error');
      setError(friendlySendError(e));
    }
  }, [isValid, create, amountMinor, terms]);

  const handleCopy = useCallback(async () => {
    if (!escrow) return;
    haptic('light');
    if (await copyText(escrow.deepLink)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [escrow]);

  if (stage === 'done' && escrow) {
    return (
      <>
        <Header
          back
          onBack={() => navigate('/pay/escrow')}
          title="Escrow created"
          subtitle={`${formatNgn(escrow.amountMinor)} locked — invite the other party`}
        />
        <div className="flex flex-col gap-6 pt-5">
          <Card className="flex flex-col items-center gap-4">
            <QrDisplay value={escrow.deepLink} size={200} />
            <p className="text-sm text-text-secondary text-center max-w-[16rem]">
              Whoever opens this link becomes the seller and can Accept. The{' '}
              <span className="font-semibold text-text-primary">{formatNgn(escrow.amountMinor)}</span>{' '}
              stays locked until you both complete the deal.
            </p>
          </Card>
          <div className="flex flex-col gap-3">
            <Button
              size="lg"
              block
              icon="send"
              onClick={() => {
                haptic('medium');
                shareTelegramLink(escrow.deepLink, 'Let’s use a SwiftHum escrow 🛡');
              }}
            >
              Share invite
            </Button>
            <Button variant="secondary" block onClick={() => void handleCopy()}>
              {copied ? 'Copied ✓' : 'Copy link'}
            </Button>
            <Button variant="ghost" block onClick={() => navigate(`/pay/escrow/${escrow.escrowId}`)}>
              View escrow
            </Button>
          </div>
          <p className="text-xs text-text-tertiary text-center px-2 leading-snug">
            If nobody joins before it expires, the funds are refunded to your wallet automatically.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        back
        onBack={() => navigate('/pay/escrow')}
        title="New escrow"
        subtitle={
          wallet ? (
            <span className="tnum">
              Balance{' '}
              <span className="font-semibold text-text-primary">
                {formatNgn(wallet.balanceMinor)}
              </span>
            </span>
          ) : null
        }
      />
      <div className="flex flex-col gap-6 pt-5">
        <div>
          <p className="px-1 mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-text-tertiary">
            Amount to lock (₦)
          </p>
          <AmountInput
            type="number"
            inputMode="decimal"
            value={amountNgn}
            onChange={(e) => {
              setAmountNgn(e.target.value);
              if (error) setError(null);
            }}
          />
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {QUICK_AMOUNTS.map((v) => (
            <Button
              key={v}
              variant="secondary"
              onClick={() => {
                haptic('light');
                setAmountNgn(String(v));
              }}
            >
              ₦{v.toLocaleString()}
            </Button>
          ))}
        </div>

        <div>
          <p className="px-1 mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-text-tertiary">
            What's the deal? (optional)
          </p>
          <Input
            value={terms}
            maxLength={280}
            placeholder="e.g. iPhone 13, deliver by Friday"
            onChange={(e) => setTerms(e.target.value)}
          />
        </div>

        {error && (
          <Card padded={false} className="p-3 bg-danger-soft border-0 flex items-start gap-2">
            <Icon name="alert" size={16} className="shrink-0 mt-0.5 text-danger" />
            <span className="text-sm text-danger">{error}</span>
          </Card>
        )}

        <div className="flex flex-col gap-3">
          <Button size="lg" block disabled={!isValid} onClick={() => void handleCreate()}>
            {create.isPending ? 'Locking…' : 'Lock funds & create'}
          </Button>
          <Button variant="ghost" block onClick={() => navigate('/pay/escrow')}>
            Cancel
          </Button>
        </div>
      </div>
    </>
  );
}
