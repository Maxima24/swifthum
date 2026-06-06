import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRedeem } from '../hooks/payments';
import { useBackButton } from '../hooks/useBackButton';
import { haptic } from '../lib/tg';
import { formatNgn } from '../lib/format';
import { initGgwave, startListening, type MicListener } from '../lib/ggwave';
import { friendlyRedeemError } from '../lib/errors';
import { QrScanPanel } from '../components/QrScanPanel';
import { Icon } from '../components/Icon';
import type { RedemptionResult } from '../types';
import { Header, Card, Button, Segmented, Spinner, EmptyState } from '../ui';

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
    async (rawToken: string) => {
      if (result || redeem.isPending) return;
      // Scanners / paste can append whitespace or newlines; even one stray char
      // breaks the HMAC and the API returns 401 invalid_or_expired.
      const token = rawToken.trim();
      if (!token) return;
      try {
        const res = await redeem.mutateAsync(token);
        haptic('success');
        setResult(res);
      } catch (e) {
        haptic('error');
        setError(friendlyRedeemError(e));
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
          setListenError(String(e?.message ?? 'Mic access denied') + ' — switch to Scan QR.');
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
      <>
        <Header back onBack={goBack} title="Received" />
        <div className="flex flex-col items-center text-center pt-16 gap-6">
          <span className="w-20 h-20 rounded-full bg-success-soft text-success flex items-center justify-center">
            <Icon name="check" size={40} strokeWidth={3} />
          </span>
          <div>
            <p className="font-display text-[34px] font-bold tracking-[-0.02em] tnum text-text-primary">
              {formatNgn(result.amountMinor)}
            </p>
            <p className="text-sm text-text-secondary mt-1">
              from {result.sender.displayName}
            </p>
          </div>
          <Button size="lg" onClick={goBack}>
            Done
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <Header back onBack={goBack} title="Receive" subtitle="Waiting for payment" />

      <div className="flex flex-col gap-6 pt-5">
        <Segmented<Mode>
          value={mode}
          onChange={(m) => {
            haptic('light');
            setError(null);
            setListenError(null);
            setMode(m);
          }}
          options={[
            { value: 'listen', label: 'Listen', icon: 'mic' },
            { value: 'scan', label: 'Scan QR', icon: 'camera' },
          ]}
        />

        {mode === 'listen' ? (
          <Card padded={false} className="p-8 min-h-[280px] flex items-center justify-center">
            {listenError ? (
              <EmptyState
                icon="alert"
                title="Mic unavailable"
                description={listenError}
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      haptic('light');
                      setMode('scan');
                    }}
                  >
                    Switch to Scan QR
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-col items-center gap-5 text-center">
                <span className="w-20 h-20 rounded-full bg-accent-soft text-accent flex items-center justify-center">
                  <Icon name="mic" size={32} />
                </span>
                <div className="flex items-center gap-2 text-text-secondary">
                  {listening && <Spinner size={16} />}
                  <p className="text-sm max-w-[16rem] leading-snug">
                    {listening
                      ? 'Listening for the ultrasonic chirp from the sender…'
                      : 'Warming up mic…'}
                  </p>
                </div>
              </div>
            )}
          </Card>
        ) : (
          <Card>
            <QrScanPanel
              onResult={tryRedeem}
              onError={() =>
                setError("Couldn't access the camera — paste the token from the sender instead.")
              }
            />
          </Card>
        )}

        {error && (
          <Card padded={false} className="p-3 bg-danger-soft border-0 flex items-start gap-2">
            <Icon name="alert" size={16} className="shrink-0 mt-0.5 text-danger" />
            <span className="text-sm text-danger">{error}</span>
          </Card>
        )}

        <Button variant="ghost" block onClick={goBack}>
          Cancel
        </Button>
      </div>
    </>
  );
}
