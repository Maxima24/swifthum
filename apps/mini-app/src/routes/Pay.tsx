import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/payments';
import { formatNgn } from '../lib/format';
import { haptic } from '../lib/tg';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';

export function Pay() {
  const navigate = useNavigate();
  const { data: wallet, isLoading } = useWallet();

  return (
    <div className="flex flex-col px-5 pb-32">
      <Header eyebrow="Pay" title="Phone-to-phone" />

      <div className="flex flex-col gap-5 pt-5">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, type: 'spring', stiffness: 200, damping: 18 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-from via-violet-500 to-brand-to text-white p-6 shadow-xl shadow-brand-from/30"
        >
          {/* Decorative orbs */}
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-violet-300/20 blur-3xl" />

          <div className="relative space-y-2">
            <div className="flex items-center gap-1.5 opacity-90">
              <Icon name="wallet" size={14} />
              <p className="text-[11px] uppercase tracking-[0.15em] font-medium">Wallet</p>
            </div>
            <motion.p
              className="text-[40px] font-semibold tabular-nums leading-none animate-float-slow"
            >
              {isLoading ? '—' : wallet ? formatNgn(wallet.balanceMinor) : '—'}
            </motion.p>
            <p className="text-xs opacity-80">Send or receive instantly. No card.</p>
          </div>
        </motion.div>

        <div className="grid grid-cols-2 gap-3">
          <ActionTile
            label="Send"
            sub="Broadcast over sound or QR"
            icon="send"
            tone="brand"
            onClick={() => {
              haptic('medium');
              navigate('/pay/send');
            }}
          />
          <ActionTile
            label="Receive"
            sub="Listen or scan a QR"
            icon="receive"
            tone="emerald"
            onClick={() => {
              haptic('medium');
              navigate('/pay/receive');
            }}
          />
        </div>

        <section className="space-y-2 pt-2">
          <h2 className="text-[11px] font-semibold text-tg-hint uppercase tracking-[0.12em]">
            How it works
          </h2>
          <div className="rounded-2xl bg-tg-secondary-bg/90 ring-1 ring-black/5 p-4 space-y-3 text-sm">
            <Step n={1} text="Sender enters an amount and gets a one-time token (30s expiry)." />
            <Step n={2} text="Token broadcasts as ultrasonic sound — or as a QR if it's too noisy." />
            <Step n={3} text="Receiver decodes it and the wallet credits instantly." />
          </div>
        </section>
      </div>
    </div>
  );
}

function ActionTile({
  label,
  sub,
  icon,
  tone,
  onClick,
}: {
  label: string;
  sub: string;
  icon: 'send' | 'receive';
  tone: 'brand' | 'emerald';
  onClick: () => void;
}) {
  const toneClasses =
    tone === 'brand'
      ? 'from-brand-from/12 to-brand-to/12 text-brand-from ring-brand-from/15'
      : 'from-emerald-400/12 to-emerald-600/12 text-emerald-700 ring-emerald-500/15';
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className={`text-left rounded-2xl bg-tg-secondary-bg ring-1 ring-black/5 p-4 space-y-2 transition-shadow shadow-sm hover:shadow-md`}
    >
      <div
        className={`w-10 h-10 rounded-xl bg-gradient-to-br ring-1 flex items-center justify-center ${toneClasses}`}
      >
        <Icon name={icon} size={20} />
      </div>
      <p className="font-semibold">{label}</p>
      <p className="text-xs text-tg-hint leading-snug">{sub}</p>
    </motion.button>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="shrink-0 w-5 h-5 rounded-full bg-tg-button/10 text-tg-button text-[11px] font-semibold flex items-center justify-center">
        {n}
      </div>
      <p className="leading-snug">{text}</p>
    </div>
  );
}
