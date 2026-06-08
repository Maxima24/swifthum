import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSwiftyexTransactions } from '../hooks/swiftyexMiniApp';
import { useBackButton } from '../hooks/useBackButton';
import { field } from '../lib/swiftyexNormalize';
import { Header, Card, Button, Spinner, EmptyState } from '../ui';

function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['data', 'results', 'transactions', 'items']) {
      if (Array.isArray(o[k])) return o[k] as unknown[];
    }
  }
  return [];
}

export function MarketsTransactions() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSwiftyexTransactions(page);

  useBackButton(useCallback(() => navigate('/markets'), [navigate]));

  const rows = asArray(data?.transactions);

  return (
    <>
      <Header back onBack={() => navigate('/markets')} title="History" subtitle="SwiftyEx transactions" />
      {isLoading ? (
        <div className="flex justify-center pt-16">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon="clock" title="No transactions" description="Your SwiftyEx history will appear here." />
      ) : (
        <div className="flex flex-col gap-3 pt-5">
          {rows.map((t, i) => {
            const type = field(t, 'type', 'tx_type', 'direction', 'status');
            const asset = field(t, 'asset', 'wallet_type', 'currency', 'symbol');
            const amount = field(t, 'amount', 'value', 'balance');
            const when = field(t, 'created_at', 'createdAt', 'date', 'timestamp');
            return (
              <Card key={i} className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-semibold text-text-primary capitalize">
                    {type != null ? String(type) : 'Transaction'}
                    {asset != null ? ` · ${String(asset).toUpperCase()}` : ''}
                  </span>
                  {when != null && (
                    <span className="text-xs text-text-tertiary truncate">{String(when)}</span>
                  )}
                </div>
                <span className="font-display font-bold tnum text-text-primary shrink-0">
                  {amount != null ? String(amount) : '—'}
                </span>
              </Card>
            );
          })}

          <div className="flex items-center justify-between gap-3 pt-2">
            <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              ← Prev
            </Button>
            <span className="text-sm text-text-tertiary">Page {page}</span>
            <Button variant="ghost" disabled={rows.length === 0} onClick={() => setPage((p) => p + 1)}>
              Next →
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
