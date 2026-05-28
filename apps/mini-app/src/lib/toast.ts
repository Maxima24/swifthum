import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  description?: string;
  variant: ToastVariant;
  durationMs: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id' | 'durationMs'> & { durationMs?: number }) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2, 9);
    const durationMs = t.durationMs ?? 3200;
    set((s) => ({ toasts: [...s.toasts, { id, durationMs, ...t }] }));
    setTimeout(() => get().dismiss(id), durationMs);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (message: string, description?: string) =>
    useToastStore.getState().push({ message, description, variant: 'success' }),
  error: (message: string, description?: string) =>
    useToastStore.getState().push({ message, description, variant: 'error' }),
  info: (message: string, description?: string) =>
    useToastStore.getState().push({ message, description, variant: 'info' }),
};
