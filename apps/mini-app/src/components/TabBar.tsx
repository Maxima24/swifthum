import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { haptic } from '../lib/tg';
import { Icon, type IconName } from './Icon';

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/rules', label: 'Rules', icon: 'rules' },
  { to: '/pay', label: 'Pay', icon: 'wallet' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

const HIDE_ON: RegExp[] = [
  /^\/rules\/[^/]+/, // /rules/new, /rules/:id
  /^\/pay\/(send|receive)/,
];

export function TabBar() {
  const { pathname } = useLocation();
  if (HIDE_ON.some((rx) => rx.test(pathname))) return null;

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-black/[0.06] bg-tg-bg/90 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex max-w-[460px] mx-auto">
        {TABS.map((t) => (
          <li key={t.to} className="flex-1">
            <NavLink
              to={t.to}
              onClick={() => haptic('light')}
              className={({ isActive }) =>
                `relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                  isActive ? 'text-tg-button' : 'text-tg-hint'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="tab-active-bar"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-b-full bg-gradient-to-r from-brand-from to-brand-to"
                    />
                  )}
                  <Icon name={t.icon} size={20} />
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
