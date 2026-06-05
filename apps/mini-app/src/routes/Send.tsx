import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useCreateIntent,
  useWallet,
  useCancelIntent,
  useIntentStatus,
} from '../hooks/payments';
import { useBackButton } from '../hooks/useBackButton';
import { useMainButton } from '../hooks/useMainButton';
import { haptic } from '../lib/tg';
import { formatNgn } from '../lib/format';
import { encode, initGgwave, playSamples } from '../lib/ggwave';
import { friendlySendError } from '../lib/errors';
import { QrDisplay } from '../components/QrDisplay';
import { Icon } from '../components/Icon';
import type { PaymentIntent } from '../types';
import {
  Header,
  Card,
  Button,
  Segmented,
  AmountInput,
  Spinner,
  EmptyState,
} from '../ui';

type Stage = 'amount' | 'broadcast' | 'done';
type Mode = 'sound' | 'qr';

const QUICK_AMOUNTS = [1000, 5000, 10000, 25000, 50000, 100000];

function initialAmountFromQuery(searchParams: URLSearchParams): string {
  const raw = searchParams.get('amount');
  if (!raw) return '5000';
  const minor = Number(raw);
  if (!Number.isInteger(minor) || minor <= 0 || minor > 100_000_00) return '5000';
  return String(minor / 100);
}

export function Send() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: wallet } = useWallet();
  const create = useCreateIntent();
  const cancel = useCancelIntent();
  const [stage, setStage] = useState<Stage>('amount');
  const [amountNgn, setAmountNgn] = useState<string>(() =>
    initialAmountFromQuery(searchParams),
  );
  const [mode, setMode] = useState<Mode>('sound');
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [soundReady, setSoundReady] = useState(false);
  const [soundError, setSoundError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(30);

  // Poll the intent so the sender sees the receiver's scan land in real time.
  const { data: status } = useIntentStatus(intent?.intentId, stage === 'broadcast');
  const paid = status?.status === 'completed';
  const receiverName = status?.counterparty?.displayName;

  useEffect(() => {
    if (paid) haptic('success');
  }, [paid]);

  const amountMinor = Math.round(parseFloat(amountNgn || '0') * 100);
  const isValid =
    amountMinor > 0 && !!wallet && amountMinor <= wallet.balanceMinor && !create.isPending;

  const start = useCallback(async () => {
    if (!isValid) return;
    haptic('medium');
    setCreateError(null);
    try {
      const result = await create.mutateAsync({ amountMinor });
      setIntent(result);
      setStage('broadcast');
    } catch (e) {
      haptic('error');
      setCreateError(friendlySendError(e));
    }
  }, [isValid, create, amountMinor]);

  // Leaving an unredeemed payment refunds the reservation immediately. Cancelling
  // a completed (or already-refunded) intent is a safe no-op the backend rejects.
  const cancelAndLeave = useCallback(async () => {
    haptic('light');
    if (intent && status?.status !== 'completed') {
      try {
        await cancel.mutateAsync(intent.intentId);
      } catch {
        /* already redeemed / refunded — ignore */
      }
    }
    navigate('/pay');
  }, [intent, status, cancel, navigate]);

  useBackButton(useCallback(() => void cancelAndLeave(), [cancelAndLeave]));

  useMainButton({
    text:
      stage === 'amount'
        ? create.isPending
          ? 'Creating…'
          : 'Generate'
        : paid
          ? 'Done'
          : 'Cancel & refund',
    isEnabled: stage === 'amount' ? isValid : true,
    onClick:
      stage === 'amount' ? start : paid ? () => navigate('/pay') : () => void cancelAndLeave(),
  });

  useEffect(() => {
    if (stage !== 'broadcast' || !intent || paid) return;
    const expiresAt = new Date(intent.expiresAt).getTime();
    const tick = () => {
      const s = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setSecondsLeft(s);
      if (s <= 0) setStage('done');
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [stage, intent, paid]);

  useEffect(() => {
    if (stage !== 'broadcast' || mode !== 'sound' || !intent || paid) return;
    let cancelled = false;
    let ctx: AudioContext | null = null;

    (async () => {
      const ok = await initGgwave();
      if (!ok) {
        if (!cancelled) setSoundError('Sound mode unavailable — switch to QR.');
        return;
      }
      if (cancelled) return;
      setSoundReady(true);
      ctx = new AudioContext();
      const samples = encode(intent.token);
      if (!samples) {
        setSoundError('Encoding failed.');
        return;
      }
      while (!cancelled && Date.now() < new Date(intent.expiresAt).getTime()) {
        await playSamples(samples, ctx);
        await new Promise((r) => setTimeout(r, 1200));
      }
    })();

    return () => {
      cancelled = true;
      ctx?.close().catch(() => {});
    };
  }, [stage, mode, intent, paid]);

  if (stage === 'amount') {
    return (
      <>
        <Header
          back
          onBack={() => void cancelAndLeave()}
          title="Send"
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
                if (createError) setCreateError(null);
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

          {createError && (
            <Card padded={false} className="p-3 bg-danger-soft border-0 flex items-start gap-2">
              <Icon name="alert" size={16} className="shrink-0 mt-0.5 text-danger" />
              <span className="text-sm text-danger">{createError}</span>
            </Card>
          )}

          <div className="flex flex-col gap-3">
            <Button size="lg" block disabled={!isValid} onClick={start}>
              {create.isPending ? 'Creating…' : 'Generate token'}
            </Button>
            <Button variant="ghost" block onClick={() => void cancelAndLeave()}>
              Cancel
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        back
        onBack={() => void cancelAndLeave()}
        title={formatNgn(amountMinor)}
        subtitle={
          paid
            ? receiverName
              ? `Received by ${receiverName}`
              : 'Received'
            : stage === 'done'
              ? 'Token expired'
              : `Expires in ${secondsLeft}s`
        }
      />

      {paid ? (
        <div className="flex flex-col items-center text-center pt-12 gap-6">
          <span className="w-20 h-20 rounded-full bg-success-soft text-success flex items-center justify-center">
            <Icon name="check" size={40} strokeWidth={3} />
          </span>
          <div>
            <p className="font-display text-[34px] font-bold tracking-[-0.02em] tnum text-text-primary">
              {formatNgn(amountMinor)}
            </p>
            <p className="text-sm text-text-secondary mt-1">
              {receiverName ? `Received by ${receiverName}.` : 'Received.'}
            </p>
          </div>
          <Button size="lg" onClick={() => navigate('/pay')}>
            Done
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6 pt-5">
          <Segmented<Mode>
            value={mode}
            onChange={(m) => {
              haptic('light');
              setMode(m);
            }}
            options={[
              { value: 'sound', label: 'Sound', icon: 'speaker' },
              { value: 'qr', label: 'QR code', icon: 'qr' },
            ]}
          />

          {mode === 'sound' ? (
            <Card padded={false} className="p-8 min-h-[280px] flex items-center justify-center">
              {soundError ? (
                <EmptyState
                  icon="alert"
                  title="Sound unavailable"
                  description={soundError}
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => {
                        haptic('light');
                        setMode('qr');
                      }}
                    >
                      Switch to QR
                    </Button>
                  }
                />
              ) : (
                <div className="flex flex-col items-center gap-5 text-center">
                  <span className="w-20 h-20 rounded-full bg-accent-soft text-accent flex items-center justify-center">
                    <Icon name="speaker" size={32} />
                  </span>
                  <div className="flex items-center gap-2 text-text-secondary">
                    {soundReady && <Spinner size={16} />}
                    <p className="text-sm max-w-[16rem] leading-snug">
                      {soundReady
                        ? 'Broadcasting ultrasonic chirp. Keep the receiver within ~6 feet.'
                        : 'Warming up audio…'}
                    </p>
                  </div>
                </div>
              )}
            </Card>
          ) : (
            <Card className="flex flex-col items-center gap-4">
              {intent && <QrDisplay value={intent.token} size={220} />}
              <p className="text-sm text-text-secondary text-center max-w-[16rem]">
                Receiver opens Pay → Receive → Scan QR.
              </p>
            </Card>
          )}

          <p className="text-xs text-text-tertiary text-center px-2 leading-snug">
            {formatNgn(amountMinor)} is reserved — instantly refunded if you cancel or it isn’t
            received.
          </p>

          <Button
            variant="secondary"
            block
            disabled={cancel.isPending}
            onClick={() => void cancelAndLeave()}
          >
            {cancel.isPending ? 'Refunding…' : 'Cancel & refund'}
          </Button>
        </div>
      )}
    </>
  );
}
