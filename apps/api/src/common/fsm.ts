import { Errors } from './errors';

/**
 * Tiny finite-state-machine guard. Each feature (gift, escrow, …) declares an
 * `allowedMap` of `currentState → [legal next states]` and calls
 * `assertTransition(current, next, map)` in the **service layer** before
 * persisting. Illegal moves throw `validation_error`. The client is never
 * trusted to drive transitions — §4 of the hackfest plan.
 *
 * Usage:
 *   const GIFT_FSM = {
 *     UNCLAIMED: ['CLAIMED', 'EXPIRED', 'RECLAIMED'],
 *     CLAIMED: [], EXPIRED: [], RECLAIMED: [],
 *   } as const;
 *   assertTransition(gift.state, 'CLAIMED', GIFT_FSM);
 */
export type TransitionMap = Record<string, readonly string[]>;

export function canTransition(current: string, next: string, allowed: TransitionMap): boolean {
  return (allowed[current] ?? []).includes(next);
}

export function assertTransition<M extends TransitionMap>(
  current: string,
  next: string,
  allowed: M,
): void {
  if (!(current in allowed)) {
    throw Errors.validation(`unknown state "${current}"`);
  }
  if (!canTransition(current, next, allowed)) {
    throw Errors.validation(`illegal transition ${current} → ${next}`);
  }
}
