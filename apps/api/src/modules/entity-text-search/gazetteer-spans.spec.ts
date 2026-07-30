import { EntityType } from '@prisma/client';
import { groupEntitySpans, pickSpanWinner } from './gazetteer-spans';

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
