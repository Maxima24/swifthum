import { useEffect, useState, type ReactNode } from 'react';
import { api, useMocks } from '../lib/api';
import { setSession, type SessionUser } from '../lib/session';
import { getInitDataRaw } from '../lib/tg';
import { Icon } from './Icon';
import { Loader } from './Loader';
import { Button } from '../ui';

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
        // In mock mode the mock router accepts an empty initData.
        // In real mode an empty initData will be rejected by the backend.
        if (!useMocks && !initData) {
          throw new Error(
            'Couldn’t read your Telegram session. Please open SwiftHum from the menu button in @swifthum_bot (the ☰ beside the message box), not from a plain link.',
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

  if (status === 'loading') {
    return <Splash />;
  }

  if (status === 'error') {
    return <ErrorScreen message={errorMessage ?? 'Sign-in failed'} />;
  }

  return <>{children}</>;
}

function Splash() {
  return <Loader />;
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-warning-soft text-warning flex items-center justify-center">
        <Icon name="alert" size={26} />
      </div>
      <h1 className="text-[20px] font-bold tracking-[-0.01em] text-text-primary">
        Couldn't sign in
      </h1>
      <p className="text-sm text-text-secondary max-w-sm leading-relaxed">{message}</p>
      <Button className="mt-2" onClick={() => window.location.reload()}>
        Try again
      </Button>
    </div>
  );
}
