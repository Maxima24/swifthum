import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Icon, type IconName } from './Icon';

export function EmptyState({
  icon = 'sparkles',
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-16 space-y-4">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-from to-brand-to text-white flex items-center justify-center shadow-lg shadow-brand-from/30"
      >
        <Icon name={icon} size={28} />
      </motion.div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && (
        <p className="text-sm text-tg-hint max-w-xs leading-relaxed">{description}</p>
      )}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
