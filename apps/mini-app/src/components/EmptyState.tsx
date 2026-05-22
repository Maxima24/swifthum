import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-16 space-y-3">
      <div className="text-4xl">📋</div>
      <h2 className="text-lg font-medium">{title}</h2>
      {description && <p className="text-sm text-tg-hint max-w-xs">{description}</p>}
      {action && <div className="pt-4">{action}</div>}
    </div>
  );
}
