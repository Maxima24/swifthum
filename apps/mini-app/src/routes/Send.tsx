import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useCreateIntent, useWallet, useCancelIntent, useIntentStatus } from '../hooks/payments';
import { useBackButton } from '../hooks/useBackButton';
import { useMainButton } from '../hooks/useMainButton';
import { haptic } from '../lib/tg';
import { formatNgn } from '../lib/format';
import { encode, initGgwave, playSamples } from '../lib/ggwave';
import { friendlySendError } from '../lib/errors';
import { QrDisplay } from '../components/QrDisplay';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';
import type { PaymentIntent } from '../types';

type Stage = 'amount' | 'broadcast' | 'done';
type Mode = 'sound' | 'qr';

/**
 * Lazy initial amount from `?amount=<kobo>` query param (used by the bot's NL
 * parse deep link). Falls back to '5000' for any malformed/out-of-range input.
 */
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
  const [amountNgn, setAmountNgn] = useState<string>(() => initialAmountFromQuery(searchParams));
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
    amountMinor > 0 &&
    !!wallet &&
    amountMinor <= wallet.balanceMinor &&
    !create.isPending;

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
      <div className="flex flex-col px-5 pb-10 lg:pb-16">
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
              onChange={(e) => {
                setAmountNgn(e.target.value);
                if (createError) setCreateError(null);
              }}
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

          {createError && (
            <div className="rounded-2xl bg-red-50 text-red-700 ring-1 ring-red-200 p-3 text-sm flex items-start gap-2">
              <Icon name="alert" size={16} className="shrink-0 mt-0.5" />
              <span>{createError}</span>
            </div>
          )}

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
    <div className="flex flex-col px-5 pb-10 lg:pb-16">
      <Header
        back
        onBack={() => void cancelAndLeave()}
        eyebrow={paid ? 'Sent' : 'Broadcasting'}
        title={formatNgn(amountMinor)}
        subtitle={
          <span className="text-[12px]">
            {paid
              ? receiverName
                ? `Received by ${receiverName}`
                : 'Received'
              : stage === 'done'
                ? 'Token expired'
                : `Expires in ${secondsLeft}s`}
          </span>
        }
      />

      {paid ? (
        <div className="flex flex-col gap-5 pt-5">
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-3xl bg-tg-secondary-bg ring-1 ring-black/5 p-8 flex flex-col items-center gap-4 min-h-[260px] justify-center"
          >
            <motion.div
              initial={{ scale: 0.6 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 15 }}
              className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center shadow-xl shadow-emerald-500/40"
            >
              <Icon name="check" size={36} strokeWidth={3} />
            </motion.div>
            <p className="text-lg font-semibold">Paid {formatNgn(amountMinor)}</p>
            <p className="text-sm text-tg-hint text-center">
              {receiverName ? `Received by ${receiverName}.` : 'Received.'}
            </p>
          </motion.div>

          <button
            onClick={() => {
              haptic('light');
              navigate('/pay');
            }}
            className="rounded-xl bg-gradient-to-br from-brand-from to-brand-to text-white py-3 font-semibold active:scale-[0.98] transition-transform"
          >
            Done
          </button>
        </div>
      ) : (
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

        <p className="text-xs text-tg-hint text-center px-2 leading-snug">
          {formatNgn(amountMinor)} is reserved — instantly refunded if you cancel or it isn’t
          received.
        </p>

        <button
          onClick={() => void cancelAndLeave()}
          disabled={cancel.isPending}
          className="rounded-xl bg-tg-secondary-bg ring-1 ring-black/5 py-3 font-medium active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {cancel.isPending ? 'Refunding…' : 'Cancel & refund'}
        </button>
      </div>
      )}
    </div>
  );
}
