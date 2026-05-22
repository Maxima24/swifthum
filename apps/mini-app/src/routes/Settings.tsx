import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { haptic } from '../lib/tg';
import { useBackButton } from '../hooks/useBackButton';

export function Settings() {
  const navigate = useNavigate();
  const [linked, setLinked] = useState(false);
  const [notifications, setNotifications] = useState(true);

  useBackButton(useCallback(() => navigate(-1), [navigate]));

  const toggleLink = () => {
    haptic(linked ? 'error' : 'success');
    setLinked((v) => !v);
  };

  return (
    <div className="flex flex-col gap-6 p-5 pt-10 pb-16">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-1"
      >
        <p className="text-tg-hint text-xs uppercase tracking-wider">Settings</p>
        <h1 className="text-2xl font-semibold">Account</h1>
      </motion.header>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-tg-hint uppercase tracking-wider">
          SwiftyEx account
        </h2>
        <div className="rounded-2xl bg-tg-secondary-bg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                {linked ? 'Linked' : 'Not linked'}
              </p>
              <p className="text-xs text-tg-hint mt-0.5">
                {linked
                  ? 'Trades will execute on your SwiftyEx account.'
                  : 'Link SwiftyEx so rules can place real trades.'}
              </p>
            </div>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                linked
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {linked ? 'Active' : 'Inactive'}
            </span>
          </div>
          <button
            onClick={toggleLink}
            className={`w-full rounded-xl py-3 font-medium active:scale-[0.98] transition-transform ${
              linked
                ? 'bg-red-50 text-red-700'
                : 'bg-tg-button text-tg-button-text'
            }`}
          >
            {linked ? 'Unlink SwiftyEx' : 'Link SwiftyEx account'}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-tg-hint uppercase tracking-wider">
          Notifications
        </h2>
        <button
          onClick={() => {
            haptic('light');
            setNotifications((v) => !v);
          }}
          className="w-full rounded-2xl bg-tg-secondary-bg p-4 flex items-center justify-between"
        >
          <div className="text-left">
            <p className="font-medium">Telegram DMs on fire</p>
            <p className="text-xs text-tg-hint mt-0.5">
              Get a message every time a rule fires.
            </p>
          </div>
          <Toggle on={notifications} />
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-tg-hint uppercase tracking-wider">About</h2>
        <div className="rounded-2xl bg-tg-secondary-bg p-4 text-sm space-y-1">
          <p className="font-medium">The Watcher</p>
          <p className="text-tg-hint">
            Cron jobs for your money, designed for humans not engineers.
          </p>
          <p className="text-tg-hint text-xs pt-2">v0.1 · SwiftyEx Hackfest Osun 2026</p>
        </div>
      </section>
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        on ? 'bg-tg-button' : 'bg-gray-300'
      }`}
    >
      <motion.span
        layout
        className="inline-block h-5 w-5 rounded-full bg-white shadow"
        style={{ marginLeft: on ? 22 : 2 }}
      />
    </span>
  );
}
