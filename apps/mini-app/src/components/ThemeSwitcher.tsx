import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { applyTheme, watchSystemTheme, type ThemePref } from '../lib/theme';
import { useUi } from '../stores/ui';
import { haptic } from '../lib/tg';
import { Icon, type IconName } from './Icon';

const OPTIONS: { value: ThemePref; label: string; icon: IconName }[] = [
  { value: 'system', label: 'System', icon: 'settings' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'sleep' },
];

export function ThemeSwitcher() {
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);

  useEffect(() => {
    const stop = watchSystemTheme(() => useUi.getState().theme);
    return stop;
  }, []);

  const pick = (v: ThemePref) => {
    haptic('light');
    setTheme(v);
    applyTheme(v);
  };

  return (
    <div className="grid grid-cols-3 gap-1 rounded-full bg-tg-secondary-bg ring-1 ring-black/5 p-1">
      {OPTIONS.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => pick(opt.value)}
            className={`relative rounded-full py-2 text-sm font-medium transition-colors ${
              active ? 'text-tg-text' : 'text-tg-hint'
            }`}
          >
            {active && (
              <motion.span
                layoutId="theme-active"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className="absolute inset-0 rounded-full bg-tg-bg shadow-sm shadow-black/5 ring-1 ring-black/5 -z-10"
              />
            )}
            <span className="inline-flex items-center gap-1.5">
              <Icon name={opt.icon} size={14} />
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
