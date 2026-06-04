import { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface Props {
  onResult: (text: string) => void;
  onError?: (e: unknown) => void;
}

/**
 * Live camera QR scanner (html5-qrcode). Starts the rear camera on mount, fires
 * `onResult` once on the first decode, then stops to avoid duplicate redeems.
 * A manual "paste token" field stays available as a fallback for desktop / no-camera
 * environments (Telegram WebApp on desktop often has no usable camera).
 */
export function QrScanner({ onResult, onError }: Props) {
  const regionId = `qr-reader-${useId().replace(/[:]/g, '')}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [text, setText] = useState('');

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(regionId, { verbose: false });
    scannerRef.current = scanner;

    const handle = (decoded: string) => {
      if (handledRef.current) return;
      handledRef.current = true;
      // Stop the camera before handing the token up, so we don't fire twice.
      scanner.stop().catch(() => {});
      onResult(decoded);
    };

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        handle,
        () => {
          /* per-frame "no QR found" — ignore, it's noisy by design */
        },
      )
      .catch((err) => {
        if (cancelled) return;
        setCameraFailed(true);
        onError?.(err);
      });

    return () => {
      cancelled = true;
      // stop() rejects if it never started; swallow.
      scanner
        .stop()
        .then(() => scanner.clear())
        .catch(() => {});
    };
  }, [regionId, onResult, onError]);

  return (
    <div className="space-y-3">
      <div
        id={regionId}
        className="overflow-hidden rounded-2xl bg-black aspect-square w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
      />
      {cameraFailed && (
        <p className="text-xs text-amber-700 text-center">
          Couldn't open the camera. Paste the token from the sender instead.
        </p>
      )}
      <div className="space-y-2">
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
          className="w-full rounded-xl bg-tg-button text-tg-button-text py-2 text-sm font-medium disabled:opacity-40"
        >
          Submit token
        </button>
      </div>
    </div>
  );
}
