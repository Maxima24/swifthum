import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useCreateIntent, useWallet } from '../hooks/payments';
import { useBackButton } from '../hooks/useBackButton';
import { useMainButton } from '../hooks/useMainButton';
import { haptic } from '../lib/tg';
import { formatNgn } from '../lib/format';
import { encode, initGgwave, playSamples } from '../lib/ggwave';
import { QrDisplay } from '../components/QrDisplay';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';
import type { PaymentIntent } from '../types';

type Stage = 'amount' | 'broadcast' | 'done';
type Mode = 'sound' | 'qr';

export function Send() {
  const navigate = useNavigate();
  const { data: wallet } = useWallet();
  const create = useCreateIntent();
  const [stage, setStage] = useState<Stage>('amount');
  const [amountNgn, setAmountNgn] = useState<string>('5000');
  const [mode, setMode] = useState<Mode>('sound');
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [soundReady, setSoundReady] = useState(false);
  const [soundError, setSoundError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(30);

  const amountMinor = Math.round(parseFloat(amountNgn || '0') * 100);
  const isValid =
    amountMinor > 0 &&
    !!wallet &&
    amountMinor <= wallet.balanceMinor &&
    !create.isPending;

  useBackButton(useCallback(() => navigate('/pay'), [navigate]));

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
    onClick: stage === 'amount' ? start : () => navigate('/pay'),
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
      <div className="flex flex-col pb-10 lg:pb-16 lg:max-w-xl lg:mx-auto">
        <Header
          back
          onBack={() => navigate('/pay')}
          eyebrow="Send"
          title="How much?"
          subtitle={
            wallet ? (
              <span className="inline-flex items-center gap-1 text-[12px]">
                Balance{' '}
                <span className="text-tg-text font-semibold tabular-nums">
                  {formatNgn(wallet.balanceMinor)}
                </span>
              </span>
            ) : null
          }
        />

        <div className="flex flex-col gap-5 pt-5">
          <label className="block space-y-2">
            <span className="text-[11px] font-semibold text-tg-hint uppercase tracking-[0.12em]">
              Amount (₦)
            </span>
            <input
              type="number"
              inputMode="decimal"
              value={amountNgn}
              onChange={(e) => setAmountNgn(e.target.value)}
              className="w-full rounded-2xl bg-tg-secondary-bg ring-1 ring-black/5 px-4 py-6 text-4xl font-semibold text-center tabular-nums outline-none focus:ring-2 focus:ring-tg-button"
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            {[1000, 5000, 10000, 25000, 50000, 100000].map((v) => (
              <button
                key={v}
                onClick={() => {
                  haptic('light');
                  setAmountNgn(String(v));
                }}
                className="rounded-xl bg-tg-secondary-bg ring-1 ring-black/5 py-2.5 text-sm font-medium active:scale-95 transition-transform"
              >
                ₦{v.toLocaleString()}
              </button>
            ))}
          </div>

          <button
            onClick={start}
            disabled={!isValid}
            className="w-full rounded-2xl bg-gradient-to-br from-brand-from to-brand-to text-white px-6 py-4 font-semibold shadow-lg shadow-brand-from/30 disabled:opacity-40 active:scale-[0.98] transition-transform"
          >
            {create.isPending ? 'Creating…' : 'Generate token'}
          </button>

          <button
            onClick={() => {
              haptic('light');
              navigate('/pay');
            }}
            className="rounded-xl bg-tg-secondary-bg ring-1 ring-black/5 py-3 font-medium active:scale-[0.98] transition-transform"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col pb-10 lg:pb-16 lg:max-w-xl lg:mx-auto">
      <Header
        back
        onBack={() => navigate('/pay')}
        eyebrow="Broadcasting"
        title={formatNgn(amountMinor)}
        subtitle={
          <span className="text-[12px]">
            {stage === 'done' ? 'Token expired' : `Expires in ${secondsLeft}s`}
          </span>
        }
      />

      <div className="flex flex-col gap-5 pt-5">
        <div className="grid grid-cols-2 gap-1 rounded-full bg-tg-secondary-bg ring-1 ring-black/5 p-1">
          {(['sound', 'qr'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                haptic('light');
                setMode(m);
              }}
              className={`relative rounded-full py-2 text-sm font-medium transition-colors ${
                mode === m ? 'text-tg-text' : 'text-tg-hint'
              }`}
            >
              {mode === m && (
                <motion.span
                  layoutId="send-mode"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  className="absolute inset-0 rounded-full bg-tg-bg shadow-sm shadow-black/5 ring-1 ring-black/5 -z-10"
                />
              )}
              <span className="inline-flex items-center gap-1.5">
                <Icon name={m === 'sound' ? 'speaker' : 'qr'} size={14} />
                {m === 'sound' ? 'Sound' : 'QR code'}
              </span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {mode === 'sound' ? (
            <motion.div
              key="sound"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="rounded-3xl bg-tg-secondary-bg ring-1 ring-black/5 p-8 flex flex-col items-center gap-5 min-h-[260px] justify-center"
            >
              {soundError ? (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Icon name="alert" size={28} />
                  </div>
                  <p className="text-sm text-tg-hint text-center max-w-xs">{soundError}</p>
                  <button
                    onClick={() => {
                      haptic('light');
                      setMode('qr');
                    }}
                    className="rounded-xl bg-tg-button text-tg-button-text px-5 py-2 text-sm font-semibold"
                  >
                    Switch to QR
                  </button>
                </>
              ) : (
                <>
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <motion.span
                      animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                      className="absolute inset-0 rounded-full bg-brand-from/25"
                    />
                    <motion.span
                      animate={{ scale: [1, 1.4], opacity: [0.4, 0] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut', delay: 0.4 }}
                      className="absolute inset-2 rounded-full bg-brand-to/25"
                    />
                    <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-brand-from to-brand-to text-white flex items-center justify-center shadow-lg shadow-brand-from/40">
                      <Icon name="speaker" size={28} />
                    </div>
                  </div>
                  <p className="text-sm text-tg-hint text-center max-w-xs leading-snug">
                    {soundReady
                      ? 'Broadcasting ultrasonic chirp. Keep receiver within ~6 feet.'
                      : 'Warming up audio…'}
                  </p>
                </>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="qr"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="rounded-3xl bg-tg-secondary-bg ring-1 ring-black/5 p-6 flex flex-col items-center gap-4"
            >
              {intent && <QrDisplay value={intent.token} size={220} />}
              <p className="text-sm text-tg-hint text-center max-w-xs">
                Receiver opens Pay → Receive → Scan QR.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => {
            haptic('light');
            navigate('/pay');
          }}
          className="rounded-xl bg-tg-secondary-bg ring-1 ring-black/5 py-3 font-medium active:scale-[0.98] transition-transform"
        >
          Done
        </button>
      </div>
    </div>
  );
}
