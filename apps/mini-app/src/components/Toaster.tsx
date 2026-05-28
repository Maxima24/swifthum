import { AnimatePresence, motion } from 'framer-motion';
import { useToastStore, type ToastVariant } from '../lib/toast';
import { Icon, type IconName } from './Icon';

const STYLES: Record<ToastVariant, { icon: IconName; ring: string; iconClass: string }> = {
  success: {
    icon: 'check',
    ring: 'ring-emerald-200',
    iconClass: 'bg-emerald-50 text-emerald-600',
  },
  error: {
    icon: 'alert',
    ring: 'ring-red-200',
    iconClass: 'bg-red-50 text-red-600',
  },
  info: {
    icon: 'sparkles',
    ring: 'ring-violet-200',
    iconClass: 'bg-violet-50 text-violet-600',
  },
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      className="fixed left-0 right-0 bottom-20 lg:bottom-6 z-50 flex flex-col items-center gap-2 pointer-events-none px-4"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const { icon, ring, iconClass } = STYLES[t.variant];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className={`pointer-events-auto w-full max-w-sm rounded-2xl bg-tg-secondary-bg ring-1 shadow-lg shadow-black/10 p-3 flex items-start gap-3 ${ring}`}
              onClick={() => dismiss(t.id)}
            >
              <div className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${iconClass}`}>
                <Icon name={icon} size={18} strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-sm font-semibold leading-tight">{t.message}</p>
                {t.description && (
                  <p className="text-xs text-tg-hint mt-0.5 leading-snug">{t.description}</p>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss(t.id);
                }}
                aria-label="Dismiss"
                className="shrink-0 -mr-1 p-1 rounded-md text-tg-hint hover:text-tg-text hover:bg-black/[0.04]"
              >
                <Icon name="x" size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
