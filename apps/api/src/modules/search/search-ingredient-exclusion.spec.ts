import 'reflect-metadata';
import { compileQueryPlanFromConstraints } from './search-constraints.compiler';
import { SearchQueryBuilder } from './search-query.builder';
import type { SearchConstraints } from './search-constraints';
import type { QueryPlan } from './dto/search-query.dto';

const INCLUDE_ID = '11111111-1111-1111-1111-111111111111';
const EXCLUDE_ID = '22222222-2222-2222-2222-222222222222';
const FOOD_ID = '33333333-3333-3333-3333-333333333333';

function buildConstraints(
  overrides: Partial<SearchConstraints['ids']>,
): SearchConstraints {
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
      ...overrides,
    },
    filters: {
      priceLevels: [],
      minimumVotes: null,
      rising: false,
    },
    unresolved: { groups: [] },
  };
}

describe('ingredient exclusion lane (compiler → builder)', () => {
  it('compiles excludedIngredientIds into an INGREDIENT connection filter flagged exclude', () => {
    const plan = compileQueryPlanFromConstraints(
      buildConstraints({ excludedIngredientIds: [EXCLUDE_ID] }),
    );
    const excludeClauses = plan.connectionFilters.filter(
      (clause) => clause.payload?.exclude === true,
    );
    expect(excludeClauses).toHaveLength(1);
    expect(excludeClauses[0].entityType).toBe('ingredient');
    expect(excludeClauses[0].entityIds).toEqual([EXCLUDE_ID]);
  });

  it('keeps the include lane unflagged so the builder never cross-wires the two', () => {
    const plan = compileQueryPlanFromConstraints(
      buildConstraints({
        ingredientIds: [INCLUDE_ID],
        excludedIngredientIds: [EXCLUDE_ID],
      }),
    );
    const ingredientClauses = plan.connectionFilters.filter(
      (clause) => clause.entityType === 'ingredient',
    );
    expect(ingredientClauses).toHaveLength(2);
    const include = ingredientClauses.find((c) => !c.payload?.exclude);
    expect(include?.entityIds).toEqual([INCLUDE_ID]);
  });

  function dishPreviewFor(plan: QueryPlan): string {
    const builder = new SearchQueryBuilder();
    const { preview } = builder.buildDishQuery({
      plan,
      pagination: { skip: 0, take: 10 },
      searchCenter: null,
    });
    return preview;
  }

  function restaurantPreviewFor(plan: QueryPlan): string {
    const builder = new SearchQueryBuilder();
    const { preview } = builder.buildRestaurantQuery({
      plan,
      pagination: { skip: 0, take: 10 },
      searchCenter: null,
    });
    return preview;
  }

  it('applies NOT across BOTH tiers (evidence array + canonical subquery) in the dish query', () => {
    const plan = compileQueryPlanFromConstraints(
      buildConstraints({ excludedIngredientIds: [EXCLUDE_ID] }),
    );
    const preview = dishPreviewFor(plan);
    const expected = `NOT ((c.ingredients && ARRAY['${EXCLUDE_ID}']::uuid[]) OR c.food_id IN (SELECT entity_id FROM core_entities WHERE canonical_ingredients && ARRAY['${EXCLUDE_ID}']::uuid[]))`;
    expect(preview).toContain(expected);
  });

  it('applies the exclusion in the restaurant query match path too', () => {
    const plan = compileQueryPlanFromConstraints(
      buildConstraints({ excludedIngredientIds: [EXCLUDE_ID] }),
    );
    const preview = restaurantPreviewFor(plan);
    expect(preview).toContain(
      `NOT ((c.ingredients && ARRAY['${EXCLUDE_ID}']::uuid[])`,
    );
  });

  it('applies include and exclude as independent AND-ed conditions', () => {
    const plan = compileQueryPlanFromConstraints(
      buildConstraints({
        ingredientIds: [INCLUDE_ID],
        excludedIngredientIds: [EXCLUDE_ID],
      }),
    );
    const preview = dishPreviewFor(plan);
    expect(preview).toContain(
      `(c.ingredients && ARRAY['${INCLUDE_ID}']::uuid[])`,
    );
    expect(preview).toContain(
      `NOT ((c.ingredients && ARRAY['${EXCLUDE_ID}']::uuid[])`,
    );
  });

  it('emits no ingredient SQL when both lanes are empty', () => {
    const plan = compileQueryPlanFromConstraints(buildConstraints({}));
    const preview = dishPreviewFor(plan);
    expect(preview).not.toContain('c.ingredients');
    expect(preview).not.toContain('canonical_ingredients');
  });
});
