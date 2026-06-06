import { useEffect, useState } from 'react';
import { usePrices } from './prices';
import type { Asset } from '../types';

export interface PricePoint {
  t: number; // epoch ms
  price: number; // minor units
}

const MAX_POINTS = 60; // rolling window (~10 min at a 10s poll)
const SEED_POINTS = 24; // synthetic backfill so the chart isn't empty on load

// Module-level so the series survives RuleDetail remounts and keeps growing as
// the user navigates around. One rolling series per asset.
const seriesByAsset: Record<string, PricePoint[]> = {};

/** Synthetic gentle random-walk backfill ending at `current`, so a fresh chart
 *  has shape immediately. Real points then append on top as polls arrive. */
function seed(current: number): PricePoint[] {
  const now = Date.now();
  const pts: PricePoint[] = [];
  // Build a wavy walk with visible amplitude so the chart reads as a real price
  // line, not a flat top edge. Combines a sine swell with random noise, then
  // ends exactly at `current`.
  const raw: number[] = [];
  let p = current;
  for (let i = 0; i <= SEED_POINTS; i++) {
    const wave = Math.sin((i / SEED_POINTS) * Math.PI * 2.2) * 0.012; // ±1.2%
    const noise = (Math.random() - 0.5) * 0.006; // ±0.3%
    p = Math.max(1, p * (1 + wave * 0.15 + noise));
    raw.push(p);
  }
  // Normalize so the last seeded point equals `current`.
  const scale = current / raw[raw.length - 1];
  for (let i = 0; i <= SEED_POINTS; i++) {
    pts.push({
      t: now - (SEED_POINTS - i) * 10_000,
      price: Math.round(raw[i] * scale),
    });
  }
  return pts;
}

/**
 * Rolling realtime price series for one asset, driven by the existing 10s
 * `usePrices` poll. Returns the points plus the latest value. The series is
 * seeded once (so the chart has shape on first render) then grows live.
 */
export function usePriceSeries(asset: Asset): {
  points: PricePoint[];
  latest: number | undefined;
} {
  const { data: prices } = usePrices();
  const current = prices?.[asset];
  const [, force] = useState(0);

  useEffect(() => {
    if (current == null) return;
    let series = seriesByAsset[asset];
    if (!series) {
      series = seed(current);
      seriesByAsset[asset] = series;
    } else {
      const last = series[series.length - 1];
      // Only append when the value actually changed (or enough time passed),
      // so React-Query cache hits don't pile duplicate points.
      if (!last || last.price !== current || Date.now() - last.t > 9_000) {
        series.push({ t: Date.now(), price: current });
        if (series.length > MAX_POINTS) series.splice(0, series.length - MAX_POINTS);
      }
    }
    force((n) => n + 1);
  }, [asset, current]);

  return {
    points: seriesByAsset[asset] ?? [],
    latest: current,
  };
}
