import { useNavigate } from 'react-router-dom';
import { useSwiftyexIdentity, useSwiftyexRates, useSwiftyexWallets } from '../hooks/swiftyexMiniApp';
import { haptic, copyText } from '../lib/tg';
import { useCallback, useState } from 'react';
import { Header, Card, Button, Badge, Spinner, EmptyState } from '../ui';
import { Icon } from '../components/Icon';
import {
  field,
  normalizeRates,
  normalizeWallets,
  prettyRateLabel,
  type SxRate,
  type SxWallet,
} from '../lib/swiftyexNormalize';

export function Markets() {
  const navigate = useNavigate();
  const rates = useSwiftyexRates();
  const wallets = useSwiftyexWallets();
  const identity = useSwiftyexIdentity();

  const loading = rates.isLoading || wallets.isLoading || identity.isLoading;
  const notConfigured = rates.data?.configured === false;

  if (loading) {
    return (
      <>
        <Header title="Markets" subtitle="Live SwiftyEx data" />
        <div className="flex justify-center pt-16">
          <Spinner />
        </div>
      </>
    );
  }

  if (notConfigured) {
    return (
      <>
        <Header title="Markets" subtitle="Live SwiftyEx data" />
        <EmptyState
          icon="link"
          title="SwiftyEx not connected"
          description="Real balances, rates and KYC appear here once the SwiftyEx API is configured."
        />
      </>
    );
  }

  const profile = identity.data?.profile as Record<string, unknown> | undefined;
  const walletRows = normalizeWallets(wallets.data?.wallets);
  const rateRows = normalizeRates(rates.data?.rates);

  return (
    <>
      <Header title="Markets" subtitle="Your live SwiftyEx account" />
      <div className="flex flex-col gap-5 pt-5">
        {profile && <IdentityCard profile={profile} />}

        <Section title="Your wallets">
          {walletRows.length === 0 ? (
            <p className="text-sm text-text-tertiary px-1">No wallets returned.</p>
          ) : (
            <Card className="flex flex-col divide-y divide-border p-0">
              {walletRows.map((w, i) => (
                <WalletRow key={i} wallet={w} />
              ))}
            </Card>
          )}
        </Section>

        <Section title="Rates">
          {rateRows.length === 0 ? (
            <p className="text-sm text-text-tertiary px-1">No rates returned.</p>
          ) : (
            <Card className="flex flex-col gap-2">
              <div className="grid grid-cols-3 text-[11px] font-bold uppercase tracking-[0.1em] text-text-tertiary">
                <span>Asset</span>
                <span className="text-right">Buy</span>
                <span className="text-right">Sell</span>
              </div>
              {rateRows.map((r, i) => (
                <RateRow key={i} rate={r} />
              ))}
            </Card>
          )}
        </Section>

        <Button variant="secondary" block onClick={() => navigate('/markets/transactions')}>
          View transaction history
        </Button>
        <p className="text-xs text-text-tertiary text-center px-2">
          Live data from your SwiftyEx account · the Watcher reacts to these rates.
        </p>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-1 mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-text-tertiary">
        {title}
      </p>
      {children}
    </div>
  );
}

function IdentityCard({ profile }: { profile: Record<string, unknown> }) {
  const verified = !!field(profile, 'kyc_verified', 'kycVerified', 'is_verified');
  const level = field(profile, 'kyc_level', 'kycLevel', 'level');
  const username = field(profile, 'username');
  const referral = field(profile, 'referral_code', 'referralCode');
  return (
    <Card className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-text-primary">
          {username ? `@${String(username)}` : 'Your SwiftyEx account'}
        </span>
        {referral != null && (
          <span className="text-xs text-text-tertiary">Referral: {String(referral)}</span>
        )}
      </div>
      {verified ? (
        <Badge tone="success">✓ KYC{level != null ? ` · L${String(level)}` : ''}</Badge>
      ) : (
        <Badge tone="warning">KYC pending</Badge>
      )}
    </Card>
  );
}

function WalletRow({ wallet }: { wallet: SxWallet }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    if (!wallet.address) return;
    haptic('light');
    if (await copyText(wallet.address)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [wallet.address]);

  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="font-semibold text-text-primary uppercase">{wallet.asset ?? '—'}</span>
        {wallet.address && (
          <button
            onClick={() => void onCopy()}
            className="text-xs text-text-tertiary truncate max-w-[180px] text-left inline-flex items-center gap-1"
          >
            <Icon name="qr" size={12} />
            {copied ? 'Copied ✓' : wallet.address}
          </button>
        )}
      </div>
      <span className="font-display font-bold tnum text-text-primary text-right shrink-0">
        {wallet.balance ?? '0'}
      </span>
    </div>
  );
}

function RateRow({ rate }: { rate: SxRate }) {
  return (
    <div className="grid grid-cols-3 items-center text-sm">
      <span className="font-semibold text-text-primary">{prettyRateLabel(rate.asset)}</span>
      <span className="text-right tnum text-text-secondary">{rate.buy ?? '—'}</span>
      <span className="text-right tnum text-text-secondary">{rate.sell ?? '—'}</span>
    </div>
  );
}
