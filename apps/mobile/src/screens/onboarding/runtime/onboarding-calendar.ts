/**
 * F3704: the onboarding "calendar comparison" graph used to build its day
 * pattern from `Math.random()` inside the render body, so it reshuffled on
 * every re-render (a CTA pulse, a keyboard event, a layout pass) while the
 * Animated.Values kept the values their sequence had already driven — squares
 * changed colour with no transition.
 *
 * The pattern is a DERIVATION of the answer set, not a draw: same
 * `mealsPerWeek` + `disappointmentRate` must yield the identical calendar
 * every time. This module seeds a small deterministic PRNG from those inputs
 * so the generator is pure and unit-testable, and owns the single source of
 * truth for the per-column day count.
 */

/** Days rendered per calendar column ("30 days (full month)"). */
export const CALENDAR_DAYS_PER_COLUMN = 30;

export type CalendarDay = 'none' | 'good' | 'bad';

// Higher weight = more likely to eat out, keyed by day-of-week
// (0=Sunday leftmost column ... 6=Saturday rightmost column).
const DAY_WEIGHTS = [
  1.6, // Sun
  0.8, // Mon
  0.7, // Tue
  0.8, // Wed
  1.2, // Thu
  1.8, // Fri
  2.0, // Sat
];

/**
 * mulberry32 — a tiny, fast, deterministic 32-bit PRNG. Given the same seed it
 * emits the same sequence, which is exactly what makes the calendar a
 * derivation rather than a per-render draw.
 */
const createSeededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Derive a stable integer seed from the answer set. `disappointmentRate` is
 * folded in so the two side-by-side calendars (with/without Crave) differ from
 * each other while each remaining stable across re-renders.
 */
const seedFrom = (mealsPerWeek: number, disappointmentRate: number): number => {
  const a = Math.round(mealsPerWeek * 1000);
  const b = Math.round(disappointmentRate * 1000);
  // A cheap, order-sensitive mix; the exact constants only need to be stable.
  return (Math.imul(a, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca77)) >>> 0;
};

/**
 * Build the month calendar deterministically for the given answers.
 * Weighted towards weekends with some clustering, mirroring the original
 * visual intent — but reproducible.
 */
export const generateOnboardingCalendar = (
  mealsPerWeek: number,
  disappointmentRate: number
): CalendarDay[] => {
  const totalDays = CALENDAR_DAYS_PER_COLUMN;
  const random = createSeededRandom(seedFrom(mealsPerWeek, disappointmentRate));

  // (meals per week) × (30 days / 7 days per week)
  const totalMealsInMonth = Math.round(mealsPerWeek * (totalDays / 7));

  const calendar: CalendarDay[] = Array(totalDays).fill('none');

  // Weighted pool of days: each day appears proportional to its weight.
  const weightedDays: number[] = [];
  for (let i = 0; i < totalDays; i++) {
    const dayOfWeek = i % 7;
    const copies = Math.round(DAY_WEIGHTS[dayOfWeek] * 10);
    for (let j = 0; j < copies; j++) {
      weightedDays.push(i);
    }
  }

  // Select eating days from the weighted pool.
  const selectedDays = new Set<number>();
  while (selectedDays.size < totalMealsInMonth && selectedDays.size < totalDays) {
    const randomIdx = Math.floor(random() * weightedDays.length);
    selectedDays.add(weightedDays[randomIdx]);
  }

  const eatingDays = Array.from(selectedDays).sort((a, b) => a - b);

  // Add some clustering (back-to-back days): ~30% chance of adjacency.
  const clusteredDays = [...eatingDays];
  eatingDays.forEach((day) => {
    if (random() < 0.3 && clusteredDays.length < totalMealsInMonth) {
      const nextDay = day + 1;
      if (nextDay < totalDays && !clusteredDays.includes(nextDay)) {
        clusteredDays.push(nextDay);
      }
    }
  });

  const finalEatingDays = clusteredDays.sort((a, b) => a - b).slice(0, totalMealsInMonth);

  // Determine which eating days are disappointing.
  const targetBad = Math.round(finalEatingDays.length * disappointmentRate);
  const shuffledIndices = finalEatingDays.map((_, i) => i).sort(() => random() - 0.5);

  finalEatingDays.forEach((dayIndex, i) => {
    const isBad = shuffledIndices.indexOf(i) < targetBad;
    calendar[dayIndex] = isBad ? 'bad' : 'good';
  });

  return calendar;
};
