import { CALENDAR_DAYS_PER_COLUMN, generateOnboardingCalendar } from './onboarding-calendar';

describe('generateOnboardingCalendar (F3704 determinism)', () => {
  it('returns the identical calendar for the same answer set across calls', () => {
    // The whole point of F3704: no per-render draw. Two invocations with the
    // same inputs — as happens on every re-render of the calendar step — must
    // produce byte-identical patterns, or the squares recolour with no
    // transition while the Animated.Values hold their already-run values.
    const first = generateOnboardingCalendar(12, 0.37);
    const second = generateOnboardingCalendar(12, 0.37);
    expect(second).toEqual(first);
  });

  it('produces a full-month column of the single source-of-truth length', () => {
    const calendar = generateOnboardingCalendar(12, 0.37);
    expect(calendar).toHaveLength(CALENDAR_DAYS_PER_COLUMN);
  });

  it('yields different patterns for the two disappointment rates', () => {
    // The with/without-Crave columns must not be identical, else the
    // comparison reads as a single calendar duplicated.
    const withoutCrave = generateOnboardingCalendar(12, 0.37);
    const withCrave = generateOnboardingCalendar(12, 0.08);
    expect(withCrave).not.toEqual(withoutCrave);
  });

  it('is stable across a wide range of meal frequencies', () => {
    for (const mealsPerWeek of [1, 3, 7, 14, 21]) {
      expect(generateOnboardingCalendar(mealsPerWeek, 0.37)).toEqual(
        generateOnboardingCalendar(mealsPerWeek, 0.37)
      );
    }
  });

  it('only ever emits the three legal day states', () => {
    const calendar = generateOnboardingCalendar(14, 0.5);
    for (const day of calendar) {
      expect(['none', 'good', 'bad']).toContain(day);
    }
  });
});
