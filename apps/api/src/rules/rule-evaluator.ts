import type { Operator } from './rules.dto';
import type { Asset } from '../common/assets';

export interface EvaluateInput {
  op: Operator;
  asset: Asset;
  targetMinor: bigint;
  currentMinor: bigint;
  previousMinor?: bigint;
}

/**
 * Pure function — given a rule condition + current/previous prices, decide
 * whether the rule fires. No DB, no side effects. Unit-test extensively.
 *
 *   lt              current < target
 *   gt              current > target
 *   crosses_above   previous < target AND current >= target
 *   crosses_below   previous > target AND current <= target
 *
 * For crosses_*, returns false when previous is missing (first tick after boot
 * or first time the asset is seen).
 */
export function evaluate(input: EvaluateInput): boolean {
  const { op, targetMinor, currentMinor, previousMinor } = input;

  switch (op) {
    case 'lt':
      return currentMinor < targetMinor;
    case 'gt':
      return currentMinor > targetMinor;
    case 'crosses_above':
      if (previousMinor === undefined) return false;
      return previousMinor < targetMinor && currentMinor >= targetMinor;
    case 'crosses_below':
      if (previousMinor === undefined) return false;
      return previousMinor > targetMinor && currentMinor <= targetMinor;
  }
}

/**
 * Rule state heuristic for the dashboard UI:
 *   - no current price → sleeping
 *   - within 1% of target → watching
 *   - otherwise → sleeping
 *
 * The `fired` and `paused` states are owned elsewhere; this function never returns them.
 */
export type DisplayState = 'sleeping' | 'watching';

export function computeState(
  targetMinor: bigint,
  currentMinor: bigint | undefined,
): DisplayState {
  if (currentMinor === undefined || targetMinor === 0n) return 'sleeping';
  const diff = currentMinor > targetMinor ? currentMinor - targetMinor : targetMinor - currentMinor;
  // drift = diff / target, expressed as parts-per-million to keep integer math safe
  const driftPpm = (diff * 1_000_000n) / targetMinor;
  return driftPpm <= 10_000n ? 'watching' : 'sleeping';
}
