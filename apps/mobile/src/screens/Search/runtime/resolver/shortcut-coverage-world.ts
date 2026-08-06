// Shortcut COVERAGE as a world ingredient (S3 edit map §1 step 6): the resolver fetches
// the coverage collection in PARALLEL with the cards fetch and folds it into the world
// value — coverage and results land in ONE atomic snapshot (the S1 invariant), and the
// frame never waits on a post-response relay. Both tabs are fetched so a tab toggle
// finds its coverage in the world (the zero-network toggle guarantee).
//
// The key derivation and feature mapping here are the canonical go-forward copies of the
// map controller's coverage lane; that lane (and its local copies) dies in S3d.

import type { Feature, FeatureCollection, Point } from 'geojson';

import type { MapBounds } from '../../../../types';
import type { StructuredSearchRequest } from '../../../../services/search';
import { getCraveScoreColorFromScore } from '../../../../utils/quality-color';
import type { RestaurantFeatureProperties } from '../../components/search-map';
import type { SearchDesiredTuple } from '../shared/search-desired-state-contract';
import {
  buildSearchLensKey,
  selectLensRequestFields,
  selectSearchLens,
} from '../shared/search-desired-state-contract';
import type { SearchMountedResultsCoverageEntry } from '../shared/search-mounted-results-data-store';

// F1063: this segment WAS `buildEntitiesKey({})` — an FNV-1a hash of a normalized,
// JSON-serialized LITERAL EMPTY OBJECT, recomputed on every coverage request via 30 lines
// of hashing machinery (FNV1A_OFFSET_BASIS, hashStringFNV1a, normalizeJsonValue,
// buildEntitiesKey), all now deleted. Its parameter type advertised
// `StructuredSearchRequest['entities']`, so the code read as if entity-scoped coverage keys
// existed; they never did — the only two call sites both passed `{}`. Coverage is
// VIEWPORT + FILTER scoped, full stop (the entity scoping belonged to the pre-gazetteer map
// controller lane this file was migrated from). The segment is kept, as the constant it
// always was, so coverage keys stay byte-identical across this change; when entity-scoped
// coverage genuinely arrives it replaces this line, and git holds the old hasher.
const SHORTCUT_COVERAGE_ENTITIES_KEY = '2:nf0rvp';

const SHORTCUT_COVERAGE_BOUNDS_BUCKET_DEGREES = 0.01;

const bucketCoordinate = (value: number): string => {
  if (!Number.isFinite(value)) {
    return 'nan';
  }
  const bucketed =
    Math.round(value / SHORTCUT_COVERAGE_BOUNDS_BUCKET_DEGREES) *
    SHORTCUT_COVERAGE_BOUNDS_BUCKET_DEGREES;
  return bucketed.toFixed(2);
};

const buildBoundsKey = (bounds: MapBounds): string =>
  [
    bucketCoordinate(bounds.northEast.lat),
    bucketCoordinate(bounds.northEast.lng),
    bucketCoordinate(bounds.southWest.lat),
    bucketCoordinate(bounds.southWest.lng),
  ].join(',');

/** The coverage key is the LENS key — the map slices by exactly the lens the
 *  cards slice by ("map follows the cards", TR5-N). Hand-listing the fields
 *  here is how `dietary` (2026-08-04) became invisible to the map: three
 *  lenses collapsed onto one coverage entry and the pins kept every
 *  restaurant while the cards were walled. */
const buildFiltersKey = (tuple: SearchDesiredTuple): string =>
  buildSearchLensKey(selectSearchLens(tuple));

export const buildShortcutCoverageWorldRequestKey = (args: {
  tuple: SearchDesiredTuple;
  tab: 'restaurants' | 'dishes';
}): string => {
  const bounds = args.tuple.committedBounds?.bounds ?? null;
  return `entities:${SHORTCUT_COVERAGE_ENTITIES_KEY}|tab:${args.tab}|bounds:${
    bounds == null ? 'unavailable' : buildBoundsKey(bounds)
  }|filters:${buildFiltersKey(args.tuple)}`;
};

/** The ONE mapping from a raw coverage FeatureCollection to validated dot features —
 *  identical semantics to the controller's mapper so both tabs' coverage is built the
 *  same regardless of which path produced it. */
export const mapShortcutCoverageWorldFeatures = (
  collection: FeatureCollection<Point> | null | undefined,
  includeTopDish: boolean
): Array<Feature<Point, RestaurantFeatureProperties>> =>
  (collection?.features ?? [])
    .map((feature) => {
      const properties =
        feature?.properties && typeof feature.properties === 'object'
          ? (feature.properties as Record<string, unknown>)
          : {};
      const restaurantId = (properties.restaurantId as string) ?? '';
      const restaurantName = (properties.restaurantName as string) ?? '';
      const rank = properties.rank;
      if (!restaurantId || !restaurantName || typeof rank !== 'number') {
        return null;
      }
      const craveScore =
        typeof properties.craveScore === 'number' && Number.isFinite(properties.craveScore)
          ? (properties.craveScore as number)
          : null;
      if (craveScore === null) {
        return null;
      }
      const craveScoreExact =
        typeof properties.craveScoreExact === 'number' &&
        Number.isFinite(properties.craveScoreExact)
          ? (properties.craveScoreExact as number)
          : null;
      const restaurantCraveScore =
        typeof properties.restaurantCraveScore === 'number' &&
        Number.isFinite(properties.restaurantCraveScore)
          ? (properties.restaurantCraveScore as number)
          : null;
      const topDishCraveScore =
        includeTopDish &&
        typeof properties.topDishCraveScore === 'number' &&
        Number.isFinite(properties.topDishCraveScore)
          ? (properties.topDishCraveScore as number)
          : null;
      const connectionId =
        typeof properties.connectionId === 'string' ? (properties.connectionId as string) : null;
      if (includeTopDish && (topDishCraveScore === null || !connectionId)) {
        return null;
      }
      return {
        ...feature,
        id: feature.id ?? restaurantId,
        properties: {
          restaurantId,
          restaurantName,
          craveScore,
          craveScoreExact,
          rising: typeof properties.rising === 'number' ? (properties.rising as number) : null,
          rank,
          restaurantCraveScore,
          // Per-feature openness (open-now client derivation): pass the API's fact
          // through; null/absent = no hours data (never passes an open-now filter).
          isOpen: typeof properties.isOpen === 'boolean' ? (properties.isOpen as boolean) : null,
          pinColor: getCraveScoreColorFromScore(includeTopDish ? topDishCraveScore : craveScore),
          ...(includeTopDish
            ? {
                isDishPin: true,
                dishName:
                  typeof properties.dishName === 'string'
                    ? (properties.dishName as string)
                    : undefined,
                connectionId,
                topDishCraveScore,
              }
            : null),
        },
      } as Feature<Point, RestaurantFeatureProperties>;
    })
    .filter(Boolean) as Array<Feature<Point, RestaurantFeatureProperties>>;

export type ShortcutCoverageService = (
  params: {
    entities: StructuredSearchRequest['entities'];
    bounds: MapBounds;
    viewportPolygon?: Array<[number, number]>;
    includeTopDish: boolean;
    openNow?: boolean;
    dietary?: string[];
    priceLevels?: number[];
    rising?: boolean;
  },
  options: Record<string, never>
) => Promise<FeatureCollection<Point> | null>;

/** Fetch ONE tab's coverage for the tuple and return it as a world coverage entry.
 *  Failure returns a 'failed' entry (the frame renders LOUD-degraded, never waits). */
export const fetchShortcutCoverageWorldEntry = async (args: {
  shortcutCoverage: ShortcutCoverageService;
  tuple: SearchDesiredTuple;
  tab: 'restaurants' | 'dishes';
}): Promise<SearchMountedResultsCoverageEntry> => {
  const { shortcutCoverage, tuple, tab } = args;
  const requestKey = buildShortcutCoverageWorldRequestKey({ tuple, tab });
  const bounds = tuple.committedBounds?.bounds ?? null;
  const now = (): number => globalThis.performance?.now?.() ?? Date.now();
  if (bounds == null) {
    return {
      status: 'failed',
      requestKey,
      features: null,
      reason: 'viewport_bounds_unavailable',
      resolvedAt: now(),
    };
  }
  const includeTopDish = tab === 'dishes';
  try {
    const collection = await shortcutCoverage(
      {
        entities: {},
        bounds,
        viewportPolygon: tuple.committedBounds?.viewportPolygon?.map(
          ([lng, lat]) => [lng, lat] as [number, number]
        ),
        includeTopDish,
        ...selectLensRequestFields(selectSearchLens(tuple)),
      },
      {}
    );
    const features = mapShortcutCoverageWorldFeatures(collection, includeTopDish);
    return {
      status: 'ready',
      requestKey,
      features,
      reason: features.length > 0 ? 'accepted_features' : 'validated_empty_coverage',
      resolvedAt: now(),
    };
  } catch (error) {
    return {
      status: 'failed',
      requestKey,
      features: null,
      reason: error instanceof Error ? error.message : 'coverage_fetch_failed',
      resolvedAt: now(),
    };
  }
};
