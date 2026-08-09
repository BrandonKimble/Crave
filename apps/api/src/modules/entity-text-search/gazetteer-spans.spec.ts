import { EntityType } from '@prisma/client';
import {
  admitsAtExactTier,
  groupEntitySpans,
  pickSpanWinner,
} from './gazetteer-spans';

const span = (
  start: number,
  end: number,
  entityId: string,
  type: EntityType,
  name = entityId,
) => ({ start, end, text: name, entityId, name, type });

/**
 * Pins the round-2 review's central defect: the old greedy filter dropped
 * same-span duplicates, so a multi-type name survived as ONE arbitrary
 * winner decided by DB row order. Each spec here fails against that
 * behavior.
 */
describe('groupEntitySpans', () => {
  it('keeps EVERY entity sharing a span — the multi-type grounding law', () => {
    // "breakfast" is genuinely three entities in production data.
    const groups = groupEntitySpans([
      span(0, 9, 'bf-food', EntityType.food, 'breakfast'),
      span(0, 9, 'bf-fattr', EntityType.food_attribute, 'breakfast'),
      span(0, 9, 'bf-rattr', EntityType.restaurant_attribute, 'breakfast'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entities.map((e) => e.entityId).sort()).toEqual([
      'bf-fattr',
      'bf-food',
      'bf-rattr',
    ]);
  });

  it('longest span still wins ACROSS groups (overlap policy is span-level)', () => {
    // "breakfast taco" (0-14) must suppress both "breakfast" (0-9) and
    // "taco" (10-14) — sub-phrases lose, but nothing within the winning
    // span is dropped.
    const groups = groupEntitySpans([
      span(0, 14, 'bt', EntityType.food, 'breakfast taco'),
      span(0, 9, 'bf-food', EntityType.food, 'breakfast'),
      span(0, 9, 'bf-rattr', EntityType.restaurant_attribute, 'breakfast'),
      span(10, 14, 'taco', EntityType.food, 'taco'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entities.map((e) => e.entityId)).toEqual(['bt']);
  });

  it('non-overlapping groups all survive, in text order', () => {
    const groups = groupEntitySpans([
      span(16, 21, 'vegan', EntityType.food_attribute, 'vegan'),
      span(0, 14, 'bt', EntityType.food, 'breakfast taco'),
    ]);
    expect(groups.map((g) => g.entities[0].entityId)).toEqual(['bt', 'vegan']);
  });

  it('entity order inside a group is deterministic (type, then id)', () => {
    const a = groupEntitySpans([
      span(0, 5, 'z-id', EntityType.food, 'pizza'),
      span(0, 5, 'a-id', EntityType.food, 'pizza'),
    ]);
    const b = groupEntitySpans([
      span(0, 5, 'a-id', EntityType.food, 'pizza'),
      span(0, 5, 'z-id', EntityType.food, 'pizza'),
    ]);
    expect(a[0].entities.map((e) => e.entityId)).toEqual(
      b[0].entities.map((e) => e.entityId),
    );
  });

  it('deduplicates the same entity matched via both name and alias', () => {
    const groups = groupEntitySpans([
      span(0, 5, 'taco-id', EntityType.food, 'taco'),
      span(0, 5, 'taco-id', EntityType.food, 'taco'),
    ]);
    expect(groups[0].entities).toHaveLength(1);
  });
});

describe('pickSpanWinner', () => {
  const group = groupEntitySpans([
    span(0, 9, 'bf-food', EntityType.food, 'breakfast'),
    span(0, 9, 'bf-rattr', EntityType.restaurant_attribute, 'breakfast'),
    span(0, 9, 'bf-rest', EntityType.restaurant, 'Breakfast'),
  ])[0];

  it("follows the CALLER's type priority (polls: restaurant first)", () => {
    const winner = pickSpanWinner(group, [
      EntityType.restaurant,
      EntityType.food,
      EntityType.food_attribute,
      EntityType.restaurant_attribute,
    ]);
    expect(winner.entityId).toBe('bf-rest');
  });

  it('a different priority order picks a different, still-deterministic winner', () => {
    const winner = pickSpanWinner(group, [
      EntityType.food,
      EntityType.restaurant,
    ]);
    expect(winner.entityId).toBe('bf-food');
  });

  it('never depends on input order (the arbitrary-winner defect, pinned)', () => {
    const reversed = {
      ...group,
      entities: [...group.entities].reverse(),
    };
    const a = pickSpanWinner(group, [EntityType.restaurant]);
    const b = pickSpanWinner(reversed, [EntityType.restaurant]);
    expect(a.entityId).toBe(b.entityId);
  });
});

/**
 * DIACRITIC EVIDENCE — the exact-tier admission rule (2026-08-09).
 *
 * The vi launch gate found three confident wrong answers with one root cause:
 * the fold strips accents (so 'pho' finds phở), which also collapses words
 * that are ONLY distinguished by their accents — and the exact tier then
 * grounded them at confidence 1.0. 'bò' (beef) → avocado, via the banked
 * surface 'bơ'. The shape below is that case, unit-sized.
 */
describe('admitsAtExactTier — typed accents are evidence', () => {
  const bo = { folded: 'bo', diacritic: 'bò' };
  const boNoAccents = { folded: 'bo', diacritic: 'bo' };

  it('refuses a fold-only neighbour when the user typed accents (bò is not bơ)', () => {
    expect(admitsAtExactTier(bo, new Set(['bơ']))).toBe(false);
  });

  it('admits the surface that agrees on the accents', () => {
    expect(admitsAtExactTier(bo, new Set(['bơ', 'bò']))).toBe(true);
  });

  it('leaves de-diacritized typing exactly as it was (pho → phở keeps working)', () => {
    // No accents typed ⇒ no evidence ⇒ the folded key alone decides, so even a
    // surface that carries accents is still admitted. This is the half of the
    // fold that MUST NOT regress: it is how Vietnamese is typed on a US
    // keyboard.
    expect(admitsAtExactTier(boNoAccents, new Set(['bơ']))).toBe(true);
    expect(
      admitsAtExactTier({ folded: 'pho', diacritic: 'pho' }, new Set(['phở'])),
    ).toBe(true);
  });

  it('refuses an accent-bearing span no surface spells that way at all', () => {
    // 'cơm chay' (vegetarian rice) vs the only banked surface 'cơm cháy'
    // (scorched rice) — the span parks rather than grounding the wrong dish.
    expect(
      admitsAtExactTier(
        { folded: 'com chay', diacritic: 'cơm chay' },
        new Set(['cơm cháy']),
      ),
    ).toBe(false);
  });

  it('is language-neutral — the same rule over Spanish', () => {
    expect(
      admitsAtExactTier(
        { folded: 'cafe', diacritic: 'café' },
        new Set(['café']),
      ),
    ).toBe(true);
    expect(
      admitsAtExactTier(
        { folded: 'cafe', diacritic: 'café' },
        new Set(['cafe']),
      ),
    ).toBe(false);
  });
});
