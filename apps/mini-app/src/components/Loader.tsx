/**
 * Full-screen brand loader — the Watcher mascot + wordmark + a slim
 * indeterminate progress bar. The mascot is a transparent PNG so it sits on the
 * theme `bg` in both light and dark. Motion is a gentle, reduced-motion-safe
 * breathe (functional "alive" feel, not entrance theatre).
 */
export function Loader({ label = 'Waking the Watcher…' }: { label?: string }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-6 px-8">
      <img
        src="/mascot.png"
        alt="Swifthum"
        width={132}
        height={123}
        className="w-[132px] h-auto select-none motion-safe:animate-[breathe_2.6s_ease-in-out_infinite] drop-shadow-[var(--shadow-raised)]"
        draggable={false}
      />

      <div className="flex flex-col items-center gap-3">
        <p className="font-display font-bold text-[20px] tracking-[-0.01em] text-text-primary">
          Swifthum
        </p>
        <div
          className="h-1 w-40 overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-label={label}
        >
          <span className="block h-full w-1/2 rounded-full bg-accent motion-safe:animate-[loadbar_1.3s_ease-in-out_infinite]" />
        </div>
        <p className="text-[12px] text-text-tertiary">{label}</p>
      </div>
    </div>
  );
}
