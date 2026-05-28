import { useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { useWallet } from '../hooks/payments';
import { formatNgn } from '../lib/format';
import { haptic } from '../lib/tg';
import { useUi } from '../stores/ui';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/rules', label: 'Rules', icon: 'rules' },
  { to: '/pay', label: 'Pay', icon: 'wallet' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const { data: wallet } = useWallet();
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const toggle = useUi((s) => s.toggleSidebar);

  // Keyboard shortcut: Cmd+B / Ctrl+B to toggle (VS Code / Linear vibe)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  return (
    <aside
      className={`hidden lg:flex fixed left-0 top-0 bottom-0 flex-col border-r border-black/[0.06] bg-tg-bg/60 backdrop-blur-xl z-20 transition-[width,padding] duration-300 ease-out ${
        collapsed ? 'w-16 p-3' : 'w-64 p-6'
      }`}
    >
      {/* Floating toggle on right edge */}
      <button
        onClick={toggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (⌘B)`}
        className="absolute -right-3 top-10 z-30 w-6 h-6 rounded-full bg-tg-bg ring-1 ring-black/10 shadow-md flex items-center justify-center text-tg-hint hover:text-tg-text hover:bg-tg-secondary-bg active:scale-90 transition-all"
      >
        <Icon
          name="chevron-left"
          size={14}
          className={`transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Brand */}
      <div className={`flex items-center mb-8 ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
        <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-brand-from to-brand-to text-white flex items-center justify-center shadow-md shadow-brand-from/30">
          <Icon name="zap" size={20} strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <div className="leading-tight overflow-hidden whitespace-nowrap">
            <p className="font-bold text-[15px]">Swifthum</p>
            <p className="text-[10px] text-tg-hint uppercase tracking-[0.12em] font-medium">
              The Watcher
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => haptic('light')}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              `flex items-center rounded-xl text-sm font-medium transition-colors ${
                collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
              } ${
                isActive
                  ? 'bg-gradient-to-r from-brand-from/12 to-brand-to/12 text-brand-from'
                  : 'text-tg-hint hover:text-tg-text hover:bg-tg-secondary-bg/60'
              }`
            }
          >
            <Icon name={item.icon} size={18} />
            {!collapsed && <span className="overflow-hidden whitespace-nowrap">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* New rule */}
      <button
        onClick={() => {
          haptic('medium');
          navigate('/rules/new');
        }}
        title={collapsed ? 'New rule' : undefined}
        className={`mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-brand-from to-brand-to text-white font-semibold shadow-md shadow-brand-from/30 active:scale-[0.98] transition-transform ${
          collapsed ? 'p-2.5' : 'px-4 py-2.5 text-sm'
        }`}
      >
        <Icon name="plus" size={collapsed ? 18 : 16} strokeWidth={2.5} />
        {!collapsed && <span className="overflow-hidden whitespace-nowrap">New rule</span>}
      </button>

      {/* Wallet (hidden when collapsed) */}
      {!collapsed && (
        <div className="mt-auto pt-5 border-t border-black/[0.06]">
          <p className="text-[10px] text-tg-hint uppercase tracking-[0.12em] font-medium mb-1">
            Wallet
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {wallet ? formatNgn(wallet.balanceMinor) : '—'}
          </p>
          <p className="text-[11px] text-tg-hint mt-0.5">SwiftyEx · Mock data</p>
        </div>
      )}

      {/* Mini wallet pill when collapsed — just a coin icon */}
      {collapsed && wallet && (
        <div className="mt-auto flex justify-center" title={formatNgn(wallet.balanceMinor)}>
          <div className="w-10 h-10 rounded-xl bg-tg-secondary-bg ring-1 ring-black/5 flex items-center justify-center text-tg-hint">
            <Icon name="wallet" size={18} />
          </div>
        </div>
      )}
    </aside>
  );
}
