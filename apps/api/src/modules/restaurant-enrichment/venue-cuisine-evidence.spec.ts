/**
 * Unit laws for the D5 dish-set venue-cuisine evidence lane (pure parts).
 * The DB-level laws — lane idempotency, projection — are proven against
 * Postgres in venue-cuisine-lanes.integration.spec.ts. (The former
 * venue_name lane and its product-kind vote were deleted 2026-08-30: the
 * venue name is now judged by the LLM venue-facts judge, whose homograph
 * boundaries are pinned in scripts/fixtures/cuisine-gold-cases.json.)
 */
import {
  selectDishSetCuisines,
  DISH_SET_MIN_SUPPORT,
} from './venue-cuisine-evidence.service';

describe('selectDishSetCuisines (majority-of-attributed threshold)', () => {
  it('claims the majority cuisine with enough support', () => {
    const counts = new Map([
      ['thai', 3],
      ['mexican', 1],
    ]);
    expect(selectDishSetCuisines(counts, 4)).toEqual([
      { cuisineId: 'thai', support: 3 },
    ]);
  });

  it('an exact half is NOT a majority', () => {
    const counts = new Map([['thai', 2]]);
    expect(selectDishSetCuisines(counts, 4)).toEqual([]);
  });

  it('a single supporting dish never speaks for the venue', () => {
    expect(DISH_SET_MIN_SUPPORT).toBeGreaterThanOrEqual(2);
    const counts = new Map([['mexican', 1]]);
    expect(selectDishSetCuisines(counts, 1)).toEqual([]);
  });

  it('empty knowledge claims nothing', () => {
    expect(selectDishSetCuisines(new Map(), 0)).toEqual([]);
  });
});
