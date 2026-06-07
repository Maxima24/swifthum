import { useParams, useSearchParams } from 'react-router-dom';
import { useVerifyReceipt } from '../hooks/receipts';
import { formatNgn } from '../lib/format';
import { Icon } from '../components/Icon';
import { Card, Spinner } from '../ui';

const SOURCE_LABEL: Record<string, string> = {
  payment: 'Payment',
  gift: 'Gift',
  escrow: 'Escrow',
};

/**
 * Public, unauthenticated receipt page (`/r/:receiptId?token=…`). Rendered
 * OUTSIDE AuthGate so a shared link opens for anyone, in any browser. The server
 * re-verifies the signed token; tampering with the token in the URL flips the
 * badge to "Could not verify".
 */
export function ReceiptView() {
  const { receiptId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { data, isLoading, isError } = useVerifyReceipt(token);

  const valid = !!data?.valid;
  const r = data?.receipt;
  // Defend against a token whose embedded receiptId doesn't match the URL.
  const idMismatch = valid && !!receiptId && !!r && r.id !== receiptId;
  const verified = valid && !idMismatch;

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-6 bg-bg">
      <div className="w-full max-w-sm">
        <div className="text-center mb-5">
          <span className="font-display text-[20px] font-bold tracking-[-0.01em] text-text-primary">
            SwiftHum
          </span>
          <p className="text-[13px] text-text-secondary">Verifiable receipt</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !token || isError || !data ? (
          <ReceiptStatus
            ok={false}
            title="Could not verify"
            detail="This receipt link is missing or malformed."
          />
        ) : verified && r ? (
          <Card className="flex flex-col gap-5">
            <div className="flex flex-col items-center text-center gap-3 pt-2">
              <span className="w-16 h-16 rounded-full bg-success-soft text-success flex items-center justify-center">
                <Icon name="check" size={34} strokeWidth={3} />
              </span>
              <div>
                <p className="font-display text-[32px] font-bold tracking-[-0.02em] tnum text-text-primary">
                  {formatNgn(r.amountMinor)}
                </p>
                <p className="text-sm text-text-secondary mt-1">
                  {SOURCE_LABEL[r.sourceType] ?? 'Transfer'} · {formatDate(r.createdAt)}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-surface-muted divide-y divide-border">
              <Row label="From" value={r.from} />
              <Row label="To" value={r.to} />
            </div>

            <div className="flex items-center justify-center gap-2 text-success text-sm font-semibold">
              <Icon name="check-circle" size={16} />
              Verified by SwiftyEx
            </div>
          </Card>
        ) : (
          <ReceiptStatus
            ok={false}
            title="Could not verify"
            detail="The signature didn't match — this receipt may have been tampered with."
          />
        )}

        <p className="text-[11px] text-text-tertiary text-center mt-5 leading-snug">
          Receipts are cryptographically signed by SwiftHum. Any change to the link breaks the
          signature.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-[13px] text-text-tertiary">{label}</span>
      <span className="text-[15px] font-semibold text-text-primary truncate ml-3">{value}</span>
    </div>
  );
}

function ReceiptStatus({ ok, title, detail }: { ok: boolean; title: string; detail: string }) {
  return (
    <Card className="flex flex-col items-center text-center gap-3 py-10">
      <span
        className={`w-16 h-16 rounded-full flex items-center justify-center ${
          ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
        }`}
      >
        <Icon name={ok ? 'check' : 'alert'} size={32} strokeWidth={ok ? 3 : 2} />
      </span>
      <h1 className="text-[19px] font-bold tracking-[-0.01em] text-text-primary">{title}</h1>
      <p className="text-sm text-text-secondary max-w-xs leading-relaxed">{detail}</p>
    </Card>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-NG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}
