import 'reflect-metadata';
import { SearchQueryBuilder } from './search-query.builder';
import type { QueryPlan } from './dto/search-query.dto';

const RESTAURANT_ID = '44444444-4444-4444-4444-444444444444';

// Fame-pin interim (master plan §7 / ledger Leg 2): the DISTINCT ON
// representative-location order must prefer locations covered by the
// restaurant's scoring territory (core_public_entity_scores.scoring_market_key
// → core_markets geometry ST_Covers) BEFORE distance-to-center, with distance
// kept as the tiebreak and updated_at as the determinism anchor.
const TERRITORY_ORDER_SNIPPET =
  "EXISTS (SELECT 1 FROM core_public_entity_scores pes JOIN core_markets m ON m.market_key = pes.scoring_market_key WHERE pes.subject_type = 'restaurant' AND pes.subject_id = fl.restaurant_id AND m.geometry IS NOT NULL AND ST_Covers(m.geometry, ST_SetSRID(ST_MakePoint(fl.longitude::double precision, fl.latitude::double precision), 4326))) DESC";

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

function selectedLocationsBlock(preview: string): string {
  const start = preview.indexOf('selected_locations AS (');
  expect(start).toBeGreaterThanOrEqual(0);
  // The CTE closes with a newline + ')' — the ORDER BY itself nests parens.
  const end = preview.indexOf('\n)', start);
  expect(end).toBeGreaterThan(start);
  return preview.slice(start, end);
}

describe('selected_locations fame-pin ordering (scoring territory before distance)', () => {
  const builder = new SearchQueryBuilder();

  it('restaurant query: territory preference sorts BEFORE distance-to-center, distance stays the tiebreak', () => {
    const { preview } = builder.buildRestaurantQuery({
      plan: buildPlan(),
      pagination: { skip: 0, take: 10 },
      searchCenter: { lat: 30.27, lng: -97.74 },
    });
    const block = selectedLocationsBlock(preview);
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
    const { preview } = builder.buildRestaurantQuery({
      plan: buildPlan(),
      pagination: { skip: 0, take: 10 },
      searchCenter: null,
    });
    const block = selectedLocationsBlock(preview);
    const territoryIndex = block.indexOf(TERRITORY_ORDER_SNIPPET);
    expect(territoryIndex).toBeGreaterThanOrEqual(0);
    expect(block).not.toContain('POWER(');
    expect(territoryIndex).toBeLessThan(block.indexOf('fl.updated_at DESC'));
  });

  it('dish query: the same territory-before-distance order applies to the dish axis', () => {
    const { preview } = builder.buildDishQuery({
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
    const block = selectedLocationsBlock(preview);
    const territoryIndex = block.indexOf(TERRITORY_ORDER_SNIPPET);
    const distanceIndex = block.indexOf('POWER(fl.latitude - 30.27');
    expect(territoryIndex).toBeGreaterThanOrEqual(0);
    expect(distanceIndex).toBeGreaterThanOrEqual(0);
    expect(territoryIndex).toBeLessThan(distanceIndex);
  });
});
