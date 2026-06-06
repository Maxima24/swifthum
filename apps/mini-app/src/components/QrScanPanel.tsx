import { useState } from 'react';
import { isNativeQrAvailable, openNativeQrScanner, haptic } from '../lib/tg';
import { QrScanner } from './QrScanner';
import { Button, Input } from '../ui';

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
    <div className="flex flex-col gap-3">
      <Button
        size="lg"
        block
        icon="camera"
        onClick={() => {
          haptic('medium');
          openNativeQrScanner(onResult);
        }}
      >
        Open camera scanner
      </Button>
      <p className="text-xs text-text-tertiary text-center">
        Opens Telegram’s scanner — point it at the sender’s QR.
      </p>

      <div className="flex flex-col gap-2 pt-1">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="…or paste token from sender"
        />
        <Button block variant="secondary" disabled={!text} onClick={() => text && onResult(text)}>
          Submit token
        </Button>
      </div>
    </div>
  );
}
