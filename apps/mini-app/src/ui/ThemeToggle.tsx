import { useTheme } from '../hooks/useTheme';
import { Icon, type IconName } from '../components/Icon';
import { haptic } from '../lib/tg';
import type { ThemePref } from '../lib/theme';

const ICON: Record<ThemePref, IconName> = {
  light: 'sun',
  dark: 'moon',
  system: 'monitor',
};
const LABEL: Record<ThemePref, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

/** Compact icon button — cycles light → dark → system. */
export function ThemeToggle() {
  const { pref, cycle } = useTheme();
  return (
    <button
      onClick={() => {
        haptic('light');
        cycle();
      }}
      aria-label={`Theme: ${LABEL[pref]}`}
      title={`Theme: ${LABEL[pref]}`}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary active:scale-[0.97]"
    >
      <Icon name={ICON[pref]} size={18} />
    </button>
  );
}
