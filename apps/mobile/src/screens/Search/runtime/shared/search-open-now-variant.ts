import type { SearchResponse } from '../../../../types';
import type { SearchMountedResultsCoverageEntry } from './search-mounted-results-data-store';

// OPEN-NOW variant DERIVATION (the toggle-data ideal shape, owner-directed 2026-07-07):
// open-now is a PURE FILTER over the score-ranked base rows (verified on live data — the
// filtered order equals the base order), and every row + coverage feature carries its
// openness (rows: operatingStatus.isOpen; coverage: the API's per-feature isOpen). So the
// open-now page-1 world derives CLIENT-SIDE from the base sibling — instant toggle — and
// the resolver trues it up from the network in the background (a version update, no second
// reveal choreography). Rows/features WITHOUT openness data are DROPPED, matching the
// server's open-now post-filter semantics exactly.

/** Filter the base page-1 response down to open rows. Null when the base isn't usable
 *  (no rows to filter — the caller falls through to the network tier). */
export const buildOpenNowVariantResponse = (base: SearchResponse): SearchResponse | null => {
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
      // PROVISIONAL totals: the filtered page-1 counts. The background true-up brings the
      // real totals (and any backfill rows); until then pagination is off by construction.
      totalRestaurantResults: restaurants.length,
      totalFoodResults: dishes.length,
    },
  };
};

/** Does this coverage carry per-feature openness? (Version-skew safety: an older API
 *  omits isOpen — deriving would empty the coverage. The derivation declines instead.) */
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

/** Filter a coverage entry's features to open ones, re-indexing rank (the client source
 *  builder rebakes badges from rank, so re-indexed ranks render correctly). */
export const buildOpenNowCoverageEntry = (
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
