import 'reflect-metadata';
import { compileQueryPlanFromConstraints } from './search-constraints.compiler';
import { SearchQueryBuilder } from './search-query.builder';
import type { SearchConstraints } from './search-constraints';

const FOOD_ID = '33333333-3333-3333-3333-333333333333';

function constraints(): SearchConstraints {
  return {
    stage: 'strict',
    format: 'dual_list',
    inputPresence: {
      restaurants: 0,
      food: 1,
      foodAttributes: 0,
      restaurantAttributes: 0,
    },
    stagePresence: {
      restaurants: 0,
      food: 1,
      foodAttributes: 0,
      restaurantAttributes: 0,
    },
    hadFoodGroup: true,
    hadRestaurantGroup: false,
    hadFoodAttributeGroup: false,
    hadRestaurantAttributeGroup: false,
    primaryFoodAttributeQuery: false,
    ids: {
      restaurantIds: [],
      foodIds: [FOOD_ID],
      foodAttributeIds: [],
      restaurantAttributeIds: [],
      ingredientIds: [],
      excludedIngredientIds: [],
    },
    filters: { priceLevels: [], minimumVotes: null, rising: false },
    unresolved: { groups: [] },
  };
}

/**
 * Charter §2a: a category item lifts the restaurant score ONLY when no dish
 * carries that same category claim. These pin the shape of the admission
 * rule in BOTH restaurant rollup CTEs — the previous blanket
 * `NOT c.is_category_item` passes the double-count half of the test but
 * fails the "sole carrier still counts" half, so each spec can show RED.
 *
 * Semantics verified against live data (2026-07-27): of 1,706 category
 * items, 1,191 are sole carriers (admitted) and 515 are also carried by a
 * dish (suppressed).
 */
describe('restaurant rollup admits category items only as sole carriers', () => {
  const preview = (): string =>
    new SearchQueryBuilder().buildRestaurantQuery({
      plan: compileQueryPlanFromConstraints(constraints()),
      pagination: { skip: 0, take: 10 },
      searchCenter: null,
    }).preview;

  it('still excludes a category item whose claim a dish already carries', () => {
    const sql = preview();
    expect(sql).toContain('NOT d.is_category_item');
    expect(sql).toContain('c.food_id = ANY(d.categories)');
  });

  it('admits a category item when no dish sits under it (NOT EXISTS, not a blanket ban)', () => {
    const sql = preview();
    expect(sql).toMatch(/NOT c\.is_category_item\s*\n\s*OR NOT EXISTS/);
  });

  it('scopes the dish check to the SAME restaurant (per-category, per-place)', () => {
    expect(preview()).toContain('d.restaurant_id = c.restaurant_id');
  });

  it('applies the rule to the geographic rollup too, not just the filtered one', () => {
    const sql = preview();
    const occurrences = sql.split('OR NOT EXISTS').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});
