import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Icon, type IconName } from '../components/Icon';
import { Logo } from '../components/Logo';

gsap.registerPlugin(ScrollTrigger);

/**
 * Opens the @swifthum_bot chat, where the "Open SwiftHum" menu button launches
 * the Mini App. Reliable without any BotFather Mini-App config. (To open the app
 * in one tap instead, set a Main Mini App in BotFather and use `?startapp`.)
 */
const TELEGRAM_LINK = 'https://t.me/swifthum_bot';

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'send',
    title: 'Pay anyone in seconds',
    body: 'Send NGN by QR or straight to a @username — it lands in their wallet instantly.',
  },
  {
    icon: 'sparkles',
    title: 'Gift links that onboard',
    body: 'Lock naira into a link. Opening it creates the recipient’s wallet and delivers the money in one tap.',
  },
  {
    icon: 'check-circle',
    title: 'Receipts you can verify',
    body: 'Every payment mints a tamper-proof, signed receipt — shareable as a link, verifiable by anyone.',
  },
  {
    icon: 'wallet',
    title: 'Escrow, safe by construction',
    body: 'Funds sit locked until both sides are happy. Disputes get resolved fairly — money never at risk.',
  },
  {
    icon: 'trending-up',
    title: 'The Watcher',
    body: 'Set rules like “alert when USDT dips” — they fire on real SwiftyEx rates, around the clock.',
  },
  {
    icon: 'zap',
    title: 'Real double-entry ledger',
    body: 'Every kobo is accounted for on a proper ledger — the same foundation real fintech is built on.',
  },
];

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let cleanupPointer: (() => void) | undefined;

    const ctx = gsap.context(() => {
      if (reduce) return; // reduced-motion: leave everything rendered + visible

      // ── Entrance ──
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('.hero-eyebrow', { y: 16, opacity: 0, duration: 0.6 })
        .from('.hero-line', { y: 40, opacity: 0, duration: 0.9, stagger: 0.12 }, '-=0.3')
        .from('.hero-sub', { y: 20, opacity: 0, duration: 0.7 }, '-=0.5')
        .from('.hero-cta', { y: 16, opacity: 0, scale: 0.96, duration: 0.6 }, '-=0.4')
        .from('.hero-chip', { y: 12, opacity: 0, duration: 0.4, stagger: 0.08 }, '-=0.3')
        .from('.mascot', { opacity: 0, scale: 0.82, duration: 0.9 }, '-=0.9')
        .from('.glass-card', { opacity: 0, scale: 0.8, y: 24, duration: 0.7, stagger: 0.1 }, '-=0.6');

      // ── Idle float loops ──
      gsap.to('.mascot', { y: -16, duration: 3.2, ease: 'sine.inOut', repeat: -1, yoyo: true });
      gsap.utils.toArray<HTMLElement>('.glass-card').forEach((card, i) => {
        gsap.to(card, {
          y: i % 2 ? 14 : -14,
          duration: 3 + i * 0.45,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        });
      });
      gsap.to('.orb', {
        y: (i) => (i % 2 ? 30 : -30),
        x: (i) => (i % 2 ? -20 : 20),
        duration: 6,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
        stagger: 0.5,
      });

      // ── Scroll reveals (robust: hide → reveal once → refresh → force-show fallback) ──
      const revealEls = gsap.utils.toArray<HTMLElement>('.reveal, .feature-card');
      gsap.set(revealEls, { opacity: 0, y: 40 });
      ScrollTrigger.batch('.reveal, .feature-card', {
        start: 'top 92%',
        once: true,
        onEnter: (els) =>
          gsap.to(els, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.1, overwrite: true }),
      });
      // Recompute trigger positions once the mascot image has loaded (layout shift),
      // then force-show anything still hidden so a mis-fire can never strand a card.
      ScrollTrigger.refresh();
      gsap.delayedCall(1.6, () => {
        revealEls.forEach((el) => {
          if (Number(gsap.getProperty(el, 'opacity')) < 1) {
            gsap.to(el, { opacity: 1, y: 0, duration: 0.4, overwrite: true });
          }
        });
      });

      // ── Pointer parallax (desktop only) ──
      if (window.matchMedia('(pointer: fine)').matches && stage.current && scene.current) {
        const stageEl = stage.current;
        const rotY = gsap.quickTo(scene.current, 'rotationY', { duration: 0.7, ease: 'power3' });
        const rotX = gsap.quickTo(scene.current, 'rotationX', { duration: 0.7, ease: 'power3' });
        const cards = gsap.utils.toArray<HTMLElement>('.glass-card');
        const setters = cards.map((c) => gsap.quickTo(c, 'x', { duration: 0.7, ease: 'power3' }));

        const onMove = (e: PointerEvent) => {
          const r = stageEl.getBoundingClientRect();
          const x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
          const y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
          rotY(x * 7);
          rotX(-y * 7);
          cards.forEach((c, i) => setters[i](x * (Number(c.dataset.depth) || 30) * 0.25));
        };
        const onLeave = () => {
          rotY(0);
          rotX(0);
          setters.forEach((s) => s(0));
        };
        stageEl.addEventListener('pointermove', onMove);
        stageEl.addEventListener('pointerleave', onLeave);
        cleanupPointer = () => {
          stageEl.removeEventListener('pointermove', onMove);
          stageEl.removeEventListener('pointerleave', onLeave);
        };
      }
    }, root);

    return () => {
      cleanupPointer?.();
      ctx.revert();
    };
  }, []);

  return (
    <div
      ref={root}
      className="relative min-h-screen w-full overflow-x-hidden bg-[#0a0b0f] text-[#f3f4f6] antialiased selection:bg-[#6c63ff]/30"
    >
      {/* dotted-grid depth layer */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.4]"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%)',
        }}
      />

      {/* ── Nav ── */}
      <header className="relative z-20 mx-auto flex w-full 2xl:max-w-[110rem] items-center justify-between px-5 sm:px-8 lg:px-14 xl:px-20 py-5">
        <Logo size={30} tone="light" />
        <a
          href={TELEGRAM_LINK}
          className="rounded-full border border-white/10 px-4 py-1.5 text-sm font-semibold text-[#cdd0d8] transition-colors hover:border-white/25 hover:text-white"
        >
          Open app
        </a>
      </header>

      {/* ── Hero ── */}
      <section className="relative z-10 mx-auto grid w-full 2xl:max-w-[110rem] items-center gap-12 px-5 sm:px-8 lg:px-14 xl:px-20 pb-24 pt-8 sm:pt-14 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pb-32">
        {/* glows */}
        <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
          <div className="orb absolute -left-24 top-0 h-72 w-72 rounded-full bg-[#6c63ff]/30 blur-[100px]" />
          <div className="orb absolute right-0 top-24 h-80 w-80 rounded-full bg-[#8b5cf6]/25 blur-[120px]" />
          <div className="orb absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-[#3b82f6]/20 blur-[110px]" />
        </div>

        {/* copy */}
        <div className="relative z-10">
          <span className="hero-eyebrow inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#a8acff]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#6c63ff]" /> Telegram-native money
          </span>

          <h1 className="font-display mt-6 text-[2.6rem] font-bold leading-[1.05] tracking-[-0.02em] sm:text-[3.4rem]">
            <span className="hero-line block">Money that moves at</span>
            <span className="hero-line block bg-gradient-to-r from-[#a8acff] via-[#8b5cf6] to-[#6c63ff] bg-clip-text text-transparent">
              the speed of a message.
            </span>
          </h1>

          <p className="hero-sub mt-6 max-w-xl text-lg leading-relaxed text-[#9aa0ae]">
            SwiftHum is a Telegram Mini App for instant naira payments, gift links, verifiable
            receipts and P2P escrow — with a watcher that trades on real SwiftyEx rates.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href={TELEGRAM_LINK}
              className="hero-cta inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#6c63ff] to-[#8b5cf6] px-7 py-3.5 text-base font-bold text-white shadow-[0_8px_30px_-6px_rgba(108,99,255,0.6)] transition-transform hover:scale-[1.03] active:scale-100"
            >
              <Icon name="send" size={18} />
              Open in Telegram
            </a>
            <a
              href="#features"
              className="hero-cta inline-flex items-center gap-1.5 rounded-full px-4 py-3.5 text-sm font-semibold text-[#cdd0d8] hover:text-white"
            >
              See what it does
              <Icon name="chevron-right" size={16} />
            </a>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-[#7e8493]">
            {['Instant NGN transfers', 'No app install', 'Verifiable receipts'].map((t) => (
              <span key={t} className="hero-chip inline-flex items-center gap-1.5">
                <Icon name="check" size={14} className="text-[#6c63ff]" />
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* 3D scene */}
        <div
          ref={stage}
          className="relative z-10 h-[360px] sm:h-[440px] lg:h-[540px]"
          style={{ perspective: '1100px' }}
        >
          <div
            ref={scene}
            className="absolute inset-0"
            style={{ transformStyle: 'preserve-3d' }}
          >
            {/* halo */}
            <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#6c63ff]/30 blur-[70px]" />

            {/* mascot centerpiece */}
            <img
              src="/mascot.png"
              alt="SwiftHum mascot"
              draggable={false}
              className="mascot absolute left-1/2 top-1/2 w-40 -translate-x-1/2 -translate-y-1/2 select-none sm:w-52 lg:w-60"
              style={{ filter: 'drop-shadow(0 24px 40px rgba(108,99,255,0.45))' }}
            />

            {/* glass cards — safe insets, quadrants; the two bottom ones are
                desktop-only so the narrow mobile stage stays uncluttered. */}
            <GlassCard depth={55} className="flex left-0 top-2">
              <span className="text-xl">🎁</span>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[#9aa0ae]">Gift link</p>
                <p className="font-display text-base font-bold text-white">₦5,000</p>
              </div>
            </GlassCard>

            <GlassCard depth={40} className="flex right-0 top-0">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[#0a8c5a]/20 text-[#34d399]">
                <Icon name="check" size={16} strokeWidth={3} />
              </span>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[#9aa0ae]">Receipt</p>
                <p className="text-sm font-semibold text-white">Verified ✓</p>
              </div>
            </GlassCard>

            <GlassCard depth={30} className="hidden sm:flex bottom-6 left-0">
              <span className="text-lg">🛡</span>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[#9aa0ae]">Escrow</p>
                <p className="text-sm font-semibold text-white">Funds locked</p>
              </div>
            </GlassCard>

            <GlassCard depth={50} className="flex bottom-2 right-0">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[#6c63ff]/20 text-[#a8acff]">
                <Icon name="trending-up" size={16} />
              </span>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[#9aa0ae]">USDT · live</p>
                <p className="text-sm font-semibold text-white tnum">₦1,392</p>
              </div>
            </GlassCard>

            {/* naira coin */}
            <div
              data-depth={65}
              className="glass-card absolute left-4 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-gradient-to-br from-[#6c63ff] to-[#8b5cf6] font-display text-lg font-bold text-white shadow-[0_10px_30px_-8px_rgba(108,99,255,0.7)]"
            >
              ₦
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="relative z-10 mx-auto w-full 2xl:max-w-[110rem] px-5 sm:px-8 lg:px-14 xl:px-20 py-16">
        <div className="reveal max-w-2xl">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to move money in chat.
          </h2>
          <p className="mt-3 text-[#9aa0ae]">
            Built for Nigeria, on a real double-entry ledger. Fast where it should be, safe where it
            matters.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="feature-card group rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-[#6c63ff]/40 hover:bg-white/[0.06] hover:shadow-[0_20px_50px_-20px_rgba(108,99,255,0.5)]"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#6c63ff]/15 text-[#a8acff] transition-colors group-hover:bg-[#6c63ff]/25">
                <Icon name={f.icon} size={22} />
              </span>
              <h3 className="font-display mt-4 text-lg font-bold tracking-tight text-white">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#9aa0ae]">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <section className="relative z-10 mx-auto w-full 2xl:max-w-[110rem] px-5 sm:px-8 lg:px-14 xl:px-20 pb-24 pt-8">
        <div className="reveal relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center backdrop-blur-xl sm:p-16">
          <div className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full bg-[#6c63ff]/25 blur-[80px]" />
          <div className="pointer-events-none absolute -bottom-10 -right-10 h-56 w-56 rounded-full bg-[#8b5cf6]/20 blur-[90px]" />
          <img
            src="/mascot.png"
            alt=""
            aria-hidden
            draggable={false}
            className="relative mx-auto mb-6 w-20 select-none"
            style={{ filter: 'drop-shadow(0 16px 30px rgba(108,99,255,0.4))' }}
          />
          <h2 className="font-display relative text-3xl font-bold tracking-tight sm:text-5xl">
            Open SwiftHum in Telegram.
          </h2>
          <p className="relative mx-auto mt-4 max-w-md text-[#9aa0ae]">
            No download, no signup forms. Tap once and your wallet is ready.
          </p>
          <a
            href={TELEGRAM_LINK}
            className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#6c63ff] to-[#8b5cf6] px-8 py-4 text-base font-bold text-white shadow-[0_8px_30px_-6px_rgba(108,99,255,0.6)] transition-transform hover:scale-[1.03] active:scale-100"
          >
            <Icon name="send" size={18} />
            Launch the Mini App
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-white/8 py-8">
        <div className="mx-auto flex w-full 2xl:max-w-[110rem] flex-col items-center justify-between gap-3 px-5 sm:px-8 lg:px-14 xl:px-20 text-sm text-[#6b7180] sm:flex-row">
          <Logo size={24} tone="light" />
          <span>Money at the speed of a message · for the SwiftyEx Hackfest</span>
        </div>
      </footer>
    </div>
  );
}

/** Frosted-glass floating card. `depth` drives pointer-parallax strength. */
function GlassCard({
  depth,
  className = '',
  children,
}: {
  depth: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-depth={depth}
      className={`glass-card absolute items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 shadow-[0_16px_50px_-16px_rgba(0,0,0,0.7)] backdrop-blur-xl ring-1 ring-inset ring-white/5 ${className}`}
    >
      {children}
    </div>
  );
}
