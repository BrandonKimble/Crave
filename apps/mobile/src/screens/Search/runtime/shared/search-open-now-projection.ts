import type { SearchResponse } from '../../../../types';
import type { SearchMountedResultsCoverageEntry } from './search-mounted-results-data-store';

// OPEN-NOW coverage PROJECTION (lens exit §4b option ii, S3 2026-07-16 — formerly the
// "sibling-world variant" file): open-now is a LENS — a pure fact-projection over the
// score-ranked base slice of the SAME world (verified on live data — the filtered order
// equals the base order). Every row + coverage feature carries its openness (rows:
// operatingStatus.isOpen; coverage: the API's per-feature isOpen), so the lens's
// OPTIMISTIC FIRST PAINT projects the warm base slice client-side — instant flip — and
// the resolver settles it with the honest server slice fetch (filter-before-paginate,
// the 2026-07-14 parity law) as a version update, no second reveal choreography. There
// is no sibling IDENTITY anywhere: base and open are two lensKeys under one worldKey.
// Rows/features WITHOUT openness data are DROPPED, matching the server's open-now
// post-filter semantics exactly.

/** Project the base page-1 response down to open rows. Null when the base isn't usable
 *  (no rows to filter — the caller falls through to the slice fetch). */
export const projectOpenNowResponseSlice = (base: SearchResponse): SearchResponse | null => {
  const restaurants = (base.restaurants ?? []).filter(
    (restaurant) => restaurant.operatingStatus?.isOpen === true
  );
  const dishes = (base.dishes ?? []).filter(
    (dish) => dish.restaurantOperatingStatus?.isOpen === true
  );
  if (restaurants.length === 0 && dishes.length === 0) {
    return null;
  }
  return {
    ...base,
    restaurants,
    dishes,
    metadata: {
      ...base.metadata,
      // PROVISIONAL totals: the projected page-1 counts. The settling slice fetch brings
      // the real totals (and any backfill rows); until then pagination is off by
      // construction.
      totalRestaurantResults: restaurants.length,
      totalFoodResults: dishes.length,
    },
  };
};

/** Does this coverage carry per-feature openness? (Version-skew safety: an older API
 *  omits isOpen — projecting would empty the coverage. The projection declines instead.) */
export const coverageCarriesOpenness = (
  entry: SearchMountedResultsCoverageEntry | null
): boolean => {
  if (entry == null || entry.features == null || entry.features.length === 0) {
    return true; // nothing to filter — absence of features is not skew
  }
  return entry.features.some(
    (feature) => (feature.properties as { isOpen?: boolean | null }).isOpen != null
  );
};

/** Project a coverage entry's features to open ones, re-indexing rank (the client source
 *  builder rebakes badges from rank, so re-indexed ranks render correctly). */
export const projectOpenNowCoverageEntry = (
  entry: SearchMountedResultsCoverageEntry | null
): SearchMountedResultsCoverageEntry | null => {
  if (entry == null || entry.features == null) {
    return entry;
  }
  const features = entry.features
    .filter((feature) => (feature.properties as { isOpen?: boolean | null }).isOpen === true)
    .map((feature, index) => ({
      ...feature,
      properties: { ...feature.properties, rank: index + 1 },
    }));
  return { ...entry, features };
};
