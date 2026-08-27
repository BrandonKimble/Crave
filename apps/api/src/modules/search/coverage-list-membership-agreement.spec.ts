import 'reflect-metadata';
import {
  conceptRestaurantAxisSql,
  cuisineConceptConstraint,
} from './concept-membership.compiler';
import { SearchCoverageService } from './search-coverage.service';
import { SearchQueryBuilder } from './search-query.builder';
import { compileQueryPlanFromConstraints } from './search-constraints.compiler';
import type { SearchConstraints } from './search-constraints';

/**
 * LIST/DOTS MEMBERSHIP AGREEMENT (red-team L2 K6).
 *
 * The birria-at-the-Korean-spot scenario: "mexican" places as a
 * place_attribute, the dual-list panel serves the Korean spot's birria taco
 * through the DISH-side knowledge arm (`c.food_attributes`), but coverage
 * used to AND the id straight into placement's single bucket
 * (`e.restaurant_attributes && …`) — so the map beneath the list did not
 * draw that restaurant's dot. List and map disagreed on screen. The same
 * defect dietary already suffered and fixed ("coverage used to read only
 * the strip…"), reproduced by cuisine because the fix was never
 * generalized.
 *
 * The dissolve: membership compiles through ONE concept renderer
 * (concept-membership.compiler) called by BOTH the ranked builder and
 * coverage. These tests prove agreement structurally: the exact SQL text
 * the shared renderer emits appears in both queries, and a RED control
 * shows a non-cuisine id still rides the plain single-column bucket.
 */

const MEX_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
const PLAIN_ATTR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02';

const norm = (sql: string) => sql.replace(/\s+/g, ' ');

function coverageHarness(cuisineIds: string[]) {
  const captured: Array<{ sql: string; values: unknown[] }> = [];
  const prisma = {
    $queryRaw: jest.fn((q: { sql: string; values: unknown[] }) => {
      captured.push({ sql: q.sql, values: q.values });
      return Promise.resolve([]);
    }),
  };
  const logger = {
    setContext: () => logger,
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const service = new SearchCoverageService(
    prisma as never,
    {
      resolveDietaryWalls: () => Promise.resolve([]),
      getDietaryIds: () => Promise.resolve(new Set()),
    } as never,
    { getCuisineIds: () => Promise.resolve(new Set(cuisineIds)) } as never,
    { setContext: () => logger } as never,
  );
  return { service, captured };
}

const coverageRequest = (attributeIds: string[], includeTopDish = false) =>
  ({
    bounds: {
      northEast: { lat: 30.4, lng: -97.6 },
      southWest: { lat: 30.1, lng: -97.9 },
    },
    // placement put the cuisine word in the place_attribute bucket — the
    // exact K6 shape.
    entities: { placeAttributes: [{ entityIds: attributeIds }] },
    includeTopDish,
  }) as never;

function bareConstraints(): SearchConstraints {
  return {
    format: 'dual_list',
    inputPresence: {
      places: 0,
      items: 0,
      itemAttributes: 0,
      placeAttributes: 1,
    },
    hadItemGroup: false,
    hadPlaceGroup: false,
    hadItemAttributeGroup: false,
    hadPlaceAttributeGroup: true,
    primaryItemAttributeQuery: false,
    grounding: {
      item: { anchors: [], family: [], similar: {}, twinIngredientIds: [] },
    },
    ids: {
      placeIds: [],
      itemIds: [],
      itemAttributeIds: [],
      placeAttributeIds: [],
      ingredientIds: [],
    },
    filters: { priceLevels: [], minimumVotes: null, rising: false },
    unresolved: { groups: [] },
  };
}

describe('coverage and the ranked list compile cuisine membership through ONE renderer (K6)', () => {
  it('a cuisine word placed venue-side reaches the dots through BOTH homes — the Korean spot with the birria taco gets its dot', async () => {
    const { service, captured } = coverageHarness([MEX_ID]);
    await service.buildShortcutCoverageGeoJson(coverageRequest([MEX_ID]));

    expect(captured).toHaveLength(1);
    const sql = norm(captured[0].sql);
    // The SHARED renderer's restaurant-axis output, verbatim (alias 'e'):
    const shared = conceptRestaurantAxisSql(
      cuisineConceptConstraint(MEX_ID, 'wall'),
      'e',
    )!;
    expect(sql).toContain(norm(shared.sql));
    // …which is the dual-home OR: venue containment OR dish EXISTS.
    expect(sql).toMatch(
      /e\.restaurant_attributes @> ARRAY\[\?\]::uuid\[\] OR EXISTS \( SELECT 1 FROM core_restaurant_items c WHERE c\.restaurant_id = e\.entity_id AND c\.food_attributes @> ARRAY\[\?\]::uuid\[\]/,
    );
    // and the cuisine id no longer rides the single placement bucket
    expect(sql).not.toContain('e.restaurant_attributes && ARRAY');
    expect(captured[0].values).toContain(MEX_ID);
  });

  it('agreement: the ranked place query walls the SAME concept with the SAME renderer output (alias r)', () => {
    const builder = new SearchQueryBuilder();
    const { dataSql } = builder.buildPlaceQuery({
      plan: compileQueryPlanFromConstraints(bareConstraints()),
      pagination: { skip: 0, take: 25 },
      searchCenter: null,
      directives: { concepts: [cuisineConceptConstraint(MEX_ID, 'wall')] },
    });
    const shared = conceptRestaurantAxisSql(
      cuisineConceptConstraint(MEX_ID, 'wall'),
      'r',
    )!;
    expect(norm(dataSql.sql)).toContain(norm(shared.sql));
    expect(dataSql.values).toContain(MEX_ID);
  });

  it('the dot top-dish pick admits the dish-side match too (the birria taco can BE the dot dish)', async () => {
    const { service, captured } = coverageHarness([MEX_ID]);
    await service.buildShortcutCoverageGeoJson(coverageRequest([MEX_ID], true));
    const sql = norm(captured[0].sql);
    // dish-axis membership inside the LATERAL: dish carries it OR venue does
    expect(sql).toMatch(
      /c\.food_attributes @> ARRAY\[\?\]::uuid\[\] OR e\.restaurant_attributes @> ARRAY\[\?\]::uuid\[\]/,
    );
  });

  it('RED control: a non-cuisine attribute keeps the plain single-column bucket (no dual-home arm)', async () => {
    const { service, captured } = coverageHarness([MEX_ID]);
    await service.buildShortcutCoverageGeoJson(coverageRequest([PLAIN_ATTR]));
    const sql = norm(captured[0].sql);
    expect(sql).toContain('e.restaurant_attributes && ARRAY');
    expect(sql).not.toMatch(
      /e\.restaurant_attributes @> ARRAY\[\?\]::uuid\[\] OR EXISTS/,
    );
    expect(captured[0].values).toContain(PLAIN_ATTR);
  });
});
