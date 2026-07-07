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
import type { SearchMountedResultsCoverageEntry } from '../shared/search-mounted-results-data-store';

const FNV1A_OFFSET_BASIS = 0x811c9dc5;
const hashStringFNV1a = (value: string, seed: number = FNV1A_OFFSET_BASIS): number => {
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

const normalizeJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue);
  }
  if (value != null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalizeJsonValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
};

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

const buildEntitiesKey = (entities: StructuredSearchRequest['entities'] | undefined): string => {
  const normalized = normalizeJsonValue(entities ?? {});
  const serialized = JSON.stringify(normalized);
  return `${serialized.length}:${hashStringFNV1a(serialized).toString(36)}`;
};

const buildFiltersKey = (tuple: SearchDesiredTuple): string => {
  const filters = tuple.filterVariant;
  const parts: string[] = [];
  if (filters.openNow) {
    parts.push('open');
  }
  if (filters.priceLevels.length) {
    parts.push(`price=${[...filters.priceLevels].sort((a, b) => a - b).join(',')}`);
  }
  if (filters.rising) {
    parts.push('rising');
  }
  return parts.length ? parts.join('+') : 'none';
};

export const buildShortcutCoverageWorldRequestKey = (args: {
  tuple: SearchDesiredTuple;
  tab: 'restaurants' | 'dishes';
  marketKey: string;
}): string => {
  const bounds = args.tuple.committedBounds?.bounds ?? null;
  return `entities:${buildEntitiesKey({})}|tab:${args.tab}|market:${args.marketKey}|bounds:${
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
    marketKey: string;
    openNow?: boolean;
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
  marketKey: string;
}): Promise<SearchMountedResultsCoverageEntry> => {
  const { shortcutCoverage, tuple, tab, marketKey } = args;
  const requestKey = buildShortcutCoverageWorldRequestKey({ tuple, tab, marketKey });
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
  const filters = tuple.filterVariant;
  try {
    const collection = await shortcutCoverage(
      {
        entities: {},
        bounds,
        viewportPolygon: tuple.committedBounds?.viewportPolygon?.map(
          ([lng, lat]) => [lng, lat] as [number, number]
        ),
        includeTopDish,
        marketKey,
        openNow: filters.openNow || undefined,
        priceLevels: filters.priceLevels.length ? [...filters.priceLevels] : undefined,
        rising: filters.rising || undefined,
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
