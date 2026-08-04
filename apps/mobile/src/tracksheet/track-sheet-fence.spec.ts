// ─── R7 FALSIFIER: the sheet-leg fence's at-rest decision (D2 closed) ─────────
//
// The host self-offers 'sheet' on every runtime publish; if this decision ever
// answers "at rest" while a proven motion fact is live, the reveal can land
// mid-slide — the exact freeze the deferral warned about. Proven RED by
// mutation: dropping ANY one fact from sheetLegIsAtRest fails the matching case
// below (verified during R7 by mutating the function to ignore `dragging` —
// the first test failed — then reverting).

import { sheetLegIsAtRest, type SheetLegMotionFacts } from './track-sheet-fence';

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
