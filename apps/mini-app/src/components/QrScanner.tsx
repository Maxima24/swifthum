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
 *
 * Two things keep this from white-screening:
 *  1. We `stop()` AND `clear()` the scanner — removing html5-qrcode's injected
 *     <video>/canvas nodes — BEFORE calling onResult. onResult flips parent state
 *     which unmounts us (and runs framer-motion's exit animation); if html5-qrcode's
 *     foreign DOM is still inside our div, React's removeChild throws and the app
 *     blanks. Clearing first means React only ever unmounts nodes it owns.
 *  2. Callbacks are read through refs so the camera effect runs exactly once and
 *     never restarts when the parent re-renders (e.g. redeem pending/success).
 */
export function QrScanner({ onResult, onError }: Props) {
  const regionId = `qr-reader-${useId().replace(/[:]/g, '')}`;
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const handledRef = useRef(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [text, setText] = useState('');

  // Keep the latest callbacks without re-running the camera effect.
  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    let cancelled = false;
    const startedRef = { current: false };
    const scanner = new Html5Qrcode(regionId, { verbose: false });

    const stopAndClear = async () => {
      if (startedRef.current) {
        startedRef.current = false;
        try {
          await scanner.stop();
        } catch {
          /* not running — ignore */
        }
      }
      try {
        scanner.clear();
      } catch {
        /* already cleared — ignore */
      }
    };

    const handle = async (decoded: string) => {
      if (handledRef.current) return;
      handledRef.current = true;
      await stopAndClear(); // tear down camera DOM before unmount
      if (!cancelled) onResultRef.current(decoded);
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
      .then(() => {
        startedRef.current = true;
        if (cancelled) void stopAndClear();
      })
      .catch((err) => {
        if (cancelled) return;
        setCameraFailed(true);
        onErrorRef.current?.(err);
      });

    return () => {
      cancelled = true;
      void stopAndClear();
    };
  }, [regionId]);

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
