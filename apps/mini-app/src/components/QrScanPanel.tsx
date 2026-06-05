import { useState } from 'react';
import { isNativeQrAvailable, openNativeQrScanner, haptic } from '../lib/tg';
import { QrScanner } from './QrScanner';
import { Icon } from './Icon';

interface Props {
  onResult: (text: string) => void;
  onError?: (e: unknown) => void;
}

/**
 * Picks the right QR scan UX:
 *  - inside Telegram → the **native** scanner (the web getUserMedia camera is
 *    blocked in Telegram's in-app WebView, which is why html5-qrcode shows a
 *    black box on a real phone).
 *  - desktop / normal browser → the html5-qrcode web scanner.
 * Both keep a manual paste fallback.
 */
export function QrScanPanel({ onResult, onError }: Props) {
  const [text, setText] = useState('');

  // Web browser (no Telegram): the html5-qrcode scanner already includes a paste box.
  if (!isNativeQrAvailable()) {
    return <QrScanner onResult={onResult} onError={onError} />;
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => {
          haptic('medium');
          openNativeQrScanner(onResult);
        }}
        className="w-full rounded-2xl bg-tg-button text-tg-button-text py-4 font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      >
        <Icon name="camera" size={20} />
        Open camera scanner
      </button>
      <p className="text-xs text-tg-hint text-center">
        Opens Telegram’s scanner — point it at the sender’s QR.
      </p>

      <div className="space-y-2 pt-1">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="…or paste token from sender"
          className="w-full rounded-xl bg-tg-secondary-bg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-tg-button"
        />
        <button
          onClick={() => text && onResult(text)}
          disabled={!text}
          className="w-full rounded-xl bg-tg-secondary-bg ring-1 ring-black/5 py-2 text-sm font-medium disabled:opacity-40"
        >
          Submit token
        </button>
      </div>
    </div>
  );
}
