// Stubbed while qrcode.react cannot be installed (network issue).
// When network is back: `corepack pnpm install` and replace with the real impl below.
//
//   import { QRCodeSVG } from 'qrcode.react';
//   export function QrDisplay({ value, size = 200 }: { value: string; size?: number }) {
//     return (
//       <div className="inline-flex items-center justify-center rounded-2xl bg-white p-4 shadow-sm">
//         <QRCodeSVG value={value} size={size} bgColor="#ffffff" fgColor="#0f0f0f" level="M" marginSize={0} />
//       </div>
//     );
//   }

export function QrDisplay({ value, size = 200 }: { value: string; size?: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-white text-gray-900 p-6"
      style={{ width: size + 32, height: size + 32 }}
    >
      <div
        className="bg-[repeating-conic-gradient(#000_0%_25%,#fff_0%_50%)] rounded"
        style={{ width: size, height: size, backgroundSize: '20px 20px' }}
      />
      <p className="text-[10px] text-gray-500 font-mono break-all max-w-[200px] text-center">
        {value.slice(0, 32)}…
      </p>
      <p className="text-[10px] text-amber-700 text-center">
        QR stub — install qrcode.react
      </p>
    </div>
  );
}
