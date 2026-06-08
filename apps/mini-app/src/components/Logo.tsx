/**
 * SwiftHum brand lockup — the mascot + the Fredoka "Swifthum" wordmark.
 * Mirrors MobileBrandBar so the brand reads consistently. `word` toggles the
 * wordmark; `tone` picks text color (the dark landing uses 'light').
 */
export function Logo({
  size = 28,
  word = true,
  tone = 'auto',
  className = '',
}: {
  size?: number;
  word?: boolean;
  tone?: 'auto' | 'light';
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src="/mascot.png"
        alt="SwiftHum"
        width={size}
        height={size}
        style={{ width: size, height: 'auto' }}
        className="select-none"
        draggable={false}
      />
      {word && (
        <span
          className={`font-display font-bold tracking-[-0.01em] ${
            tone === 'light' ? 'text-white' : 'text-text-primary'
          }`}
          style={{ fontSize: Math.round(size * 0.62) }}
        >
          Swifthum
        </span>
      )}
    </span>
  );
}
