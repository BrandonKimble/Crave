import 'reflect-metadata';
import { SearchQueryBuilder } from './search-query.builder';
import { renderInlinedSql } from './sql-preview';
import type { QueryPlan } from './dto/search-query.dto';

const RESTAURANT_ID = '44444444-4444-4444-4444-444444444444';

// Fame pin re-keyed to SOURCES (master §5/§7, Phase B line): the DISTINCT ON
// representative-location order must prefer locations covered by the
// restaurant's score-provenance territory — provenance_source_id → the
// source's engine member places (derived-union territory) or its anchor
// place (engineless case) — BEFORE distance-to-center, with distance kept as
// the tiebreak and updated_at as the determinism anchor. §2.5(c) under §2.6
// GROUND UNIFICATION (C4 cut): the wrap-aware bbox test is the PREFILTER
// ONLY; THE ONE GROUND judges — a required EXISTS ST_Covers(geometry, point)
// against the place's place_geometries row (sketch envelope or outline; no
// COALESCE fallback arm). The old scoring_market_key → core_markets
// ST_Covers key is DEAD.
// STORED verdict (ideal-abstraction round 5): the fame-pin is a column,
// recomputed off the hot path — the old in-query ST_Covers EXISTS was 99%
// of every pooled search's cost.
const TERRITORY_ORDER_SNIPPET = 'fl.in_scoring_territory DESC';

function buildPlan(): QueryPlan {
  return {
    format: 'dual_list',
    restaurantFilters: [
      {
        scope: 'restaurant',
        description: 'test restaurants',
        entityType: 'restaurant',
        entityIds: [RESTAURANT_ID],
      },
    ],
    connectionFilters: [],
    ranking: {
      foodOrder: 'crave_score DESC',
      restaurantOrder: 'crave_score DESC',
    },
    diagnostics: { missingEntities: [], notes: [] },
  };
}

// The rendered statement — placeholders inlined — IS the preview now
// (concept-graph §11 item 6): these assertions read the SQL that executes.
function selectedLocationsBlock(rendered: string): string {
  const start = rendered.indexOf('selected_locations AS (');
  expect(start).toBeGreaterThanOrEqual(0);
  // The CTE closes with a newline + ')' — the ORDER BY itself nests parens.
  const end = rendered.indexOf('\n)', start);
  expect(end).toBeGreaterThan(start);
  return rendered.slice(start, end);
}

describe('selected_locations fame-pin ordering (scoring territory before distance)', () => {
  const builder = new SearchQueryBuilder();

  it('restaurant query: territory preference sorts BEFORE distance-to-center, distance stays the tiebreak', () => {
    const { dataSql } = builder.buildRestaurantQuery({
      plan: buildPlan(),
      pagination: { skip: 0, take: 10 },
      searchCenter: { lat: 30.27, lng: -97.74 },
    });
    const block = selectedLocationsBlock(renderInlinedSql(dataSql));
    const territoryIndex = block.indexOf(TERRITORY_ORDER_SNIPPET);
    const distanceIndex = block.indexOf('POWER(fl.latitude - 30.27');
    const updatedAtIndex = block.indexOf('fl.updated_at DESC');
    expect(territoryIndex).toBeGreaterThanOrEqual(0);
    expect(distanceIndex).toBeGreaterThanOrEqual(0);
    expect(updatedAtIndex).toBeGreaterThanOrEqual(0);
    // ORDER BY fl.restaurant_id, <territory> DESC, <distance> ASC, updated_at DESC
    expect(block.indexOf('fl.restaurant_id')).toBeLessThan(territoryIndex);
    expect(territoryIndex).toBeLessThan(distanceIndex);
    expect(distanceIndex).toBeLessThan(updatedAtIndex);
  });

  it('restaurant query without a search center: territory preference still applies, updated_at anchors', () => {
    const { dataSql } = builder.buildRestaurantQuery({
      plan: buildPlan(),
      pagination: { skip: 0, take: 10 },
      searchCenter: null,
    });
    const block = selectedLocationsBlock(renderInlinedSql(dataSql));
    const territoryIndex = block.indexOf(TERRITORY_ORDER_SNIPPET);
    expect(territoryIndex).toBeGreaterThanOrEqual(0);
    expect(block).not.toContain('POWER(');
    expect(territoryIndex).toBeLessThan(block.indexOf('fl.updated_at DESC'));
  });

  it('dish query: the same territory-before-distance order applies to the dish axis', () => {
    const { dataSql } = builder.buildDishQuery({
      plan: {
        ...buildPlan(),
        connectionFilters: [
          {
            scope: 'connection',
            description: 'test connections',
            entityType: 'connection',
            entityIds: [RESTAURANT_ID],
          },
        ],
      },
      pagination: { skip: 0, take: 10 },
      searchCenter: { lat: 30.27, lng: -97.74 },
    });
    const block = selectedLocationsBlock(renderInlinedSql(dataSql));
    const territoryIndex = block.indexOf(TERRITORY_ORDER_SNIPPET);
    const distanceIndex = block.indexOf('POWER(fl.latitude - 30.27');
    expect(territoryIndex).toBeGreaterThanOrEqual(0);
    expect(distanceIndex).toBeGreaterThanOrEqual(0);
    expect(territoryIndex).toBeLessThan(distanceIndex);
  });
});
