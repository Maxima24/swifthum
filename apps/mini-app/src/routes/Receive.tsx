import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRedeem } from '../hooks/payments';
import { useBackButton } from '../hooks/useBackButton';
import { haptic } from '../lib/tg';
import { formatNgn } from '../lib/format';
import { friendlyRedeemError } from '../lib/errors';
import { QrScanPanel } from '../components/QrScanPanel';
import { Icon } from '../components/Icon';
import type { RedemptionResult } from '../types';
import { Header, Card, Button } from '../ui';

export function Receive() {
  const navigate = useNavigate();
  const redeem = useRedeem();
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
        <Card>
          <QrScanPanel
            onResult={tryRedeem}
            onError={() =>
              setError("Couldn't access the camera — paste the token from the sender instead.")
            }
          />
        </Card>

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
