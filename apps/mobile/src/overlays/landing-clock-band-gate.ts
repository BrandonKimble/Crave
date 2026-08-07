// F1454: the landing clock's arm gate must ask the question the slicer answers —
// the ACTIVE band's row count, not the PRIMARY lane's. `primary = restaurants`,
// `secondary = dishes`; a dishes-tab episode returning few restaurants and many
// dishes must still arm the clock, or every dish row lands in one burst (the exact
// commit the clock exists to break up) with no `[LANDING]` line printed.
//
// `Math.max(primaryRowCount, secondaryRowCount)` is band-agnostic and correct: arm
// when EITHER band exceeds the fold, then the per-tab slicer holds the inactive
// band's rows as post-ramp work.
export const LANDING_ABOVE_FOLD_ROWS = 4;

export const landingClockBandExceedsFold = (
  primaryRowCount: number,
  secondaryRowCount: number
): boolean => Math.max(primaryRowCount, secondaryRowCount) > LANDING_ABOVE_FOLD_ROWS;
