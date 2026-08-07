import { LANDING_ABOVE_FOLD_ROWS, landingClockBandExceedsFold } from './landing-clock-band-gate';

describe('landingClockBandExceedsFold (F1454)', () => {
  it('arms when the PRIMARY (restaurants) band exceeds the fold', () => {
    expect(landingClockBandExceedsFold(LANDING_ABOVE_FOLD_ROWS + 1, 0)).toBe(true);
  });

  it('arms when the SECONDARY (dishes) band exceeds the fold even with few restaurants', () => {
    // The pre-fix gate looked only at primaryData.length and returned false here,
    // letting every dish row land in one burst with no [LANDING] beat.
    expect(landingClockBandExceedsFold(1, LANDING_ABOVE_FOLD_ROWS + 20)).toBe(true);
  });

  it('does not arm when neither band exceeds the fold', () => {
    expect(landingClockBandExceedsFold(LANDING_ABOVE_FOLD_ROWS, LANDING_ABOVE_FOLD_ROWS)).toBe(
      false
    );
  });
});
