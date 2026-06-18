import type { Feature, Point } from 'geojson';
import type { RestaurantFeatureProperties } from '../../components/search-map';

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
};
