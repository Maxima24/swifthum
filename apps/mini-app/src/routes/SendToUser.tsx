import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLookupUser, useSendToUser, useWallet } from '../hooks/payments';
import { useBackButton } from '../hooks/useBackButton';
import { haptic } from '../lib/tg';
import { formatNgn } from '../lib/format';
import { friendlySendError } from '../lib/errors';
import { Icon } from '../components/Icon';
import { Header, Card, Button, AmountInput, Input, Spinner } from '../ui';

type Stage = 'compose' | 'done';

const QUICK_AMOUNTS = [1000, 5000, 10000, 25000, 50000];

export function SendToUser() {
  const navigate = useNavigate();
  const { data: wallet } = useWallet();
  const send = useSendToUser();

  const [stage, setStage] = useState<Stage>('compose');
  const [username, setUsername] = useState('');
  const [debounced, setDebounced] = useState('');
  const [amountNgn, setAmountNgn] = useState('5000');
  const [error, setError] = useState<string | null>(null);
  const [sentName, setSentName] = useState('');

  useBackButton(useCallback(() => navigate('/pay'), [navigate]));

  // Debounce the handle before hitting the lookup endpoint.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(username.trim().replace(/^@+/, '')), 350);
    return () => clearTimeout(id);
  }, [username]);

  const lookup = useLookupUser(debounced);
  const recipient = lookup.data?.found ? lookup.data : null;

  const amountMinor = Math.round(parseFloat(amountNgn || '0') * 100);
  const isValid =
    !!recipient && amountMinor > 0 && !!wallet && amountMinor <= wallet.balanceMinor && !send.isPending;

  const handleSend = useCallback(async () => {
    if (!isValid || !recipient) return;
    haptic('medium');
    setError(null);
    try {
      const result = await send.mutateAsync({
        recipientUsername: lookup.data?.username ?? debounced,
        amountMinor,
      });
      setSentName(result.recipient.displayName);
      setStage('done');
      haptic('success');
    } catch (e) {
      haptic('error');
      setError(friendlySendError(e));
    }
  }, [isValid, recipient, send, lookup.data, debounced, amountMinor]);

  if (stage === 'done') {
    return (
      <>
        <Header back onBack={() => navigate('/pay')} title="Sent" />
        <div className="flex flex-col items-center text-center pt-12 gap-6">
          <span className="w-20 h-20 rounded-full bg-success-soft text-success flex items-center justify-center">
            <Icon name="check" size={40} strokeWidth={3} />
          </span>
          <div>
            <p className="font-display text-[34px] font-bold tracking-[-0.02em] tnum text-text-primary">
              {formatNgn(amountMinor)}
            </p>
            <p className="text-sm text-text-secondary mt-1">Sent to {sentName}.</p>
          </div>
          <Button size="lg" onClick={() => navigate('/pay')}>
            Done
          </Button>
        </div>
      </>
    );
  }

  const showNotFound = debounced.length >= 3 && !lookup.isFetching && lookup.data && !lookup.data.found;

  return (
    <>
      <Header
        back
        onBack={() => navigate('/pay')}
        title="Send to @username"
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
            Recipient
          </p>
          <Input
            value={username}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="@username"
            onChange={(e) => {
              setUsername(e.target.value);
              if (error) setError(null);
            }}
          />
          <div className="px-1 mt-2 min-h-[20px] text-sm">
            {lookup.isFetching && debounced.length >= 3 ? (
              <span className="text-text-tertiary inline-flex items-center gap-1.5">
                <Spinner size={14} /> Looking up…
              </span>
            ) : recipient ? (
              <span className="text-success font-medium">✓ {recipient.displayName}</span>
            ) : showNotFound ? (
              <span className="text-text-secondary">Not on SwiftHum yet.</span>
            ) : null}
          </div>
        </div>

        {showNotFound && (
          <Card className="flex flex-col gap-3">
            <p className="text-sm text-text-secondary">
              <b>@{debounced}</b> isn’t on SwiftHum. Send them a gift link instead — opening it sets
              up their wallet automatically.
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                haptic('light');
                navigate('/pay/gifts');
              }}
            >
              Send a gift instead
            </Button>
          </Card>
        )}

        <div>
          <p className="px-1 mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-text-tertiary">
            Amount (₦)
          </p>
          <AmountInput
            type="number"
            inputMode="decimal"
            value={amountNgn}
            onChange={(e) => {
              setAmountNgn(e.target.value);
              if (error) setError(null);
            }}
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

        {error && (
          <Card padded={false} className="p-3 bg-danger-soft border-0 flex items-start gap-2">
            <Icon name="alert" size={16} className="shrink-0 mt-0.5 text-danger" />
            <span className="text-sm text-danger">{error}</span>
          </Card>
        )}

        <div className="flex flex-col gap-3">
          <Button size="lg" block disabled={!isValid} onClick={() => void handleSend()}>
            {send.isPending
              ? 'Sending…'
              : recipient
                ? `Send to ${recipient.displayName}`
                : 'Send'}
          </Button>
          <Button variant="ghost" block onClick={() => navigate('/pay')}>
            Cancel
          </Button>
        </div>
      </div>
    </>
  );
}
