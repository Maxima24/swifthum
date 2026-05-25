import { NavLink, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { useWallet } from '../hooks/payments';
import { formatNgn } from '../lib/format';
import { haptic } from '../lib/tg';

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/rules', label: 'Rules', icon: 'rules' },
  { to: '/pay', label: 'Pay', icon: 'wallet' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const { data: wallet } = useWallet();

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 flex-col p-6 border-r border-black/[0.06] bg-tg-bg/60 backdrop-blur-xl z-20">
      <div className="flex items-center gap-2.5 mb-8">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-from to-brand-to text-white flex items-center justify-center shadow-md shadow-brand-from/30">
          <Icon name="zap" size={20} strokeWidth={2.5} />
        </div>
        <div className="leading-tight">
          <p className="font-bold text-[15px]">Swifthum</p>
          <p className="text-[10px] text-tg-hint uppercase tracking-[0.12em] font-medium">
            The Watcher
          </p>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => haptic('light')}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-gradient-to-r from-brand-from/12 to-brand-to/12 text-brand-from'
                  : 'text-tg-hint hover:text-tg-text hover:bg-tg-secondary-bg/60'
              }`
            }
          >
            <Icon name={item.icon} size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={() => {
          haptic('medium');
          navigate('/rules/new');
        }}
        className="mt-4 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-brand-from to-brand-to text-white px-4 py-2.5 text-sm font-semibold shadow-md shadow-brand-from/30 active:scale-[0.98] transition-transform"
      >
        <Icon name="plus" size={16} strokeWidth={2.5} />
        New rule
      </button>

      <div className="mt-auto pt-5 border-t border-black/[0.06]">
        <p className="text-[10px] text-tg-hint uppercase tracking-[0.12em] font-medium mb-1">
          Wallet
        </p>
        <p className="text-lg font-semibold tabular-nums">
          {wallet ? formatNgn(wallet.balanceMinor) : '—'}
        </p>
        <p className="text-[11px] text-tg-hint mt-0.5">SwiftyEx · Mock data</p>
      </div>
    </aside>
  );
}
