import { buildMarkerCatalogReadModel } from './map-read-model-builder';
import type { ResolvedRestaurantMapLocation } from './restaurant-location-selection';
import type { RestaurantResult } from '../../../../types';

// Hermetic stand-ins for the injected location helpers (the real ones transitively import
// react-native via constants/search; the builder takes them as args by design).
const resolveLocations = (restaurant: RestaurantResult): ResolvedRestaurantMapLocation[] =>
  ((restaurant as unknown as { locations: Array<Record<string, unknown>> }).locations ?? []).map(
    (location, index) => ({
      locationId: location.locationId as string,
      latitude: location.latitude as number,
      longitude: location.longitude as number,
      isPrimary: index === 0,
      locationIndex: index,
    })
  );

const pickClosest = (
  restaurant: RestaurantResult,
  anchor: { lat: number; lng: number } | null
): ResolvedRestaurantMapLocation | null => {
  const locations = resolveLocations(restaurant);
  if (!locations.length) return null;
  if (!anchor) return locations[0];
  return locations.reduce((best, candidate) => {
    const d = (l: ResolvedRestaurantMapLocation) =>
      (l.latitude - anchor.lat) ** 2 + (l.longitude - anchor.lng) ** 2;
    return d(candidate) < d(best) ? candidate : best;
  });
};

// L1 (§3.1 search policy) goldens: representative + in-searched-bounds siblings as group
// members; out-of-bounds siblings invisible-resident (no entry); representative sorts first
// within its group so it wins the native group budget's slot.

const BOUNDS = {
  northEast: { lat: 40.8, lng: -73.95 },
  southWest: { lat: 40.7, lng: -74.02 },
};

const multiLocationRestaurant = (): RestaurantResult =>
  ({
    restaurantId: 'rest-A',
    restaurantName: 'Gelateria Test',
    craveScore: 9.5,
    rank: 1,
    displayLocation: {
      locationId: 'loc-primary',
      latitude: 40.75,
      longitude: -73.98,
      googlePlaceId: 'gp-1',
    },
    locations: [
      { locationId: 'loc-primary', latitude: 40.75, longitude: -73.98, googlePlaceId: 'gp-1' },
      { locationId: 'loc-in-1', latitude: 40.76, longitude: -73.99, googlePlaceId: 'gp-2' },
      { locationId: 'loc-in-2', latitude: 40.72, longitude: -74.0, googlePlaceId: 'gp-3' },
      // Out of the searched bounds (Brooklyn-ish): invisible-resident.
      { locationId: 'loc-out', latitude: 40.65, longitude: -73.95, googlePlaceId: 'gp-4' },
    ],
  }) as unknown as RestaurantResult;

const build = (overrides?: {
  searchedBounds?: typeof BOUNDS | null;
  selectedRestaurantId?: string | null;
}) =>
  buildMarkerCatalogReadModel({
    activeTab: 'restaurants',
    dishes: [],
    markerRestaurants: [multiLocationRestaurant()],
    selectedRestaurantId: overrides?.selectedRestaurantId ?? null,
    canonicalRestaurantRankById: new Map([['rest-A', 1]]),
    // Anchor near loc-primary so it is the representative.
    locationSelectionAnchor: { lat: 40.75, lng: -73.98 },
    searchedBounds: overrides?.searchedBounds === undefined ? BOUNDS : overrides.searchedBounds,
    resolveRestaurantMapLocations: resolveLocations,
    pickPreferredRestaurantMapLocation: pickClosest,
    getCraveScoreColorFromScore: () => '#00aa00',
  });

describe('buildMarkerCatalogReadModel — L1 group emission', () => {
  it('emits the representative + in-bounds siblings; out-of-bounds joins as INVISIBLE-RESIDENT (L4)', () => {
    const { catalog } = build();
    const ids = catalog.map((entry) => entry.feature.id);
    expect(ids).toEqual([
      'rest-A-loc-primary',
      'rest-A-loc-in-1',
      'rest-A-loc-in-2',
      'rest-A-loc-out',
    ]);
    const outEntry = catalog.find((entry) => entry.feature.id === 'rest-A-loc-out');
    expect(outEntry?.isInvisibleResident).toBe(true);
    expect(outEntry?.feature.properties.isInvisibleResident).toBe(true);
    expect(
      catalog
        .filter((entry) => entry.feature.id !== 'rest-A-loc-out')
        .every(
          (entry) =>
            entry.isInvisibleResident !== true &&
            entry.feature.properties.isInvisibleResident !== true
        )
    ).toBe(true);
  });

  it('marks exactly the representative and sorts it FIRST within the equal-rank group', () => {
    const { catalog } = build();
    expect(catalog[0].feature.id).toBe('rest-A-loc-primary');
    expect(catalog[0].isGroupRepresentative).toBe(true);
    expect(catalog.slice(1).every((entry) => entry.isGroupRepresentative !== true)).toBe(true);
  });

  it('no searched bounds → representative only (no sibling class without the viewport fact)', () => {
    const { catalog } = build({ searchedBounds: null });
    expect(catalog.map((entry) => entry.feature.id)).toEqual(['rest-A-loc-primary']);
  });

  it('selected restaurant: ALL locations render NORMALLY — no invisible flag (no double-emit)', () => {
    const { catalog } = build({ selectedRestaurantId: 'rest-A' });
    expect(catalog).toHaveLength(4);
    expect(catalog.every((entry) => entry.isInvisibleResident !== true)).toBe(true);
  });

  it('selected restaurant renders ALL locations (the selection spread, forced-lane territory)', () => {
    const { catalog } = build({ selectedRestaurantId: 'rest-A' });
    expect(catalog).toHaveLength(4);
  });
});
