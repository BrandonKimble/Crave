import type { Feature, Point } from 'geojson';
import type { Coordinate, MapBounds } from '../../../../types';
import type { RestaurantFeatureProperties } from '../../components/search-map';

/** Pure bounds membership (antimeridian-aware on lng). Lives in this PURE leaf so the
 *  catalog builder (hermetic jest) can use it without the react-native-tainted geo chain. */
export const isCoordinateWithinBounds = (coordinate: Coordinate, bounds: MapBounds): boolean => {
  const minLat = Math.min(bounds.southWest.lat, bounds.northEast.lat);
  const maxLat = Math.max(bounds.southWest.lat, bounds.northEast.lat);
  const latWithinRange = coordinate.lat >= minLat && coordinate.lat <= maxLat;
  const minLng = bounds.southWest.lng;
  const maxLng = bounds.northEast.lng;
  const lngWithinRange =
    minLng <= maxLng
      ? coordinate.lng >= minLng && coordinate.lng <= maxLng
      : coordinate.lng >= minLng || coordinate.lng <= maxLng;
  return latWithinRange && lngWithinRange;
};

// Shared shape of a single map marker candidate. Produced by the marker-catalog
// read-model builder and consumed wherever the FULL resident candidate catalog is
// projected to the source frame.
//
// NOTE: there is intentionally no viewport-query service anymore. Under v4 invariant 1
// (RESIDENT sources), both shortcut and natural search publish the full bounded
// candidate catalog to the source frame and let LOD opacity + the native screen-space
// visibility gate decide on-screen membership per camera tick. Viewport-filtering the
// candidate set on the JS side (the old MapViewportQueryService.queryVisibleCandidates)
// caused source-membership churn on pan for natural search — markers leaving the
// viewport were ejected from the source instead of crossfading out — so it was removed.
export type MarkerCatalogEntry = {
  feature: Feature<Point, RestaurantFeatureProperties>;
  rank: number;
  locationIndex: number;
  /** World-camera L1 (§3.1): true on the entity group's REPRESENTATIVE location (the P5
   *  anchor pick). Group members share one rank and the native budget promotes the first
   *  on-screen member in catalog order — the sort keys off this flag so the representative
   *  wins the group's slot whenever it is on-screen. Absent = single-location entry. */
  isGroupRepresentative?: boolean;
  /** World-camera L4 (§3.4): true on a group sibling OUTSIDE the searched bounds — resident
   *  in the catalog (so the selection overlay's forcedKeys promotion can reach it) but never
   *  presented as a pin/dot/label unless its group is selected. Absent = normal member. */
  isInvisibleResident?: boolean;
};
