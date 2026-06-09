import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReceipts, useEmailReceipt } from '../hooks/receipts';
import { useBackButton } from '../hooks/useBackButton';
import { haptic, copyText, shareTelegramLink } from '../lib/tg';
import { formatNgn, formatRelativeTime } from '../lib/format';
import { Header, Card, Button, Badge, Spinner, EmptyState } from '../ui';
import type { ReceiptListItem } from '../types';

const SOURCE_LABEL: Record<string, string> = {
  payment: 'Payment',
  gift: 'Gift',
  escrow: 'Escrow',
};

export function Receipts() {
  const navigate = useNavigate();
  const { data, isLoading } = useReceipts();
  const emailReceipt = useEmailReceipt();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [mail, setMail] = useState<{ id: string; text: string } | null>(null);

  useBackButton(useCallback(() => navigate('/pay'), [navigate]));

  const handleCopy = useCallback(async (r: ReceiptListItem) => {
    haptic('light');
    if (await copyText(r.url)) {
      setCopiedId(r.id);
      setTimeout(() => setCopiedId((c) => (c === r.id ? null : c)), 1500);
    }
  }, []);

  const handleEmail = useCallback(
    async (r: ReceiptListItem) => {
      haptic('medium');
      try {
        const res = await emailReceipt.mutateAsync({ receiptId: r.id });
        if (res.status === 'ok') {
          haptic('success');
          setMail({ id: r.id, text: `Sent to ${res.to ?? 'your inbox'} ✓` });
        } else if (res.status === 'no_email') {
          setMail({ id: r.id, text: 'Add your email in Settings first →' });
        } else if (res.status === 'failed') {
          haptic('error');
          setMail({ id: r.id, text: `Email failed — ${res.error ?? 'check SMTP setup'}` });
        } else {
          setMail({ id: r.id, text: 'Email isn’t set up on the server yet' });
        }
      } catch {
        haptic('error');
        setMail({ id: r.id, text: 'Couldn’t send — try again' });
      }
      setTimeout(() => setMail((m) => (m?.id === r.id ? null : m)), 2800);
    },
    [emailReceipt],
  );

  const items = data?.items ?? [];

  return (
    <>
      <Header back onBack={() => navigate('/pay')} title="Receipts" subtitle="Signed proof of every transfer" />

      {isLoading ? (
        <div className="flex justify-center pt-16">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="check-circle"
          title="No receipts yet"
          description="When you send or receive money, a verifiable receipt appears here to share."
        />
      ) : (
        <div className="flex flex-col gap-3 pt-5">
          {items.map((r) => (
            <Card key={r.id} className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-display text-[22px] font-bold tracking-[-0.01em] tnum text-text-primary">
                  {formatNgn(r.amountMinor)}
                </span>
                <Badge tone={r.direction === 'received' ? 'success' : 'muted'}>
                  {r.direction === 'received' ? 'Received' : 'Sent'}
                </Badge>
              </div>
              <p className="text-[13px] text-text-tertiary">
                {SOURCE_LABEL[r.sourceType] ?? 'Transfer'} ·{' '}
                {r.direction === 'received' ? 'from' : 'to'} {r.counterparty.displayName} ·{' '}
                {formatRelativeTime(r.createdAt)}
              </p>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <Button
                  variant="secondary"
                  onClick={() => {
                    haptic('medium');
                    shareTelegramLink(r.url, 'My SwiftHum receipt — verify it ✅');
                  }}
                >
                  Share
                </Button>
                <Button variant="secondary" onClick={() => void handleCopy(r)}>
                  {copiedId === r.id ? 'Copied ✓' : 'Copy'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    haptic('light');
                    navigate(`/r/${r.id}?token=${encodeURIComponent(r.token)}`);
                  }}
                >
                  View
                </Button>
              </div>

              <Button
                block
                variant="secondary"
                icon="send"
                disabled={emailReceipt.isPending}
                onClick={() => void handleEmail(r)}
              >
                {emailReceipt.isPending && emailReceipt.variables?.receiptId === r.id
                  ? 'Sending…'
                  : 'Email receipt'}
              </Button>
              {mail?.id === r.id && (
                <button
                  className="text-xs text-text-tertiary text-center"
                  onClick={() => mail.text.includes('Settings') && navigate('/settings')}
                >
                  {mail.text}
                </button>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
