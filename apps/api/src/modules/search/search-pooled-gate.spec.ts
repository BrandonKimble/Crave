import 'reflect-metadata';
import { compileQueryPlanFromConstraints } from './search-constraints.compiler';
import { SearchQueryBuilder } from './search-query.builder';
import type { SearchConstraints } from './search-constraints';
import type { SearchExecutionDirectives } from './search-execution-directives';

const FOOD_ID = '33333333-3333-3333-3333-333333333333';
const SOFT_FOOD_ATTR = '44444444-4444-4444-4444-444444444444';
const SOFT_REST_ATTR = '55555555-5555-5555-5555-555555555555';

/**
 * STEP-3 POOLED GATE (spec §1.4; owner rulings 2026-08-01): soft attribute
 * ids leave WHERE membership and become per-row provenance (pooled_tier);
 * the window gate admits tier-1 rows only when tier-0 rows cannot fill one
 * page, in ONE execution. These pin the SQL shape — each can go RED by
 * regressing the gate to membership filtering or a re-evaluated subquery.
 */
function constraints(): SearchConstraints {
  return {
    stage: 'strict',
    format: 'dual_list',
    inputPresence: {
      restaurants: 0,
      food: 1,
      foodAttributes: 1,
      restaurantAttributes: 1,
    },
    stagePresence: {
      restaurants: 0,
      food: 1,
      foodAttributes: 1,
      restaurantAttributes: 1,
    },
    hadFoodGroup: true,
    hadRestaurantGroup: false,
    hadFoodAttributeGroup: true,
    hadRestaurantAttributeGroup: true,
    primaryFoodAttributeQuery: false,
    grounding: {
      food: { anchors: [], family: [], similar: {}, twinIngredientIds: [] },
    },
    ids: {
      restaurantIds: [],
      foodIds: [FOOD_ID],
      // Hard-only membership: the service already stripped soft ids.
      foodAttributeIds: [],
      restaurantAttributeIds: [],
      ingredientIds: [],
    },
    filters: { priceLevels: [], minimumVotes: null, rising: false },
    unresolved: { groups: [] },
  };
}

function directives(
  overrides: Partial<NonNullable<SearchExecutionDirectives['pooledGate']>> = {},
): SearchExecutionDirectives {
  return {
    pooledGate: {
      softFoodAttributeIds: [SOFT_FOOD_ATTR],
      softRestaurantAttributeIds: [SOFT_REST_ATTR],
      threshold: 25,
      gateFull: null,
      ...overrides,
    },
  };
}

const builder = new SearchQueryBuilder();
const plan = () => compileQueryPlanFromConstraints(constraints());

const dishSqlText = (d: SearchExecutionDirectives): string =>
  builder
    .buildDishQuery({
      plan: plan(),
      pagination: { skip: 0, take: 25 },
      searchCenter: null,
      directives: d,
    })
    .dataSql.sql.replace(/\s+/g, ' ');

const restaurantSqlText = (d: SearchExecutionDirectives): string =>
  builder
    .buildRestaurantQuery({
      plan: plan(),
      pagination: { skip: 0, take: 25 },
      searchCenter: null,
      directives: d,
    })
    .dataSql.sql.replace(/\s+/g, ' ');

describe('step-3 pooled richness gate (SQL shape)', () => {
  it('dish: soft ids are PROVENANCE (containment CASE), never WHERE membership', () => {
    const sql = dishSqlText(directives());
    expect(sql).toContain('AS pooled_tier');
    expect(sql).toContain('@>');
    // soft ids must not appear as membership overlap arms
    expect(sql).not.toContain('food_attributes && ');
  });

  it('dish: the gate is a WINDOW count, not a re-evaluated subquery (the 20s regression)', () => {
    const sql = dishSqlText(directives());
    expect(sql).toContain('OVER () AS pooled_full_count');
    // Tier 2 (similar ring) is scan-only — the gate arm now names tier 1
    // explicitly so ring rows can never serve on the default page.
    expect(sql).toContain(
      'fc.pooled_tier = 0 OR (fc.pooled_tier = 1 AND fc.pooled_full_count <',
    );
    expect(sql).not.toContain('pooled_gate AS');
  });

  it('dish: tier orders first, then score (page 1 fills with all-word rows)', () => {
    const sql = dishSqlText(directives());
    expect(sql).toContain('ORDER BY fc.pooled_tier ASC,');
  });

  it('dish: gateFull=true restricts to full; gateFull=false admits everything (parameterized decision)', () => {
    expect(dishSqlText(directives({ gateFull: true }))).toContain(
      'WHERE fc.pooled_tier = 0 ORDER BY',
    );
    expect(dishSqlText(directives({ gateFull: false }))).not.toContain(
      'pooled_full_count <',
    );
  });

  it('restaurant: gate present with window count and tier-first order', () => {
    const sql = restaurantSqlText(directives());
    expect(sql).toContain('OVER () AS pooled_full_count');
    expect(sql).toContain('rrx.match_tier = 0 OR rrx.pooled_full_count <');
    expect(sql).toContain('ORDER BY rrx.match_tier ASC,');
  });

  it('restaurant: the HYDRATE path never gates (executor already decided on the open set)', () => {
    const sql = builder
      .buildRestaurantQuery({
        plan: plan(),
        pagination: { skip: 0, take: 25 },
        searchCenter: null,
        directives: directives(),
        restrictToRestaurantIds: [FOOD_ID],
      })
      .dataSql.sql.replace(/\s+/g, ' ');
    expect(sql).not.toContain('pooled_full_count');
    expect(sql).toContain('array_position');
  });

  it('candidate SQL carries pooled_tier ungated so openness-aware gating happens in the executor', () => {
    const result = builder.buildRestaurantQuery({
      plan: plan(),
      pagination: { skip: 0, take: 25 },
      searchCenter: null,
      directives: directives(),
      includeCandidateSql: true,
    });
    const sql = (result.candidateSql?.sql ?? '').replace(/\s+/g, ' ');
    expect(sql).toContain('AS pooled_tier');
    expect(sql).not.toContain('pooled_full_count');
  });

  it('step-5: both pooled count queries report per-soft-id coverage (soft_word_counts)', () => {
    const dishCount = builder.buildDishQuery({
      plan: plan(),
      pagination: { skip: 0, take: 25 },
      searchCenter: null,
      directives: directives(),
    }).countSql;
    const restCount = builder.buildRestaurantQuery({
      plan: plan(),
      pagination: { skip: 0, take: 25 },
      searchCenter: null,
      directives: directives(),
    }).countSql;
    for (const count of [dishCount, restCount]) {
      const sql = count.sql.replace(/\s+/g, ' ');
      expect(sql).toContain('soft_word_counts');
      // Round-5 close-out: counts are FILTER windows in the ONE count scan
      // (json_build_object over MAXed window columns) — the old UNION ALL
      // re-scanned the pool once per soft id.
      expect(sql).toContain('json_build_object');
      expect(sql).not.toContain('UNION ALL');
      // every soft id is bound as its own FILTER-counted row (ids ride as
      // parameters, so assert on the bound values)
      expect(count.values).toEqual(
        expect.arrayContaining([SOFT_FOOD_ATTR, SOFT_REST_ATTR]),
      );
    }
  });

  it('tier-2 similar ring: scan-admitted, never served, window-counted', () => {
    const d = directives();
    d.pooledGate!.similarFoodIds = ['66666666-6666-6666-6666-666666666666'];
    const q = builder.buildDishQuery({
      plan: plan(),
      pagination: { skip: 0, take: 25 },
      searchCenter: null,
      directives: d,
    });
    const sql = q.dataSql.sql.replace(/\s+/g, ' ');
    // ring rows are tier 2 in the CASE, admitted by an OR arm...
    expect(sql).toContain('THEN 2');
    expect(sql).toContain('OR c.food_id = ANY(');
    // ...and the served page excludes them (tier-1 arm named explicitly)
    expect(sql).toContain(
      'fc.pooled_tier = 0 OR (fc.pooled_tier = 1 AND fc.pooled_full_count <',
    );
    // similarAvailable is a window count in the SAME count scan
    expect(q.countSql.sql).toContain('similar_count');
    expect(q.countSql.sql).toContain('AS similar_connections');
  });

  it('ring-only gate (no soft words) builds without empty-array joins', () => {
    const d: SearchExecutionDirectives = {
      pooledGate: {
        softFoodAttributeIds: [],
        softRestaurantAttributeIds: [],
        threshold: 25,
        gateFull: null,
        similarFoodIds: ['66666666-6666-6666-6666-666666666666'],
      },
    };
    expect(() =>
      builder.buildDishQuery({
        plan: plan(),
        pagination: { skip: 0, take: 25 },
        searchCenter: null,
        directives: d,
      }),
    ).not.toThrow();
    expect(() =>
      builder.buildRestaurantQuery({
        plan: plan(),
        pagination: { skip: 0, take: 25 },
        searchCenter: null,
        directives: d,
      }),
    ).not.toThrow();
  });

  it('no pooledGate ⇒ byte-stable legacy shape (no pooled artifacts)', () => {
    const sql = dishSqlText({});
    expect(sql).not.toContain('pooled');
  });
});
