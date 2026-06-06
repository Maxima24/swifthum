import { useLocation } from 'react-router-dom';
import { ThemeToggle } from '../ui';

// Only top-level screens show the brand bar; sub-screens have their own
// back+title header (matching where the TabBar shows).
const HIDE_ON: RegExp[] = [/^\/rules\/[^/]+/, /^\/pay\/(send|receive)/];

/**
 * Slim brand bar shown only on mobile top-level screens (the desktop sidebar
 * already shows the brand). Replaces the big per-screen hero titles with a
 * single consistent "Swifthum" mark, plus a quick theme toggle.
 */
export function MobileBrandBar() {
  const { pathname } = useLocation();
  if (HIDE_ON.some((rx) => rx.test(pathname))) return null;

  return (
    <div
      className="lg:hidden sticky top-0 z-30 bg-bg border-b border-border"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto max-w-[480px] sm:max-w-2xl md:max-w-3xl px-5 sm:px-6 h-12 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img
            src="/mascot.png"
            alt=""
            width={26}
            height={24}
            className="w-[26px] h-auto select-none"
            draggable={false}
          />
          <p className="font-display font-bold text-[17px] tracking-[-0.01em] text-text-primary">
            Swifthum
          </p>
        </div>
        <ThemeToggle />
      </div>
    </div>
  );
}
