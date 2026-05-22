import {
  init,
  miniApp,
  themeParams,
  viewport,
  backButton,
  mainButton,
  hapticFeedback,
  initData,
} from '@telegram-apps/sdk-react';

let initialized = false;

export function initTelegram() {
  if (initialized) return;
  try {
    init();
    miniApp.mount();
    themeParams.mount();
    viewport.mount();
    backButton.mount();
    if (mainButton.mount.isAvailable()) mainButton.mount();
    miniApp.ready();
    initialized = true;
  } catch (e) {
    console.warn('[tg] Not running inside Telegram, SDK init skipped', e);
  }
}

export function getInitDataRaw(): string | null {
  try {
    return initData.raw() ?? null;
  } catch {
    return null;
  }
}

export function isInsideTelegram(): boolean {
  return typeof window !== 'undefined' && !!(window as any).Telegram?.WebApp?.initData;
}

export function haptic(kind: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'light') {
  try {
    if (kind === 'success' || kind === 'error') {
      hapticFeedback.notificationOccurred(kind);
    } else {
      hapticFeedback.impactOccurred(kind);
    }
  } catch {
    /* not in Telegram */
  }
}
