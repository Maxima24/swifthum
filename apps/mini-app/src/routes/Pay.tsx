import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../hooks/payments";
import { formatNgn } from "../lib/format";
import { haptic } from "../lib/tg";
import { Header } from "../components/Header";
import { Icon } from "../components/Icon";

export function Pay() {
  const navigate = useNavigate();
  const { data: wallet, isLoading } = useWallet();

  return (
    <div className="flex flex-col pb-28 lg:pb-12">
      <Header eyebrow="Pay" title="Phone-to-phone" />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 pt-4 lg:gap-8 lg:pt-6">
        {/* Wallet card — full width on mobile, 3-col span on desktop */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: 0.05,
            type: "spring",
            stiffness: 200,
            damping: 18,
          }}
          className="lg:col-span-3 relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-from via-violet-500 to-brand-to text-white p-6 lg:p-8 shadow-xl shadow-brand-from/30 min-h-[180px] lg:min-h-[260px]"
        >
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-violet-300/20 blur-3xl" />

          <div className="relative flex flex-col h-full justify-between gap-6">
            <div className="flex items-center gap-1.5 opacity-90">
              <Icon name="wallet" size={14} />
              <p className="text-[11px] uppercase tracking-[0.15em] font-medium">
                Wallet
              </p>
            </div>
            <div className="space-y-2">
              <motion.p className="text-[40px] lg:text-[56px] font-semibold tabular-nums leading-none animate-float-slow">
                {isLoading
                  ? "—"
                  : wallet
                    ? formatNgn(wallet.balanceMinor)
                    : "—"}
              </motion.p>
              <p className="text-xs opacity-80 lg:text-sm">
                Send or receive instantly. No card..
              </p>
            </div>
          </div>
        </motion.div>

        {/* Action tiles — 2-col on mobile, stacked on desktop next to wallet */}
        <div className="lg:col-span-2 grid grid-cols-2 lg:grid-cols-1 gap-3">
          <ActionTile
            label="Send"
            sub="Broadcast over sound or QR"
            icon="send"
            tone="brand"
            onClick={() => {
              haptic("medium");
              navigate("/pay/send");
            }}
          />
          <ActionTile
            label="Receive"
            sub="Listen or scan a QR"
            icon="receive"
            tone="emerald"
            onClick={() => {
              haptic("medium");
              navigate("/pay/receive");
            }}
          />
        </div>

        {/* How it works — full width below */}
        <section className="lg:col-span-5 space-y-2 lg:mt-2">
          <h2 className="text-[11px] font-semibold text-tg-hint uppercase tracking-[0.12em] px-1">
            How it works
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Step
              n={1}
              text="Sender enters an amount and gets a one-time token (30s expiry)."
            />
            <Step
              n={2}
              text="Token broadcasts as ultrasonic sound — or as a QR if it's too noisy."
            />
            <Step
              n={3}
              text="Receiver decodes it and the wallet credits instantly."
            />
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
  icon: "send" | "receive";
  tone: "brand" | "emerald";
  onClick: () => void;
}) {
  const toneClasses =
    tone === "brand"
      ? "from-brand-from/12 to-brand-to/12 text-brand-from ring-brand-from/15"
      : "from-emerald-400/12 to-emerald-600/12 text-emerald-700 ring-emerald-500/15";
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className="text-left rounded-2xl bg-tg-secondary-bg ring-1 ring-black/5 p-4 lg:p-5 space-y-2 transition-shadow shadow-sm hover:shadow-md lg:flex lg:flex-col lg:gap-3 lg:flex-1"
    >
      <div
        className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-gradient-to-br ring-1 flex items-center justify-center ${toneClasses}`}
      >
        <Icon name={icon} size={20} />
      </div>
      <p className="font-semibold lg:text-lg">{label}</p>
      <p className="text-xs lg:text-sm text-tg-hint leading-snug">{sub}</p>
    </motion.button>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="rounded-2xl bg-tg-secondary-bg ring-1 ring-black/5 p-4 flex gap-3 items-start">
      <div className="shrink-0 w-6 h-6 rounded-full bg-tg-button/10 text-tg-button text-[11px] font-semibold flex items-center justify-center">
        {n}
      </div>
      <p className="text-sm leading-snug">{text}</p>
    </div>
  );
}
