import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCreateIntent, useWallet } from '../hooks/payments';
import { useBackButton } from '../hooks/useBackButton';
import { useMainButton } from '../hooks/useMainButton';
import { haptic } from '../lib/tg';
import { formatNgn } from '../lib/format';
import { encode, initGgwave, playSamples } from '../lib/ggwave';
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
  const [stage, setStage] = useState<Stage>('amount');
  const [amountNgn, setAmountNgn] = useState<string>(() =>
    initialAmountFromQuery(searchParams),
  );
  const [mode, setMode] = useState<Mode>('sound');
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [soundReady, setSoundReady] = useState(false);
  const [soundError, setSoundError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(30);

  const amountMinor = Math.round(parseFloat(amountNgn || '0') * 100);
  const isValid =
    amountMinor > 0 && !!wallet && amountMinor <= wallet.balanceMinor && !create.isPending;

  const goBack = useCallback(() => navigate('/pay'), [navigate]);
  useBackButton(goBack);

  const start = useCallback(async () => {
    if (!isValid) return;
    haptic('medium');
    try {
      const result = await create.mutateAsync({ amountMinor });
      setIntent(result);
      setStage('broadcast');
    } catch {
      haptic('error');
    }
  }, [isValid, create, amountMinor]);

  useMainButton({
    text: stage === 'amount' ? (create.isPending ? 'Creating…' : 'Generate') : 'Done',
    isEnabled: stage === 'amount' ? isValid : true,
    onClick: stage === 'amount' ? start : goBack,
  });

  useEffect(() => {
    if (stage !== 'broadcast' || !intent) return;
    const expiresAt = new Date(intent.expiresAt).getTime();
    const tick = () => {
      const s = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setSecondsLeft(s);
      if (s <= 0) setStage('done');
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [stage, intent]);

  useEffect(() => {
    if (stage !== 'broadcast' || mode !== 'sound' || !intent) return;
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
  }, [stage, mode, intent]);

  if (stage === 'amount') {
    return (
      <>
        <Header
          back
          onBack={goBack}
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
              onChange={(e) => setAmountNgn(e.target.value)}
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

          <div className="flex flex-col gap-3">
            <Button size="lg" block disabled={!isValid} onClick={start}>
              {create.isPending ? 'Creating…' : 'Generate token'}
            </Button>
            <Button variant="ghost" block onClick={goBack}>
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
        onBack={goBack}
        title={formatNgn(amountMinor)}
        subtitle={stage === 'done' ? 'Token expired' : `Expires in ${secondsLeft}s`}
      />

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
                <div className="relative w-24 h-24 flex items-center justify-center">
                  <span className="w-20 h-20 rounded-full bg-accent-soft text-accent flex items-center justify-center">
                    <Icon name="speaker" size={32} />
                  </span>
                </div>
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

        <Button variant="secondary" block onClick={goBack}>
          Done
        </Button>
      </div>
    </>
  );
}
