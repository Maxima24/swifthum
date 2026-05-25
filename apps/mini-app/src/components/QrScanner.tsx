// Stubbed while html5-qrcode cannot be installed (network issue).
// When network is back: `corepack pnpm install` and restore the real impl below.
//
//   import { useEffect, useRef } from 'react';
//   import { Html5Qrcode } from 'html5-qrcode';
//   ... (see git history)

import { useState } from 'react';

interface Props {
  onResult: (text: string) => void;
  onError?: (e: unknown) => void;
}

export function QrScanner({ onResult }: Props) {
  const [text, setText] = useState('');
  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-black aspect-square w-full flex flex-col items-center justify-center text-white/60 text-sm text-center p-6">
        <div className="text-4xl mb-2">📷</div>
        <p>Scanner stub</p>
        <p className="text-xs mt-1 text-white/40">
          Install html5-qrcode to enable real camera scan
        </p>
      </div>
      <div className="space-y-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste token from sender to test redeem"
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
