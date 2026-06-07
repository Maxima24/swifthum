import { NavLink, useLocation } from 'react-router-dom';
import { haptic } from '../lib/tg';
import { Icon, type IconName } from './Icon';
import { cn } from '../ui';

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/rules', label: 'Rules', icon: 'rules' },
  { to: '/pay', label: 'Pay', icon: 'wallet' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

const HIDE_ON: RegExp[] = [
  /^\/rules\/[^/]+/, // /rules/new, /rules/:id
  /^\/pay\/(send|send-to-user|receive|gifts|receipts|escrow)/,
];

export function TabBar() {
  const { pathname } = useLocation();
  if (HIDE_ON.some((rx) => rx.test(pathname))) return null;

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-surface"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex max-w-[480px] sm:max-w-2xl md:max-w-3xl mx-auto px-5 sm:px-6">
        {TABS.map((t) => (
          <li key={t.to} className="flex-1">
            <NavLink
              to={t.to}
              onClick={() => haptic('light')}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-col items-center gap-0.5 pt-2.5 pb-2 text-[11px] font-semibold transition-colors duration-150',
                  isActive ? 'text-accent' : 'text-text-tertiary',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-8 rounded-b-full bg-accent" />
                  )}
                  <Icon name={t.icon} size={22} />
                  <span>{t.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
