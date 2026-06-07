import { assertTransition, canTransition, type TransitionMap } from './fsm';

const GIFT_FSM: TransitionMap = {
  UNCLAIMED: ['CLAIMED', 'EXPIRED', 'RECLAIMED'],
  CLAIMED: [],
  EXPIRED: [],
  RECLAIMED: [],
};

describe('fsm', () => {
  it('allows declared transitions', () => {
    expect(canTransition('UNCLAIMED', 'CLAIMED', GIFT_FSM)).toBe(true);
    expect(() => assertTransition('UNCLAIMED', 'CLAIMED', GIFT_FSM)).not.toThrow();
  });

  it('rejects an illegal transition with validation_error', () => {
    expect(canTransition('CLAIMED', 'UNCLAIMED', GIFT_FSM)).toBe(false);
    expect(() => assertTransition('CLAIMED', 'UNCLAIMED', GIFT_FSM)).toThrow();
    try {
      assertTransition('CLAIMED', 'UNCLAIMED', GIFT_FSM);
    } catch (e) {
      expect(e).toMatchObject({ code: 'validation_error' });
    }
  });

  it('rejects an unknown current state', () => {
    expect(() => assertTransition('BOGUS', 'CLAIMED', GIFT_FSM)).toThrow();
  });

  it('treats a terminal state as having no exits', () => {
    expect(canTransition('EXPIRED', 'CLAIMED', GIFT_FSM)).toBe(false);
  });
});
