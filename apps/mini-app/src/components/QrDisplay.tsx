import { QRCodeSVG } from 'qrcode.react';

/**
 * Renders the payment token as a scannable QR. The token (~100 bytes) sits well
 * within QR capacity at error-correction level M. White quiet-zone background so
 * a receiver's camera locks on reliably.
 */
export function QrDisplay({ value, size = 200 }: { value: string; size?: number }) {
  return (
    <div className="inline-flex items-center justify-center rounded-2xl bg-white p-4 shadow-sm">
      <QRCodeSVG
        value={value}
        size={size}
        bgColor="#ffffff"
        fgColor="#0f0f0f"
        level="M"
        marginSize={0}
      />
    </div>
  );
}
