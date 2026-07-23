import 'reflect-metadata';
import { SearchQueryBuilder } from './search-query.builder';
import type { QueryPlan } from './dto/search-query.dto';

const RESTAURANT_ID = '44444444-4444-4444-4444-444444444444';

// Fame pin re-keyed to SOURCES (master §5/§7, Phase B line): the DISTINCT ON
// representative-location order must prefer locations covered by the
// restaurant's score-provenance territory — provenance_source_id → the
// source's engine member places (derived-union territory) or its anchor
// place (engineless case) — BEFORE distance-to-center, with distance kept as
// the tiebreak and updated_at as the determinism anchor. §2.5(c) polygon-
// first (C4 cut): the wrap-aware bbox test is the PREFILTER; where the place
// has real ground, ST_Covers(geometry, point) judges (geometry-null places
// keep the bbox verdict — COALESCE(..., TRUE)). The old scoring_market_key →
// core_markets ST_Covers key is DEAD.
const TERRITORY_ORDER_SNIPPET =
  "EXISTS (SELECT 1 FROM core_public_entity_scores pes JOIN sources src ON src.source_id = pes.provenance_source_id LEFT JOIN engines eng ON eng.engine_id = src.engine_id JOIN places p ON p.place_id = ANY(CASE WHEN eng.engine_id IS NOT NULL THEN eng.member_place_ids ELSE ARRAY[src.anchor_place_id] END) WHERE pes.subject_type = 'restaurant' AND pes.subject_id = fl.restaurant_id AND p.bbox_min_lat IS NOT NULL AND fl.latitude::numeric BETWEEN p.bbox_min_lat AND p.bbox_max_lat AND ((p.bbox_min_lng <= p.bbox_max_lng AND fl.longitude::numeric BETWEEN p.bbox_min_lng AND p.bbox_max_lng) OR (p.bbox_min_lng > p.bbox_max_lng AND (fl.longitude::numeric >= p.bbox_min_lng OR fl.longitude::numeric <= p.bbox_max_lng))) AND COALESCE((SELECT ST_Covers(pgm.geometry, ST_SetSRID(ST_MakePoint(fl.longitude::float8, fl.latitude::float8), 4326)) FROM place_geometries pgm WHERE pgm.place_id = p.place_id AND pgm.geometry IS NOT NULL), TRUE)) DESC";

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
