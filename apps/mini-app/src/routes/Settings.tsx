import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { haptic } from '../lib/tg';
import { useBackButton } from '../hooks/useBackButton';
import { useSwiftyexAccount, useLinkSwiftyex, useUnlinkSwiftyex } from '../hooks/swiftyex';
import { useWallet, useUpdatePreferences } from '../hooks/payments';
import { useTheme } from '../hooks/useTheme';
import type { ThemePref } from '../lib/theme';
import { setThemePref } from '../lib/theme';
import {
  Header,
  Card,
  Button,
  Input,
  ListGroup,
  ListRow,
  Toggle,
  Badge,
  Segmented,
} from '../ui';

export function Settings() {
  const navigate = useNavigate();
  const { data: account } = useSwiftyexAccount();
  const linkMutation = useLinkSwiftyex();
  const unlinkMutation = useUnlinkSwiftyex();
  const linked = account?.linked ?? false;
  const pending = linkMutation.isPending || unlinkMutation.isPending;

  const { data: wallet } = useWallet();
  const prefsMutation = useUpdatePreferences();
  const [notifications, setNotifications] = useState(true);
  const [email, setEmail] = useState('');
  const [emailSaved, setEmailSaved] = useState(false);
  const { pref: themePref } = useTheme();

  useEffect(() => {
    if (wallet?.notificationsEnabled !== undefined) {
      setNotifications(wallet.notificationsEnabled);
    }
  }, [wallet?.notificationsEnabled]);

  useEffect(() => {
    if (wallet?.email != null) setEmail(wallet.email);
  }, [wallet?.email]);

  const saveEmail = async () => {
    if (prefsMutation.isPending) return;
    haptic('medium');
    try {
      await prefsMutation.mutateAsync({ email: email.trim() });
      setEmailSaved(true);
      haptic('success');
      setTimeout(() => setEmailSaved(false), 1800);
    } catch {
      haptic('error');
    }
  };

  const toggleNotifications = async (next: boolean) => {
    if (prefsMutation.isPending) return;
    haptic('light');
    setNotifications(next); // optimistic
    try {
      await prefsMutation.mutateAsync({ notificationsEnabled: next });
    } catch {
      setNotifications(!next); // revert on failure
      haptic('error');
    }
  };

  useBackButton(useCallback(() => navigate(-1), [navigate]));

  const toggleLink = () => {
    if (pending) return;
    haptic(linked ? 'error' : 'success');
    if (linked) unlinkMutation.mutate();
    else linkMutation.mutate('demo-sandbox-key');
  };

  return (
    <>
      <Header title="Settings" />

      <div className="flex flex-col gap-8 pt-5">
        <ListGroup title="SwiftyEx account">
          <ListRow
            icon="link"
            iconTone={linked ? 'success' : 'warning'}
            label={linked ? account?.label ?? 'Linked' : 'Not linked'}
            subtitle={
              linked
                ? 'Trades execute on your SwiftyEx account.'
                : 'Link SwiftyEx so rules can place real trades.'
            }
            trailing={
              <Badge tone={linked ? 'success' : 'warning'}>
                {linked ? 'Active' : 'Inactive'}
              </Badge>
            }
          />
          <div className="p-4">
            <Button
              block
              variant={linked ? 'danger' : 'primary'}
              disabled={pending}
              onClick={toggleLink}
            >
              {pending ? 'Working…' : linked ? 'Unlink SwiftyEx' : 'Link SwiftyEx account'}
            </Button>
          </div>
        </ListGroup>

        <ListGroup title="Notifications">
          <ListRow
            icon="bell"
            iconTone="accent"
            label="Telegram DMs on fire"
            subtitle="Get a message every time a rule fires."
            trailing={
              <Toggle
                checked={notifications}
                disabled={prefsMutation.isPending}
                onChange={toggleNotifications}
                label="Telegram DMs on fire"
              />
            }
          />
        </ListGroup>

        <ListGroup title="Email receipts">
          <div className="p-4 flex flex-col gap-3">
            <p className="text-sm text-text-secondary">
              Get a signed, verifiable receipt in your inbox for every payment.
            </p>
            <Input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="you@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button
              block
              variant="secondary"
              disabled={prefsMutation.isPending || !email.includes('@')}
              onClick={() => void saveEmail()}
            >
              {prefsMutation.isPending ? 'Saving…' : emailSaved ? 'Saved ✓' : 'Save email'}
            </Button>
          </div>
        </ListGroup>

        <div>
          <h2 className="px-1 mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-text-tertiary">
            Appearance
          </h2>
          <Segmented<ThemePref>
            value={themePref}
            onChange={(v) => {
              haptic('light');
              setThemePref(v);
            }}
            options={[
              { value: 'light', label: 'Light', icon: 'sun' },
              { value: 'dark', label: 'Dark', icon: 'moon' },
              { value: 'system', label: 'System', icon: 'monitor' },
            ]}
          />
        </div>

        <div>
          <h2 className="px-1 mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-text-tertiary">
            About
          </h2>
          <Card>
            <div className="flex items-center gap-3">
              <img
                src="/mascot.png"
                alt=""
                width={40}
                height={37}
                className="w-10 h-auto shrink-0 select-none"
                draggable={false}
              />
              <div>
                <p className="font-display text-[17px] font-bold tracking-[-0.01em] text-text-primary">
                  Swifthum
                </p>
                <p className="text-[12px] text-text-tertiary font-bold uppercase tracking-[0.12em] mt-0.5">
                  The Watcher
                </p>
              </div>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed mt-3">
              Cron jobs for your money — designed for humans, not engineers.
            </p>
            <p className="text-xs text-text-tertiary mt-3">
              v0.1 · SwiftyEx Hackfest Osun 2026
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
