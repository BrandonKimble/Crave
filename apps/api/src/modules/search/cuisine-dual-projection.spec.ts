import 'reflect-metadata';
import { SearchQueryInterpretationService } from './search-query-interpretation.service';
import { SearchQueryBuilder } from './search-query.builder';
import { compileQueryPlanFromConstraints } from './search-constraints.compiler';
import type { SearchConstraints } from './search-constraints';
import type { SearchExecutionDirectives } from './search-execution-directives';
import { judgedVocabularyDouble } from '../../shared/testing/judged-vocabulary-double';

/**
 * CUISINE DUAL-PROJECTION (v17 S4; coherence red team F5).
 *
 * A facet='cuisine' word is ONE concept with two storage homes — dish-side
 * `food_attributes` (knowledge projection) and restaurant-side
 * `restaurant_attributes` (testimony + Places + cuisine_llm). The laws:
 *
 *  1. PLACEMENT is derived from the FACET, never from whichever entity name
 *     matched first: a junk dish entity literally named "mexican" must not
 *     hijack the query away from the cuisine reading.
 *  2. Hard membership (bare "mexican", no primary subject) compiles to an
 *     OR across the two homes on BOTH axes — the Mexican taco at the Korean
 *     spot surfaces through the dish arm; a Mexican restaurant's dishes
 *     through the venue arm.
 *  3. In the pooled gate the concept is ONE soft entry satisfied by either
 *     column (F5: two AND'd twins is the naive dual projection that gets
 *     STRICTER), and it is counted ONCE in the starvation report (the
 *     duplicate-JSON-key trap).
 */

const CUISINE_MEXICAN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
const JUNK_DISH_MEXICAN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02';
const TACO_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03';

function harness(cuisineIds: string[]) {
  const entityTextSearch = {
    scanForKnownEntityGroups: jest.fn(() =>
      Promise.resolve([
        {
          text: 'mexican',
          start: 0,
          end: 7,
          entities: [
            // Junk dish hub FIRST — under CROSS_TYPE_PLACEMENT_ORDER
            // (item > place_attribute) it would win without the facet rule.
            { entityId: JUNK_DISH_MEXICAN, type: 'item', name: 'mexican' },
            {
              entityId: CUISINE_MEXICAN,
              type: 'place_attribute',
              name: 'mexican',
            },
          ],
          subGroups: [],
        },
      ]),
    ),
    retrieveCandidates: jest.fn(() => Promise.resolve([])),
  };
  const logger = {
    setContext: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  const service = new SearchQueryInterpretationService(
    entityTextSearch as never,
    {
      resolveViewportCoverage: jest.fn(() => Promise.resolve({ engines: [] })),
    } as never,
    { getDietaryIds: jest.fn(() => Promise.resolve(new Set())) } as never,
    { getCuisineIds: () => Promise.resolve(new Set(cuisineIds)) } as never,
    { recordResidue: jest.fn(() => Promise.resolve()) } as never,
    { record: jest.fn(), bboxFromBounds: jest.fn(() => null) } as never,
    { oracle: undefined } as never,
    judgedVocabularyDouble({ frames: [], venueCategories: [] }),
    logger as never,
  );
  return service;
}

describe('placement: the cuisine FACET decides, not first-name-match (law 1)', () => {
  it('a junk dish named "mexican" does not hijack the query — the span places as the cuisine attribute', async () => {
    const service = harness([CUISINE_MEXICAN]);
    const result = await service.interpret({ query: 'mexican' } as never);
    const req = result.structuredRequest;
    expect(req.entities.placeAttributes?.map((e) => e.entityIds)).toEqual([
      [CUISINE_MEXICAN],
    ]);
    expect(req.entities.items ?? []).toEqual([]);
  });

  it('RED control: without the facet flag the junk dish wins (proves the mechanism is the facet, not luck)', async () => {
    const service = harness([]);
    const result = await service.interpret({ query: 'mexican' } as never);
    const req = result.structuredRequest;
    expect(req.entities.items?.map((e) => e.entityIds)).toEqual([
      [JUNK_DISH_MEXICAN],
    ]);
  });
});

// ---------------------------------------------------------------------------
// SQL shape (laws 2 and 3)
// ---------------------------------------------------------------------------

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
      // the service already partitioned the cuisine id OUT of these lists
      itemAttributeIds: [],
      placeAttributeIds: [],
      ingredientIds: [],
    },
    filters: { priceLevels: [], minimumVotes: null, rising: false },
    unresolved: { groups: [] },
  };
}

const builder = new SearchQueryBuilder();

describe('hard membership: one concept, OR across both homes (law 2)', () => {
  const directives: SearchExecutionDirectives = {
    cuisineConceptIds: [CUISINE_MEXICAN],
  };

  it('dish axis: (c.food_attributes @> id OR fr.restaurant_attributes @> id) — never a bare single-column wall', () => {
    const { dataSql } = builder.buildDishQuery({
      plan: compileQueryPlanFromConstraints(bareConstraints()),
      pagination: { skip: 0, take: 25 },
      searchCenter: null,
      directives,
    });
    const sql = dataSql.sql.replace(/\s+/g, ' ');
    expect(sql).toContain(
      '(c.food_attributes @> ARRAY[?]::uuid[] OR fr.restaurant_attributes @> ARRAY[?]::uuid[])',
    );
    expect(dataSql.values).toContain(CUISINE_MEXICAN);
  });

  it('restaurant axis: venue carries it OR any dish does', () => {
    const { dataSql } = builder.buildPlaceQuery({
      plan: compileQueryPlanFromConstraints(bareConstraints()),
      pagination: { skip: 0, take: 25 },
      searchCenter: null,
      directives,
    });
    const sql = dataSql.sql.replace(/\s+/g, ' ');
    expect(sql).toMatch(
      /r\.restaurant_attributes @> ARRAY\[\?\]::uuid\[\] OR EXISTS \( SELECT 1 FROM core_restaurant_items c WHERE c\.restaurant_id = r\.entity_id AND c\.food_attributes @> ARRAY\[\?\]::uuid\[\]/,
    );
  });
});

describe('pooled gate: a dual-homed concept is OR within, AND across (law 3, F5)', () => {
  const gate: SearchExecutionDirectives = {
    pooledGate: {
      softConcepts: [
        {
          id: CUISINE_MEXICAN,
          columns: ['food_attributes', 'restaurant_attributes'],
        },
      ],
      threshold: 25,
    },
  };
  const subjectConstraints = (): SearchConstraints => ({
    ...bareConstraints(),
    inputPresence: {
      places: 0,
      items: 1,
      itemAttributes: 0,
      placeAttributes: 1,
    },
    hadItemGroup: true,
    ids: { ...bareConstraints().ids, itemIds: [TACO_ID] },
  });

  it('dish tier expression ORs the two homes — the F5 AND regression cannot compile', () => {
    const { dataSql } = builder.buildDishQuery({
      plan: compileQueryPlanFromConstraints(subjectConstraints()),
      pagination: { skip: 0, take: 25 },
      searchCenter: null,
      directives: gate,
    });
    const sql = dataSql.sql.replace(/\s+/g, ' ');
    expect(sql).toMatch(
      /WHEN \(*c\.food_attributes @> ARRAY\[\?\]::uuid\[\] OR fr\.restaurant_attributes @> ARRAY\[\?\]::uuid\[\]\)* THEN 0/,
    );
    expect(sql).not.toContain(
      'c.food_attributes @> ARRAY[?]::uuid[] AND fr.restaurant_attributes @> ARRAY[?]::uuid[]',
    );
  });

  it('starvation report: ONE JSON key per concept (the duplicate-key last-write-wins trap)', () => {
    const { countSql } = builder.buildDishQuery({
      plan: compileQueryPlanFromConstraints(subjectConstraints()),
      pagination: { skip: 0, take: 25 },
      searchCenter: null,
      directives: gate,
    });
    const sql = countSql.sql.replace(/\s+/g, ' ');
    // exactly one swc window column for the one concept
    expect(sql).toContain('AS swc_0');
    expect(sql).not.toContain('AS swc_1');
    // and its FILTER ORs both homes
    expect(sql).toContain(
      '(fci.food_attributes @> ARRAY[?]::uuid[] OR fci.place_attributes_arr @> ARRAY[?]::uuid[])',
    );
  });

  it('restaurant gate: the concept is satisfied by the venue side OR a dish carrying it', () => {
    const { dataSql } = builder.buildPlaceQuery({
      plan: compileQueryPlanFromConstraints(subjectConstraints()),
      pagination: { skip: 0, take: 25 },
      searchCenter: null,
      directives: gate,
    });
    const sql = dataSql.sql.replace(/\s+/g, ' ');
    expect(sql).toMatch(
      /EXISTS \( SELECT 1 FROM core_restaurant_items c WHERE c\.restaurant_id = fr\.entity_id AND c\.food_attributes @> ARRAY\[\?\]::uuid\[\][\s\S]*?\) OR fr\.restaurant_attributes @> ARRAY\[\?\]::uuid\[\]/,
    );
  });
});
