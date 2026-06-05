import {
  init,
  miniApp,
  themeParams,
  viewport,
  backButton,
  mainButton,
  hapticFeedback,
  initData,
  retrieveRawInitData,
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
    // Restore init data from launch params so initData.* signals (incl. raw())
    // are populated — without this initData.raw() returns undefined in v3.
    try {
      initData.restore();
    } catch {
      /* not in Telegram */
    }
    miniApp.ready();
    initialized = true;
  } catch (e) {
    console.warn('[tg] Not running inside Telegram, SDK init skipped', e);
  }
}

/**
 * Raw Telegram initData string for backend HMAC verification. Tries the most
 * reliable sources in order: the telegram-web-app.js global (loaded in
 * index.html), the SDK's direct launch-param reader, then the restored signal.
 */
export function getInitDataRaw(): string | null {
  try {
    const wa = (window as any).Telegram?.WebApp;
    if (wa?.initData) return wa.initData as string;
  } catch {
    /* ignore */
  }
  try {
    const raw = retrieveRawInitData();
    if (raw) return raw;
  } catch {
    /* ignore */
  }
  try {
    const raw = initData.raw();
    if (raw) return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function isInsideTelegram(): boolean {
  return typeof window !== 'undefined' && !!(window as any).Telegram?.WebApp?.initData;
}

/**
 * Telegram's native QR scanner. The web getUserMedia camera (html5-qrcode) is
 * blocked inside Telegram's in-app WebView, so on a real phone we must use this.
 * Returns false when unavailable (desktop browser / old client) so callers can
 * fall back to the web scanner.
 */
function tgWebApp(): any {
  if (typeof window === 'undefined') return null;
  return (window as any).Telegram?.WebApp ?? null;
}

export function isNativeQrAvailable(): boolean {
  const wa = tgWebApp();
  return !!wa && typeof wa.showScanQrPopup === 'function' && !!wa.initData;
}

/** Opens the native scanner; calls onText with the first decode, then closes. */
export function openNativeQrScanner(onText: (text: string) => void, prompt = 'Scan the sender’s QR'): boolean {
  const wa = tgWebApp();
  if (!wa || typeof wa.showScanQrPopup !== 'function') return false;
  try {
    wa.showScanQrPopup({ text: prompt }, (text: string) => {
      if (text) {
        onText(text);
        return true; // returning true closes the popup
      }
      return false;
    });
    return true;
  } catch {
    return false;
  }
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
