import { useEffect, useId, useRef, useState } from 'react';
import type { Execution, Operator } from '../types';
import type { PricePoint } from '../hooks/usePriceSeries';
import { formatPriceMinor } from '../lib/format';
import { Icon } from './Icon';

const PAD_T = 10;
const PAD_B = 10;
const PAD_X = 2;

interface Props {
  points: PricePoint[];
  threshold: number; // minor units
  op: Operator;
  executions?: Execution[];
  /** true when a fresh value arrived recently — drives the LIVE indicator. */
  live?: boolean;
}

/**
 * Realtime price chart for a rule's asset, drawn as a lightweight inline SVG
 * (no chart lib — themes via tokens, zero deps). Shows the price line + area,
 * the rule's threshold as a dashed reference line, markers where the rule
 * fired, and a live "now" dot at the latest point.
 *
 * It measures its own width (ResizeObserver) and computes coordinates in real
 * pixels, so dots stay circular and strokes stay crisp at any size — no
 * preserveAspectRatio stretching.
 */
export function PriceChart({ points, threshold, op, executions = [], live }: Props) {
  const gradId = useId().replace(/[:]/g, '');
  const wrapRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const H = 176;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setW(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const prices = points.map((p) => p.price);
  const last = points[points.length - 1];
  const first = points[0]?.price ?? 0;
  const up = (last?.price ?? 0) >= first;

  return (
    <div className="text-accent">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-tertiary">
            Live price
          </p>
          <p className="font-display text-[26px] font-bold tracking-[-0.02em] tnum text-text-primary mt-0.5">
            {last ? formatPriceMinor(last.price) : '—'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {live && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-bold text-success">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              LIVE
            </span>
          )}
          {points.length >= 2 && (
            <span
              className={`inline-flex items-center gap-1 text-[12px] font-semibold tnum ${
                up ? 'text-success' : 'text-danger'
              }`}
            >
              <Icon name={up ? 'trending-up' : 'trending-down'} size={13} />
              {(((last.price - first) / first) * 100).toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      <div ref={wrapRef} style={{ height: H }} className="w-full">
        {w > 0 && points.length >= 2 ? (
          <Plot
            w={w}
            h={H}
            gradId={gradId}
            points={points}
            prices={prices}
            threshold={threshold}
            executions={executions}
          />
        ) : (
          <div className="h-full rounded-xl bg-surface-muted animate-pulse" aria-hidden />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-[12px] text-text-secondary">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block w-4 border-t border-dashed border-border-strong" />
          Trigger {op.startsWith('crosses') ? 'crosses' : op === 'lt' ? 'below' : 'above'}{' '}
          <span className="font-semibold text-text-primary tnum">
            {formatPriceMinor(threshold)}
          </span>
        </span>
        {last && (
          <span className="tnum">
            {Math.abs(((last.price - threshold) / threshold) * 100).toFixed(1)}%{' '}
            {last.price >= threshold ? 'above' : 'below'} trigger
          </span>
        )}
        {executions.length > 0 && (
          <span className="inline-flex items-center gap-1.5 ml-auto">
            <span className="inline-block h-2 w-2 rounded-full bg-warning" />
            Fired
          </span>
        )}
      </div>
    </div>
  );
}

function Plot({
  w,
  h,
  gradId,
  points,
  prices,
  threshold,
  executions,
}: {
  w: number;
  h: number;
  gradId: string;
  points: PricePoint[];
  prices: number[];
  threshold: number;
  executions: Execution[];
}) {
  const tMin = points[0].t;
  const tMax = points[points.length - 1].t;
  const tSpan = Math.max(1, tMax - tMin);

  // Fit the y-range to the PRICE series first (that's the live data we care
  // about), with headroom. Only widen to include the threshold when it's near
  // the price band; if the trigger is far off-screen, we keep the price legible
  // and pin the threshold line to the nearest edge instead of squashing
  // everything to fit it.
  const pLo = Math.min(...prices);
  const pHi = Math.max(...prices);
  const pSpan = Math.max(1, pHi - pLo);
  let yLo = pLo - pSpan * 0.2;
  let yHi = pHi + pSpan * 0.2;
  const nearBand = pSpan * 4; // threshold counts as "near" within this margin
  if (threshold >= pLo - nearBand && threshold <= pHi + nearBand) {
    // Include the threshold with a small margin so it sits inside the frame but
    // doesn't flatten the price line.
    yLo = Math.min(yLo, threshold - pSpan * 0.5);
    yHi = Math.max(yHi, threshold + pSpan * 0.5);
  }
  const ySpan = yHi - yLo;

  const x = (t: number) => PAD_X + ((t - tMin) / tSpan) * (w - PAD_X * 2);
  const clampY = (v: number) => Math.max(PAD_T, Math.min(h - PAD_B, v));
  const y = (price: number) =>
    clampY(PAD_T + (1 - (price - yLo) / ySpan) * (h - PAD_T - PAD_B));
  const thresholdOffscreen = threshold < yLo || threshold > yHi;

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.price).toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L${(w - PAD_X).toFixed(1)},${h} L${PAD_X},${h} Z`;

  const last = points[points.length - 1];
  const lastX = x(last.t);
  const lastY = y(last.price);
  const thY = y(threshold);

  const fires = executions
    .map((e) => {
      const t = Math.min(tMax, Math.max(tMin, new Date(e.firedAt).getTime()));
      return { id: e.id, cx: x(t), cy: y(e.priceAtFireMinor) };
    })
    .filter((f) => Number.isFinite(f.cx) && Number.isFinite(f.cy));

  return (
    <svg width={w} height={h} className="block overflow-visible" role="img" aria-label="Realtime price chart">
      <defs>
        <linearGradient id={`fill-${gradId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      <line
        x1={0}
        x2={w}
        y1={thY}
        y2={thY}
        strokeWidth="1"
        strokeDasharray="3 3"
        className={thresholdOffscreen ? 'text-warning' : 'text-border-strong'}
        stroke="currentColor"
        opacity={thresholdOffscreen ? 0.7 : 1}
      />

      <path d={areaPath} fill={`url(#fill-${gradId})`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {fires.map((f) => (
        <circle
          key={f.id}
          cx={f.cx}
          cy={f.cy}
          r="4"
          className="text-warning"
          fill="currentColor"
          stroke="var(--surface)"
          strokeWidth="2"
        />
      ))}

      <circle cx={lastX} cy={lastY} r="4" fill="currentColor" stroke="var(--surface)" strokeWidth="2" />
      <circle cx={lastX} cy={lastY} r="4" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
        <animate attributeName="r" values="4;11;4" dur="2.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.45;0;0.45" dur="2.2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
