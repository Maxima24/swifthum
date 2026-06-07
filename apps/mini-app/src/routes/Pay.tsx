import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/payments';
import { formatNgn } from '../lib/format';
import { haptic } from '../lib/tg';
import { Header, Card, Button, ListGroup, ListRow } from '../ui';

export function Pay() {
  const navigate = useNavigate();
  const { data: wallet, isLoading } = useWallet();

  return (
    <>
      <Header title="Pay" subtitle="Phone-to-phone, instantly" />

      <div className="flex flex-col gap-8 pt-5">
        <Card>
          <p className="text-[11px] text-text-tertiary uppercase tracking-[0.12em] font-bold">
            Wallet balance
          </p>
          <p className="font-display text-[42px] leading-none font-bold tracking-[-0.02em] tnum text-text-primary mt-2">
            {isLoading || !wallet ? '—' : formatNgn(wallet.balanceMinor)}
          </p>
          <p className="text-[13px] text-text-secondary mt-2">
            Send or receive instantly. No card.
          </p>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            icon="send"
            onClick={() => {
              haptic('medium');
              navigate('/pay/send');
            }}
          >
            Send
          </Button>
          <Button
            size="lg"
            variant="secondary"
            icon="receive"
            onClick={() => {
              haptic('medium');
              navigate('/pay/receive');
            }}
          >
            Receive
          </Button>
        </div>

        <ListGroup title="Send to a person">
          <ListRow
            icon="send"
            iconTone="accent"
            label="Send to @username"
            subtitle="Pay another SwiftHum user directly by their Telegram handle."
            chevron
            onClick={() => {
              haptic('medium');
              navigate('/pay/send-to-user');
            }}
          />
        </ListGroup>

        <ListGroup title="Gifts">
          <ListRow
            icon="send"
            iconTone="accent"
            label="Send a gift"
            subtitle="Lock NGN into a link — opening it onboards anyone instantly."
            chevron
            onClick={() => {
              haptic('medium');
              navigate('/pay/gifts');
            }}
          />
          <ListRow
            icon="sparkles"
            iconTone="muted"
            label="My gifts"
            subtitle="Track claims, copy links, or cancel unclaimed ones."
            chevron
            onClick={() => {
              haptic('light');
              navigate('/pay/gifts/my');
            }}
          />
          <ListRow
            icon="check-circle"
            iconTone="muted"
            label="Receipts"
            subtitle="Signed, verifiable proof of every transfer — shareable."
            chevron
            onClick={() => {
              haptic('light');
              navigate('/pay/receipts');
            }}
          />
          <ListRow
            icon="wallet"
            iconTone="accent"
            label="Escrow"
            subtitle="Lock NGN safely until both sides complete the deal."
            chevron
            onClick={() => {
              haptic('light');
              navigate('/pay/escrow');
            }}
          />
        </ListGroup>

        <ListGroup title="How it works">
          <ListRow
            icon="zap"
            iconTone="accent"
            label="Enter an amount"
            subtitle="You get a one-time token that expires in 30s."
          />
          <ListRow
            icon="speaker"
            iconTone="accent"
            label="Broadcast over sound or QR"
            subtitle="Ultrasonic chirp — or a QR if it's too noisy."
          />
          <ListRow
            icon="check-circle"
            iconTone="accent"
            label="Receiver decodes it"
            subtitle="The wallet credits instantly."
          />
        </ListGroup>
      </div>
    </>
  );
}
