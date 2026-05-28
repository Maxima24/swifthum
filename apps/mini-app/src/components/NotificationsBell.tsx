import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useRules } from '../hooks/rules';
import { useUi } from '../stores/ui';
import { haptic } from '../lib/tg';
import { formatRelativeTime } from '../lib/format';
import { Icon } from './Icon';

export function NotificationsBell() {
  const navigate = useNavigate();
  const { data: rules = [] } = useRules();
  const ackedRuleIds = useUi((s) => s.ackedRuleIds);
  const ackRule = useUi((s) => s.ackRule);
  const ackAll = useUi((s) => s.ackAll);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const fired = useMemo(
    () =>
      rules
        .filter((r) => r.firedCount > 0)
        .sort((a, b) => (b.lastEvaluatedAt ?? '').localeCompare(a.lastEvaluatedAt ?? '')),
    [rules],
  );

  const unread = useMemo(
    () => fired.filter((r) => !ackedRuleIds.includes(r.id)),
    [fired, ackedRuleIds],
  );

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => {
          haptic('light');
          setOpen((v) => !v);
        }}
        aria-label="Notifications"
        className="relative w-9 h-9 rounded-xl bg-tg-secondary-bg ring-1 ring-black/5 flex items-center justify-center text-tg-hint hover:text-tg-text active:scale-95 transition-all"
      >
        <Icon name="bell" size={16} />
        {unread.length > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-gradient-to-br from-brand-from to-brand-to text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-tg-bg"
          >
            {unread.length}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl bg-tg-bg ring-1 ring-black/10 shadow-xl shadow-black/15 overflow-hidden z-40"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.04]">
              <p className="text-sm font-semibold">Activity</p>
              {unread.length > 0 && (
                <button
                  onClick={() => {
                    haptic('light');
                    ackAll(unread.map((r) => r.id));
                  }}
                  className="text-[11px] font-medium text-brand-from hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            {fired.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm text-tg-hint">No activity yet.</p>
                <p className="text-xs text-tg-hint mt-1">
                  You'll see rule fires here.
                </p>
              </div>
            ) : (
              <ul className="max-h-80 overflow-y-auto">
                {fired.slice(0, 8).map((r) => {
                  const isUnread = !ackedRuleIds.includes(r.id);
                  return (
                    <li key={r.id}>
                      <button
                        onClick={() => {
                          haptic('light');
                          ackRule(r.id);
                          setOpen(false);
                          navigate(`/rules/${r.id}`);
                        }}
                        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-tg-secondary-bg/60 transition-colors"
                      >
                        <div className="w-8 h-8 shrink-0 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mt-0.5">
                          <Icon name="zap" size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{r.name}</p>
                          <p className="text-xs text-tg-hint mt-0.5">
                            Fired {r.firedCount}× ·{' '}
                            {formatRelativeTime(r.lastEvaluatedAt)}
                          </p>
                        </div>
                        {isUnread && (
                          <span className="shrink-0 w-2 h-2 rounded-full bg-brand-from mt-2" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
