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
    },
    filters: { priceLevels: [], minimumVotes: null, rising: false },
    unresolved: { groups: [] },
  };
}

/**
 * Charter §2a + §3b unified: the restaurant rollup counts ONE CLAIM ONCE,
 * credited to the most specific carrier that document named.
 *
 * These pin the shape in BOTH rollup CTEs. Each can show RED: the previous
 * row-type rule (`NOT c.is_category_item OR NOT EXISTS ... d.categories`)
 * fails every one of them.
 *
 * Verified against live data (2026-07-28): old 122,402 upvotes -> new
 * 123,965, with 190 restaurants GAINED (claims the row rule dropped, because
 * banking files them as support and this rollup sums direct) and 140 REDUCED
 * (same-document parent/child double counts). Both directions move, which is
 * what distinguishes a correctness fix from "count more".
 */
describe('restaurant rollup counts one claim once, most specific carrier wins', () => {
  const preview = (): string =>
    new SearchQueryBuilder().buildRestaurantQuery({
      plan: compileQueryPlanFromConstraints(constraints()),
      pagination: { skip: 0, take: 10 },
      searchCenter: null,
    }).preview;

  it('reads the mention LEDGER, not the item counters (claims live per document)', () => {
    const sql = preview();
    expect(sql).toContain('core_restaurant_item_mentions m');
    expect(sql).toContain("m.kind = 'direct'");
  });

  it('shadows only within the SAME source document', () => {
    expect(preview()).toContain('m2.source_document_id = m.source_document_id');
  });

  it('shadows only within the SAME restaurant', () => {
    expect(preview()).toContain('c2.restaurant_id = c.restaurant_id');
  });

  it('treats a dish under the category AND a narrower category as more specific', () => {
    const sql = preview();
    expect(sql).toContain('c.food_id = ANY(c2.categories)');
    expect(sql).toContain('derived_food_category_edges');
  });

  it('never shadows a mention that has no source document', () => {
    expect(preview()).toContain('m2.source_document_id IS NOT NULL');
  });

  it('no longer excludes category items by ROW TYPE (that dropped real claims)', () => {
    expect(preview()).not.toContain('NOT c.is_category_item');
  });

  it('is ANTISYMMETRIC: a synonym cycle must not erase both claims', () => {
    // Lineage is genuinely directed (11,093 edges, 8 symmetric), but where
    // both directions exist ('wings' <-> 'chicken wings') the relation means
    // synonym, not parent/child. Without the reverse-edge guard each would
    // shadow the other and the claim would vanish from the rollup entirely.
    expect(preview()).toContain('rev.food_id = c.food_id');
  });

  it('breaks symmetric-claim ties with a deterministic winner instead of erasing both', () => {
    // Red team R2: symmetric projection arrays and mutual edges are synonym
    // shapes; exactly one side must survive (never zero, never two).
    const sql = preview();
    expect(sql).toContain('c2.food_id < c.food_id');
    expect(sql).toContain('NOT (c2.food_id = ANY(c.categories))');
  });
});
