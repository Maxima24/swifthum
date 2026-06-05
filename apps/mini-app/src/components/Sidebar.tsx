import { NavLink, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { useWallet } from '../hooks/payments';
import { useSidebar } from '../hooks/useSidebar';
import { formatNgn } from '../lib/format';
import { haptic } from '../lib/tg';
import { Button, ThemeToggle, cn } from '../ui';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/rules', label: 'Rules', icon: 'rules' },
  { to: '/pay', label: 'Pay', icon: 'wallet' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const { data: wallet } = useWallet();
  const { collapsed, toggle } = useSidebar();

  return (
    <aside
      className={cn(
        'hidden lg:flex fixed left-0 top-0 bottom-0 flex-col border-r border-border bg-surface z-20',
        'transition-[width] duration-200 ease-out',
        collapsed ? 'w-16 p-3 items-center' : 'w-64 p-5',
      )}
    >
      {/* Brand + collapse toggle */}
      <div
        className={cn(
          'flex items-center mb-8',
          collapsed ? 'flex-col gap-3' : 'justify-between pl-1',
        )}
      >
        {!collapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/mascot.png"
              alt=""
              width={32}
              height={30}
              className="w-8 h-auto shrink-0 select-none"
              draggable={false}
            />
            <div className="leading-tight min-w-0">
              <p className="font-display font-bold text-[18px] tracking-[-0.01em] truncate">Swifthum</p>
              <p className="text-[11px] text-text-tertiary uppercase tracking-[0.12em] font-bold mt-0.5">
                The Watcher
              </p>
            </div>
          </div>
        )}
        {collapsed && (
          <img
            src="/mascot.png"
            alt="Swifthum"
            width={34}
            height={32}
            className="w-[34px] h-auto select-none"
            draggable={false}
          />
        )}
        <button
          onClick={() => {
            haptic('light');
            toggle();
          }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary active:scale-[0.97]"
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={18} />
        </button>
      </div>

      <nav className={cn('flex flex-col gap-1', collapsed && 'items-center w-full')}>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => haptic('light')}
            aria-label={item.label}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center rounded-xl text-[15px] font-semibold transition-colors duration-150',
                collapsed ? 'h-10 w-10 justify-center' : 'gap-3 px-3 py-2.5',
                isActive
                  ? 'bg-accent-soft text-accent'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-muted',
              )
            }
          >
            <Icon name={item.icon} size={19} />
            {!collapsed && item.label}
          </NavLink>
        ))}
      </nav>

      {collapsed ? (
        <button
          onClick={() => {
            haptic('medium');
            navigate('/rules/new');
          }}
          aria-label="New rule"
          title="New rule"
          className="mt-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-on-accent transition-colors hover:bg-accent-hover active:scale-[0.97]"
        >
          <Icon name="plus" size={18} />
        </button>
      ) : (
        <Button
          className="mt-4"
          block
          icon="plus"
          onClick={() => {
            haptic('medium');
            navigate('/rules/new');
          }}
        >
          New rule
        </Button>
      )}

      <div
        className={cn(
          'mt-auto w-full',
          collapsed ? 'flex flex-col items-center gap-2 pt-5' : 'pt-5 border-t border-border',
        )}
      >
        {collapsed ? (
          <ThemeToggle />
        ) : (
          <>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] text-text-tertiary uppercase tracking-[0.12em] font-bold">
                Wallet
              </p>
              <ThemeToggle />
            </div>
            <p className="text-lg font-bold tnum text-text-primary">
              {wallet ? formatNgn(wallet.balanceMinor) : '—'}
            </p>
            <p className="text-[12px] text-text-tertiary mt-0.5">SwiftyEx · Sandbox</p>
          </>
        )}
      </div>
    </aside>
  );
}
