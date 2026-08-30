import { Prisma } from '@prisma/client';
import {
  conceptDishAxisSql,
  conceptRestaurantAxisSql,
  plainAttributeSoftConcept,
  widenConceptArms,
} from './concept-membership.compiler';
import type { ConceptArm } from './search-execution-directives';

/**
 * THE WIDENED-ARM CONTRACT (owner ruling 2026-08-30): a judged satisfies
 * edge becomes an EXTRA OR-ARM of the SAME concept. These pins prove the
 * three properties search correctness rides on:
 *  - the concept's IDENTITY (the starvation JSON key) never changes;
 *  - arms are ORed within the concept (never a second AND'd concept);
 *  - an unwidened concept compiles byte-identically to before (the proven
 *    SQL shapes stay stable when no edge exists).
 */
describe('widenConceptArms', () => {
  const pub = 'aaaaaaaa-0000-0000-0000-000000000001';
  const bar = 'aaaaaaaa-0000-0000-0000-000000000002';
  const crispy = 'bbbbbbbb-0000-0000-0000-000000000001';

  it('keeps the anchor id as the concept identity (starvation keying)', () => {
    const widened = widenConceptArms(
      plainAttributeSoftConcept(pub, 'restaurant_attributes'),
      [{ id: bar, column: 'restaurant_attributes' }],
    );
    expect(widened.id).toBe(pub);
    expect(widened.hardness).toBe('soft');
  });

  it('appends widened arms after the concept’s own on both axes', () => {
    const widened = widenConceptArms(
      plainAttributeSoftConcept(pub, 'restaurant_attributes'),
      [{ id: bar, column: 'restaurant_attributes' }],
    );
    expect(widened.dishArms).toEqual([
      { column: 'restaurant_attributes', id: pub },
      { column: 'restaurant_attributes', id: bar },
    ]);
    expect(widened.restaurantArms).toEqual([
      { column: 'restaurant_attributes', id: pub },
      { column: 'restaurant_attributes', id: bar },
    ]);
  });

  it('is the identity on an empty widening (proven byte-shapes stable)', () => {
    const base = plainAttributeSoftConcept(crispy, 'food_attributes');
    expect(widenConceptArms(base, [])).toBe(base);
  });

  it('dedupes an arm the concept already carries', () => {
    const widened = widenConceptArms(
      plainAttributeSoftConcept(pub, 'restaurant_attributes'),
      [
        { id: pub, column: 'restaurant_attributes' },
        { id: bar, column: 'restaurant_attributes' },
        { id: bar, column: 'restaurant_attributes' },
      ],
    );
    expect(widened.restaurantArms).toHaveLength(2);
  });

  it('never fills an axis the concept deliberately left empty', () => {
    const wall = {
      id: 'w',
      hardness: 'wall' as const,
      dishArms: [] as ConceptArm[],
      restaurantArms: [
        { column: 'restaurant_attributes', id: pub },
      ] as ConceptArm[],
    };
    const widened = widenConceptArms(wall, [
      { id: bar, column: 'food_attributes' },
    ]);
    expect(widened.dishArms).toEqual([]);
    expect(widened.restaurantArms).toHaveLength(2);
  });

  it('cross-column widening renders as an OR within the concept, per axis', () => {
    // item-attribute anchor widened by a place-attribute target: the dish
    // axis must OR c.food_attributes with fr.restaurant_attributes — never
    // mint a second concept (which would AND and get stricter, F5).
    const widened = widenConceptArms(
      plainAttributeSoftConcept(crispy, 'food_attributes'),
      [{ id: bar, column: 'restaurant_attributes' }],
    );
    const dishSql = conceptDishAxisSql(widened, {
      connection: 'c',
      restaurant: 'fr',
    });
    const restaurantSql = conceptRestaurantAxisSql(widened, 'r');
    const render = (sql: Prisma.Sql | null): string => (sql ? sql.sql : '');
    expect(render(dishSql)).toContain(' OR ');
    expect(render(dishSql)).toContain('c.food_attributes');
    expect(render(dishSql)).toContain('fr.restaurant_attributes');
    expect(render(restaurantSql)).toContain(' OR ');
  });
});
