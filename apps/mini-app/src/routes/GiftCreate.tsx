import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateGift } from '../hooks/gifts';
import { useWallet } from '../hooks/payments';
import { useBackButton } from '../hooks/useBackButton';
import { haptic, copyText, shareTelegramLink } from '../lib/tg';
import { formatNgn } from '../lib/format';
import { friendlySendError } from '../lib/errors';
import { QrDisplay } from '../components/QrDisplay';
import { Icon } from '../components/Icon';
import type { Gift } from '../types';
import { Header, Card, Button, AmountInput, Input } from '../ui';

type Stage = 'compose' | 'done';

const QUICK_AMOUNTS = [1000, 5000, 10000, 25000, 50000, 100000];

export function GiftCreate() {
  const navigate = useNavigate();
  const { data: wallet } = useWallet();
  const create = useCreateGift();

  const [stage, setStage] = useState<Stage>('compose');
  const [amountNgn, setAmountNgn] = useState('5000');
  const [message, setMessage] = useState('');
  const [gift, setGift] = useState<Gift | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useBackButton(useCallback(() => navigate('/pay'), [navigate]));

  const amountMinor = Math.round(parseFloat(amountNgn || '0') * 100);
  const isValid =
    amountMinor > 0 && !!wallet && amountMinor <= wallet.balanceMinor && !create.isPending;

  const handleCreate = useCallback(async () => {
    if (!isValid) return;
    haptic('medium');
    setError(null);
    try {
      const result = await create.mutateAsync({
        amountMinor,
        message: message.trim() || undefined,
      });
      setGift(result);
      setStage('done');
      haptic('success');
    } catch (e) {
      haptic('error');
      setError(friendlySendError(e));
    }
  }, [isValid, create, amountMinor, message]);

  const handleCopy = useCallback(async () => {
    if (!gift) return;
    haptic('light');
    const ok = await copyText(gift.deepLink);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [gift]);

  if (stage === 'done' && gift) {
    return (
      <>
        <Header
          back
          onBack={() => navigate('/pay')}
          title="Gift ready"
          subtitle={`${formatNgn(gift.amountMinor)} locked — share the link`}
        />

        <div className="flex flex-col gap-6 pt-5">
          <Card className="flex flex-col items-center gap-4">
            <QrDisplay value={gift.deepLink} size={200} />
            <p className="text-sm text-text-secondary text-center max-w-[16rem]">
              Whoever opens this link gets a SwiftHum wallet and{' '}
              <span className="font-semibold text-text-primary">{formatNgn(gift.amountMinor)}</span>.
            </p>
          </Card>

          <div className="flex flex-col gap-3">
            <Button
              size="lg"
              block
              icon="send"
              onClick={() => {
                haptic('medium');
                shareTelegramLink(gift.deepLink, gift.message || 'A SwiftHum gift for you 🎁');
              }}
            >
              Share via Telegram
            </Button>
            <Button variant="secondary" block onClick={() => void handleCopy()}>
              {copied ? 'Copied ✓' : 'Copy link'}
            </Button>
            <Button variant="ghost" block onClick={() => navigate('/pay/gifts/my')}>
              View my gifts
            </Button>
          </div>

          <p className="text-xs text-text-tertiary text-center px-2 leading-snug">
            Unclaimed gifts are refunded to your wallet automatically when they expire — or cancel
            anytime from “My gifts”.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        back
        onBack={() => navigate('/pay')}
        title="Send a Gift"
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
            Amount (₦)
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
            Message (optional)
          </p>
          <Input
            value={message}
            maxLength={140}
            placeholder="Happy birthday! 🎉"
            onChange={(e) => setMessage(e.target.value)}
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
            {create.isPending ? 'Creating…' : 'Create gift link'}
          </Button>
          <Button variant="ghost" block onClick={() => navigate('/pay')}>
            Cancel
          </Button>
        </div>
      </div>
    </>
  );
}
