import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { setSession, type SessionUser } from '../lib/session';
import { getInitDataRaw } from '../lib/tg';
import { Icon } from './Icon';

type Status = 'loading' | 'ready' | 'error';

interface AuthResponse {
  sessionToken: string;
  user: SessionUser;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const initData = getInitDataRaw() ?? '';
        if (!initData) {
          throw new Error(
            'No Telegram initData found. Open this Mini App inside Telegram via @BotFather → your bot → Menu Button. Use cloudflared to expose your dev server over HTTPS.',
          );
        }
        const res = await api<AuthResponse>('/auth/telegram', {
          method: 'POST',
          body: JSON.stringify({ initData }),
        });
        if (cancelled) return;
        setSession(res.sessionToken, res.user);
        setStatus('ready');
      } catch (e: any) {
        if (cancelled) return;
        setErrorMessage(String(e?.message ?? e));
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') return <Splash />;
  if (status === 'error') return <ErrorScreen message={errorMessage ?? 'Sign-in failed'} />;
  return <>{children}</>;
}

function Splash() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4">
      <motion.div
        animate={{ scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-from to-brand-to text-white flex items-center justify-center shadow-lg shadow-brand-from/30"
      >
        <Icon name="zap" size={28} strokeWidth={2.5} />
      </motion.div>
      <p className="text-[11px] text-tg-hint uppercase tracking-[0.18em] font-medium">
        Swifthum
      </p>
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
        <Icon name="alert" size={28} />
      </div>
      <h1 className="text-lg font-semibold">Couldn't sign in</h1>
      <p className="text-sm text-tg-hint max-w-sm leading-snug">{message}</p>
      <button
        onClick={() => window.location.reload()}
        className="mt-2 rounded-xl bg-gradient-to-br from-brand-from to-brand-to text-white px-6 py-2.5 text-sm font-semibold shadow-md shadow-brand-from/25"
      >
        Try again
      </button>
    </div>
  );
}
