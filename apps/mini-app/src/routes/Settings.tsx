import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { haptic } from '../lib/tg';
import { useBackButton } from '../hooks/useBackButton';
import { useSwiftyexAccount, useLinkSwiftyex, useUnlinkSwiftyex } from '../hooks/swiftyex';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';

export function Settings() {
  const navigate = useNavigate();
  const { data: account } = useSwiftyexAccount();
  const linkMutation = useLinkSwiftyex();
  const unlinkMutation = useUnlinkSwiftyex();
  const linked = account?.linked ?? false;
  const pending = linkMutation.isPending || unlinkMutation.isPending;
  const [notifications, setNotifications] = useState(true);

  useBackButton(useCallback(() => navigate(-1), [navigate]));

  const toggleLink = () => {
    if (pending) return;
    haptic(linked ? 'error' : 'success');
    if (linked) {
      unlinkMutation.mutate();
    } else {
      // The toggle UX has no key field; the sandbox accepts any credential.
      // For live mode, add a key-entry step before calling link.
      linkMutation.mutate('demo-sandbox-key');
    }
  };

  return (
    <div className="flex flex-col px-5 pb-32">
      <Header eyebrow="Settings" title="Account" />

      <div className="flex flex-col gap-5 pt-5">
        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold text-tg-hint uppercase tracking-[0.12em]">
            SwiftyEx account
          </h2>
          <div className="rounded-2xl bg-tg-secondary-bg ring-1 ring-black/5 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                  linked
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-amber-50 text-amber-600'
                }`}
              >
                <Icon name="link" size={22} />
              </div>
              <div className="flex-1">
                <p className="font-semibold">{linked ? (account?.label ?? 'Linked') : 'Not linked'}</p>
                <p className="text-xs text-tg-hint mt-0.5 leading-snug">
                  {linked
                    ? 'Trades will execute on your SwiftyEx account.'
                    : 'Link SwiftyEx so rules can place real trades.'}
                </p>
              </div>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ring-1 ${
                  linked
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    : 'bg-amber-50 text-amber-700 ring-amber-200'
                }`}
              >
                {linked ? 'Active' : 'Inactive'}
              </span>
            </div>
            <button
              onClick={toggleLink}
              disabled={pending}
              className={`w-full rounded-xl py-3 font-semibold active:scale-[0.98] transition-transform disabled:opacity-60 ${
                linked
                  ? 'bg-red-50 text-red-700'
                  : 'bg-gradient-to-br from-brand-from to-brand-to text-white shadow-md shadow-brand-from/25'
              }`}
            >
              {pending ? 'Working…' : linked ? 'Unlink SwiftyEx' : 'Link SwiftyEx account'}
            </button>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold text-tg-hint uppercase tracking-[0.12em]">
            Notifications
          </h2>
          <button
            onClick={() => {
              haptic('light');
              setNotifications((v) => !v);
            }}
            className="w-full rounded-2xl bg-tg-secondary-bg ring-1 ring-black/5 p-4 flex items-center gap-3"
          >
            <div className="w-11 h-11 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center">
              <Icon name="bell" size={22} />
            </div>
            <div className="text-left flex-1">
              <p className="font-semibold">Telegram DMs on fire</p>
              <p className="text-xs text-tg-hint mt-0.5">
                Get a message every time a rule fires.
              </p>
            </div>
            <Toggle on={notifications} />
          </button>
        </section>

        <section className="space-y-2">
          <h2 className="text-[11px] font-semibold text-tg-hint uppercase tracking-[0.12em]">
            About
          </h2>
          <div className="rounded-2xl bg-tg-secondary-bg ring-1 ring-black/5 p-4 text-sm space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-from to-brand-to text-white flex items-center justify-center">
                <Icon name="zap" size={14} />
              </div>
              <p className="font-semibold">Swifthum</p>
            </div>
            <p className="text-tg-hint">
              Cron jobs for your money, designed for humans not engineers.
            </p>
            <p className="text-tg-hint text-xs pt-2">v0.1 · SwiftyEx Hackfest Osun 2026</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
        on ? 'bg-gradient-to-br from-brand-from to-brand-to' : 'bg-slate-300'
      }`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="inline-block h-5 w-5 rounded-full bg-white shadow"
        style={{ marginLeft: on ? 26 : 4 }}
      />
    </span>
  );
}
