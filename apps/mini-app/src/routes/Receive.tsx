import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useRedeem } from '../hooks/payments';
import { useBackButton } from '../hooks/useBackButton';
import { haptic } from '../lib/tg';
import { formatNgn } from '../lib/format';
import { initGgwave, startListening, type MicListener } from '../lib/ggwave';
import { QrScanner } from '../components/QrScanner';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';
import type { RedemptionResult } from '../types';

type Mode = 'listen' | 'scan';

export function Receive() {
  const navigate = useNavigate();
  const redeem = useRedeem();
  const [mode, setMode] = useState<Mode>('listen');
  const [listening, setListening] = useState(false);
  const [listenError, setListenError] = useState<string | null>(null);
  const [result, setResult] = useState<RedemptionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const goBack = useCallback(() => navigate('/pay'), [navigate]);
  useBackButton(goBack);

  const tryRedeem = useCallback(
    async (token: string) => {
      if (result || redeem.isPending) return;
      try {
        const res = await redeem.mutateAsync(token);
        haptic('success');
        setResult(res);
      } catch (e: any) {
        haptic('error');
        setError(String(e?.message ?? e));
      }
    },
    [result, redeem],
  );

  useEffect(() => {
    if (mode !== 'listen' || result) return;
    let micListener: MicListener | null = null;
    let cancelled = false;

    (async () => {
      const ok = await initGgwave();
      if (!ok) {
        if (!cancelled) setListenError('Sound mode unavailable — switch to Scan QR.');
        return;
      }
      try {
        micListener = await startListening((token) => tryRedeem(token));
        if (cancelled) {
          micListener.stop();
          return;
        }
        setListening(true);
      } catch (e: any) {
        if (!cancelled) {
          setListenError(
            String(e?.message ?? 'Mic access denied') + ' — switch to Scan QR.',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        micListener?.stop();
      } catch {
        /* swallow */
      }
    };
  }, [mode, result, tryRedeem]);

  if (result) {
    return (
      <div className="flex flex-col pb-10 lg:max-w-xl lg:mx-auto">
        <Header
          back
          onBack={goBack}
          eyebrow="Received"
          title={formatNgn(result.amountMinor)}
          subtitle={<span className="text-[12px]">from {result.sender.displayName}</span>}
        />
        <div className="flex flex-col items-center gap-6 pt-12">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 15 }}
            className="w-28 h-28 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white flex items-center justify-center shadow-xl shadow-emerald-500/40"
          >
            <Icon name="check" size={48} strokeWidth={3} />
          </motion.div>
          <button
            onClick={() => {
              haptic('light');
              navigate('/pay');
            }}
            className="rounded-2xl bg-gradient-to-br from-brand-from to-brand-to text-white px-8 py-3 font-semibold shadow-lg shadow-brand-from/30 active:scale-[0.98] transition-transform"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col pb-10 lg:pb-16 lg:max-w-xl lg:mx-auto">
      <Header back onBack={goBack} eyebrow="Receive" title="Waiting for payment" />

      <div className="flex flex-col gap-5 pt-5">
        <div className="grid grid-cols-2 gap-1 rounded-full bg-tg-secondary-bg ring-1 ring-black/5 p-1">
          {(['listen', 'scan'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                haptic('light');
                setError(null);
                setListenError(null);
                setMode(m);
              }}
              className={`relative rounded-full py-2 text-sm font-medium transition-colors ${
                mode === m ? 'text-tg-text' : 'text-tg-hint'
              }`}
            >
              {mode === m && (
                <motion.span
                  layoutId="receive-mode"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  className="absolute inset-0 rounded-full bg-tg-bg shadow-sm shadow-black/5 ring-1 ring-black/5 -z-10"
                />
              )}
              <span className="inline-flex items-center gap-1.5">
                <Icon name={m === 'listen' ? 'mic' : 'camera'} size={14} />
                {m === 'listen' ? 'Listen' : 'Scan QR'}
              </span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {mode === 'listen' ? (
            <motion.div
              key="listen"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="rounded-3xl bg-tg-secondary-bg ring-1 ring-black/5 p-8 flex flex-col items-center gap-5 min-h-[260px] justify-center"
            >
              {listenError ? (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Icon name="alert" size={28} />
                  </div>
                  <p className="text-sm text-tg-hint text-center max-w-xs">{listenError}</p>
                  <button
                    onClick={() => {
                      haptic('light');
                      setMode('scan');
                    }}
                    className="rounded-xl bg-tg-button text-tg-button-text px-5 py-2 text-sm font-semibold"
                  >
                    Switch to Scan QR
                  </button>
                </>
              ) : (
                <>
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <motion.span
                      animate={{ scale: [1, 1.6], opacity: [0.5, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
                      className="absolute inset-0 rounded-full bg-amber-400/30"
                    />
                    <motion.span
                      animate={{ scale: [1, 1.4], opacity: [0.4, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut', delay: 0.4 }}
                      className="absolute inset-2 rounded-full bg-amber-500/30"
                    />
                    <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center shadow-lg shadow-amber-500/40">
                      <Icon name="mic" size={28} />
                    </div>
                  </div>
                  <p className="text-sm text-tg-hint text-center max-w-xs leading-snug">
                    {listening
                      ? 'Listening for ultrasonic chirp from sender…'
                      : 'Warming up mic…'}
                  </p>
                </>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="scan"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="rounded-3xl bg-tg-secondary-bg ring-1 ring-black/5 p-4"
            >
              <QrScanner
                onResult={tryRedeem}
                onError={(e: any) => setError(String(e?.message ?? e))}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="rounded-2xl bg-red-50 text-red-700 ring-1 ring-red-200 p-3 text-sm flex items-start gap-2">
            <Icon name="alert" size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

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
