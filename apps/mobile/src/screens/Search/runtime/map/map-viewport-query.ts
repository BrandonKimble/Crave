import type { Feature, Point } from 'geojson';
import type { MapBounds } from '../../../../types';
import type { RestaurantFeatureProperties } from '../../components/search-map';
import type { MapQueryBudget } from './map-query-budget';
import { MapSpatialIndex } from './map-spatial-index';

export type MarkerCatalogEntry = {
  feature: Feature<Point, RestaurantFeatureProperties>;
  rank: number;
  locationIndex: number;
};

type VisibleMarkerQuery = {
  bounds: MapBounds | null;
  selectedRestaurantId: string | null;
};

const getNowMs = (): number => {
  if (typeof performance?.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const resolveEntryKey = (entry: MarkerCatalogEntry): string => {
  const featureId = entry.feature.id?.toString();
  if (featureId && featureId.length > 0) {
    return featureId;
  }
  const [lng, lat] = entry.feature.geometry.coordinates as [number, number];
  return `${entry.feature.properties.restaurantId}:${lng}:${lat}`;
};

const resolveEntryCoordinates = (entry: MarkerCatalogEntry): [number, number] =>
  entry.feature.geometry.coordinates as [number, number];

export class MapViewportQueryService {
  private readonly spatialIndex = new MapSpatialIndex<MarkerCatalogEntry>(
    resolveEntryKey,
    resolveEntryCoordinates
  );
  private orderedEntries: MarkerCatalogEntry[] = [];
  private orderByEntryKey = new Map<string, number>();
  private entriesByRestaurantId = new Map<string, MarkerCatalogEntry[]>();

  public setCatalogEntries(entries: readonly MarkerCatalogEntry[]): void {
    this.orderedEntries = [...entries];
    this.orderByEntryKey.clear();
    this.entriesByRestaurantId.clear();

    this.orderedEntries.forEach((entry, index) => {
      const entryKey = resolveEntryKey(entry);
      this.orderByEntryKey.set(entryKey, index);
      const restaurantId = entry.feature.properties.restaurantId;
      const byRestaurant = this.entriesByRestaurantId.get(restaurantId);
      if (byRestaurant) {
        byRestaurant.push(entry);
        return;
      }
      this.entriesByRestaurantId.set(restaurantId, [entry]);
    });

    this.spatialIndex.rebuild(this.orderedEntries);
  }

  public queryVisibleCandidates(
    query: VisibleMarkerQuery,
    budget: MapQueryBudget | null = null
  ): MarkerCatalogEntry[] {
    const queryStartMs = getNowMs();
    const selectedEntries = query.selectedRestaurantId
      ? this.entriesByRestaurantId.get(query.selectedRestaurantId) ?? []
      : [];
    const indexedEntries = query.bounds ? this.spatialIndex.query(query.bounds) : [];

    const mergedByKey = new Map<string, MarkerCatalogEntry>();
    selectedEntries.forEach((entry) => {
      mergedByKey.set(resolveEntryKey(entry), entry);
    });
    indexedEntries.forEach((entry) => {
      mergedByKey.set(resolveEntryKey(entry), entry);
    });

    const mergedEntries = Array.from(mergedByKey.values());
    mergedEntries.sort((left, right) => {
      const leftOrder = this.orderByEntryKey.get(resolveEntryKey(left)) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder =
        this.orderByEntryKey.get(resolveEntryKey(right)) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });

    budget?.recordIndexQueryDurationMs(getNowMs() - queryStartMs);
    return mergedEntries;
  }
}

export const createMapViewportQueryService = (): MapViewportQueryService =>
  new MapViewportQueryService();
