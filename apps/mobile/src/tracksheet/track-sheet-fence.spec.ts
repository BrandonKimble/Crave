// ─── R7 FALSIFIER: the sheet-leg fence's at-rest decision (D2 closed) ─────────
//
// The host self-offers 'sheet' on every runtime publish; if this decision ever
// answers "at rest" while a proven motion fact is live, the reveal can land
// mid-slide — the exact freeze the deferral warned about. Proven RED by
// mutation: dropping ANY one fact from sheetLegIsAtRest fails the matching case
// below (verified during R7 by mutating the function to ignore `dragging` —
// the first test failed — then reverting).

import {
  hiddenEdgeEventMatchesArmed,
  resolveSnapRetryDecision,
  sheetLegIsAtRest,
  SNAP_RETRY_MAX_ATTEMPTS,
  type SheetLegMotionFacts,
  type SnapRetryFacts,
} from './track-sheet-fence';

const atRest: SheetLegMotionFacts = {
  dragging: false,
  inFlightSnapTarget: null,
  pendingSettleToken: null,
  hiddenExcursionInFlight: false,
};

describe('sheetLegIsAtRest (R7 fence — motion-keyed on both sides)', () => {
  it('no motion fact live → at rest (the "redraw arms at rest → ready immediately" case)', () => {
    expect(sheetLegIsAtRest(atRest)).toBe(true);
  });

  it('a live drag holds the fence (the finger owns τ)', () => {
    expect(sheetLegIsAtRest({ ...atRest, dragging: true })).toBe(false);
  });

  it('a commanded flight holds the fence (in-flight snap target)', () => {
    expect(sheetLegIsAtRest({ ...atRest, inFlightSnapTarget: 'middle' })).toBe(false);
  });

  it('an uncompleted settle token holds the fence (flight without a target read)', () => {
    expect(sheetLegIsAtRest({ ...atRest, pendingSettleToken: 7 })).toBe(false);
  });

  it('a hidden excursion holds the fence (its flight records no detent target by design)', () => {
    expect(sheetLegIsAtRest({ ...atRest, hiddenExcursionInFlight: true })).toBe(false);
  });
});

// ─── G-HIDDEN native red team: the generation-stamped edge ────────────────────
// If this predicate ever accepts a mismatched (or unarmed) edge, a stale
// hiddenTargetTau's spurious trackHiddenEdgeCleared commits a content swap /
// settles a hide that is not happening. Proven RED by mutation: making it
// return `armed != null` (ignore the event stamp) fails the mismatch case;
// returning true when armed is null fails the unarmed case.
describe('hiddenEdgeEventMatchesArmed (generation-stamped edge, one excursion at a time)', () => {
  it('matching generations → a real boundary', () => {
    expect(hiddenEdgeEventMatchesArmed(3, 3)).toBe(true);
  });

  it('a mismatched generation is a stale excursion, never consumed', () => {
    expect(hiddenEdgeEventMatchesArmed(3, 2)).toBe(false);
    expect(hiddenEdgeEventMatchesArmed(2, 3)).toBe(false);
  });

  it('nothing armed → every edge is stale', () => {
    expect(hiddenEdgeEventMatchesArmed(null, 3)).toBe(false);
  });

  it('an unstamped event is never consumed', () => {
    expect(hiddenEdgeEventMatchesArmed(3, null)).toBe(false);
  });
});

// ─── FIX 3: the snap-retry decision (THE FINGER OWNS TAU, both sides) ─────────
// If the loop ever retries into a live drag or re-issues a refused command,
// the spring fights the pan frame-by-frame — the exact class refuse()'s
// tracking guard exists to kill. Proven RED by mutation: dropping the
// `dragging` branch fails the first case; dropping `refused` fails the
// second; inverting the distance check fails the arrival case.
describe('resolveSnapRetryDecision (retrying snap loop, per-step verdict)', () => {
  const step: SnapRetryFacts = { dragging: false, refused: false, attempts: 1, distance: 300 };

  it('a live finger aborts — the user owns τ', () => {
    expect(resolveSnapRetryDecision({ ...step, dragging: true })).toBe('abort-finger');
  });

  it('a native refusal aborts FOR GOOD — the stale command is never re-issued', () => {
    expect(resolveSnapRetryDecision({ ...step, refused: true })).toBe('abort-refused');
  });

  it('the finger outranks even a refusal verdict', () => {
    expect(resolveSnapRetryDecision({ ...step, dragging: true, refused: true })).toBe(
      'abort-finger'
    );
  });

  it('arrived (within 1pt) → done, no further issues', () => {
    expect(resolveSnapRetryDecision({ ...step, distance: 0.5 })).toBe('done');
  });

  it('attempts budget expired → done (F874: a budget that EXPIRES is deliberate)', () => {
    expect(resolveSnapRetryDecision({ ...step, attempts: SNAP_RETRY_MAX_ATTEMPTS })).toBe('done');
  });

  it('short of the target with budget left → retry', () => {
    expect(resolveSnapRetryDecision(step)).toBe('retry');
  });
});
