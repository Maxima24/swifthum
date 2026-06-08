import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Icon, type IconName } from '../components/Icon';

gsap.registerPlugin(ScrollTrigger);

/** Direct Mini-App launch link (BotFather direct-link launch). */
const TELEGRAM_LINK = 'https://t.me/swifthum_bot?startapp';

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

  useLayoutEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return; // links + content render statically; skip motion

    const ctx = gsap.context(() => {
      // Hero entrance
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('.hero-eyebrow', { y: 16, opacity: 0, duration: 0.6 })
        .from('.hero-line', { y: 40, opacity: 0, duration: 0.9, stagger: 0.12 }, '-=0.3')
        .from('.hero-sub', { y: 20, opacity: 0, duration: 0.7 }, '-=0.5')
        .from('.hero-cta', { y: 16, opacity: 0, scale: 0.96, duration: 0.6 }, '-=0.4')
        .from('.hero-chip', { y: 12, opacity: 0, duration: 0.4, stagger: 0.08 }, '-=0.3');

      // Drifting accent orbs
      gsap.to('.orb', {
        y: (i) => (i % 2 ? 30 : -30),
        x: (i) => (i % 2 ? -20 : 20),
        duration: 6,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
        stagger: 0.5,
      });

      // Scroll-revealed sections
      gsap.utils.toArray<HTMLElement>('.reveal').forEach((el) => {
        gsap.from(el, {
          y: 40,
          opacity: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 85%' },
        });
      });

      ScrollTrigger.batch('.feature-card', {
        start: 'top 88%',
        onEnter: (els) =>
          gsap.from(els, { y: 48, opacity: 0, duration: 0.7, ease: 'power3.out', stagger: 0.12 }),
      });
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={root}
      className="min-h-screen w-full overflow-x-hidden bg-[#0a0b0f] text-[#f3f4f6] antialiased selection:bg-[#6c63ff]/30"
    >
      {/* ── Nav ── */}
      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[#6c63ff] to-[#8b5cf6] text-white">
            <Icon name="zap" size={18} />
          </span>
          <span className="font-display text-xl font-bold tracking-tight">SwiftHum</span>
        </div>
        <a
          href={TELEGRAM_LINK}
          className="rounded-full border border-white/10 px-4 py-1.5 text-sm font-semibold text-[#cdd0d8] transition-colors hover:border-white/25 hover:text-white"
        >
          Open app
        </a>
      </header>

      {/* ── Hero ── */}
      <section className="relative mx-auto max-w-6xl px-6 pb-24 pt-12 sm:pt-20">
        {/* glows */}
        <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
          <div className="orb absolute -left-24 top-0 h-72 w-72 rounded-full bg-[#6c63ff]/30 blur-[100px]" />
          <div className="orb absolute right-0 top-24 h-80 w-80 rounded-full bg-[#8b5cf6]/25 blur-[120px]" />
          <div className="orb absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-[#3b82f6]/20 blur-[110px]" />
        </div>

        <div className="relative z-10 max-w-3xl">
          <span className="hero-eyebrow inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#a8acff]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#6c63ff]" /> Telegram-native money
          </span>

          <h1 className="font-display mt-6 text-[2.7rem] font-bold leading-[1.05] tracking-[-0.02em] sm:text-6xl">
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
              className="hero-cta group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#6c63ff] to-[#8b5cf6] px-7 py-3.5 text-base font-bold text-white shadow-[0_8px_30px_-6px_rgba(108,99,255,0.6)] transition-transform hover:scale-[1.03] active:scale-100"
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
            {['Instant NGN transfers', 'No app install', 'Verifiable on-chain-style receipts'].map(
              (t) => (
                <span key={t} className="hero-chip inline-flex items-center gap-1.5">
                  <Icon name="check" size={14} className="text-[#6c63ff]" />
                  {t}
                </span>
              ),
            )}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="relative mx-auto max-w-6xl px-6 py-16">
        <div className="reveal max-w-2xl">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to move money in chat.
          </h2>
          <p className="mt-3 text-[#9aa0ae]">
            Built for Nigeria, on a real double-entry ledger. Fast where it should be, safe where it
            matters.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="feature-card group rounded-2xl border border-white/8 bg-white/[0.03] p-6 transition-colors hover:border-[#6c63ff]/40 hover:bg-white/[0.05]"
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
      <section className="mx-auto max-w-6xl px-6 pb-24 pt-8">
        <div className="reveal relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#16131f] to-[#0e0f17] p-10 text-center sm:p-16">
          <div className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full bg-[#6c63ff]/25 blur-[80px]" />
          <div className="pointer-events-none absolute -bottom-10 -right-10 h-56 w-56 rounded-full bg-[#8b5cf6]/20 blur-[90px]" />
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
      <footer className="border-t border-white/8 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 text-sm text-[#6b7180] sm:flex-row">
          <span className="font-display font-semibold text-[#cdd0d8]">SwiftHum</span>
          <span>Money at the speed of a message · for the SwiftyEx Hackfest</span>
        </div>
      </footer>
    </div>
  );
}
