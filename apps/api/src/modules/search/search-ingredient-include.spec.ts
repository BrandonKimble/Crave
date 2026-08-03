import 'reflect-metadata';
import { compileQueryPlanFromConstraints } from './search-constraints.compiler';
import { SearchQueryBuilder } from './search-query.builder';
import type { SearchConstraints } from './search-constraints';
import type { QueryPlan } from './dto/search-query.dto';

const INCLUDE_ID = '11111111-1111-1111-1111-111111111111';
const FOOD_ID = '33333333-3333-3333-3333-333333333333';

/**
 * The ingredient INCLUDE lane (testimony/knowledge doctrine): recall unions
 * venue testimony, synthesized canon, and dishes NAMED the ingredient.
 *
 * The EXCLUDE lane was deleted 2026-07-30 (spec §1.1): free-text negation
 * is no longer interpreted (owner accepted-inversion ruling) and allergen
 * toggles were rejected, so nothing produced exclusion ids — the DTO
 * field, compiler clause, and two-tier NOT SQL are gone. These specs pin
 * what SURVIVES, plus the absence of the deleted lane.
 */
function buildConstraints(
  overrides: Partial<SearchConstraints['ids']>,
): SearchConstraints {
  return {
    format: 'dual_list',
    inputPresence: {
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
    grounding: {
      food: { anchors: [], family: [], similar: {}, twinIngredientIds: [] },
    },
    ids: {
      restaurantIds: [],
      foodIds: [FOOD_ID],
      foodAttributeIds: [],
      restaurantAttributeIds: [],
      ingredientIds: [],
      ...overrides,
    },
    filters: { priceLevels: [], minimumVotes: null, rising: false },
    unresolved: { groups: [] },
  };
}

function dishPreviewFor(plan: QueryPlan): string {
  const builder = new SearchQueryBuilder();
  const { preview } = builder.buildDishQuery({
    plan,
    pagination: { skip: 0, take: 10 },
    searchCenter: null,
  });
  return preview;
}

describe('ingredient include lane (compiler → builder)', () => {
  it('compiles ingredientIds into an INGREDIENT connection filter', () => {
    const plan = compileQueryPlanFromConstraints(
      buildConstraints({ ingredientIds: [INCLUDE_ID] }),
    );
    const clauses = plan.connectionFilters.filter(
      (clause) => clause.entityType === 'ingredient',
    );
    expect(clauses).toHaveLength(1);
    expect(clauses[0].entityIds).toEqual([INCLUDE_ID]);
  });

  it('include unions BOTH tiers (evidence array + canonical subquery)', () => {
    const plan = compileQueryPlanFromConstraints(
      buildConstraints({ ingredientIds: [INCLUDE_ID] }),
    );
    const preview = dishPreviewFor(plan);
    expect(preview).toContain(
      `(c.ingredients && ARRAY['${INCLUDE_ID}']::uuid[])`,
    );
    expect(preview).toContain('canonical_ingredients');
  });

  it('include arm carries the named-food third branch (dish IS the ingredient by name)', () => {
    const plan = compileQueryPlanFromConstraints(
      buildConstraints({ ingredientIds: [INCLUDE_ID] }),
    );
    const preview = dishPreviewFor(plan);
    expect(preview).toContain('same-name-or-alias(f, i)');
  });

  it('twin-ingredient union: food clause ORs containment when directives carry twins', () => {
    const plan = compileQueryPlanFromConstraints(buildConstraints({}));
    const builder = new SearchQueryBuilder();
    const { preview } = builder.buildDishQuery({
      plan,
      pagination: { skip: 0, take: 10 },
      searchCenter: null,
      directives: { twinIngredientIds: [INCLUDE_ID] },
    });
    expect(preview).toContain(
      `(c.food_id = ANY(ARRAY['${FOOD_ID}']::uuid[])) OR`,
    );
    expect(preview).toContain(
      `c.ingredients && ARRAY['${INCLUDE_ID}']::uuid[]`,
    );
  });

  it('emits no ingredient SQL when the lane is empty', () => {
    const plan = compileQueryPlanFromConstraints(buildConstraints({}));
    const preview = dishPreviewFor(plan);
    expect(preview).not.toContain('c.ingredients');
    expect(preview).not.toContain('canonical_ingredients');
  });

  it('the DELETED exclude lane emits nothing anywhere (no NOT arm survives)', () => {
    const plan = compileQueryPlanFromConstraints(
      buildConstraints({ ingredientIds: [INCLUDE_ID] }),
    );
    const preview = dishPreviewFor(plan);
    expect(preview).not.toContain('NOT ((c.ingredients');
    expect(
      plan.connectionFilters.some((clause) => clause.payload?.exclude === true),
    ).toBe(false);
  });
});
