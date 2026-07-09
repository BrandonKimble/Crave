/**
 * R1b (plans/search-flow-plan.md §D6): the single mint for the results identity key.
 *
 * The key is `searchRequestId` plus the response factors that legitimately re-identify a
 * results set under the SAME request id: the page, the merged per-axis row counts (pagination
 * merges grow them), and the server totals. Every downstream key in the results-identity
 * chain — the hydration candidate, the hydration/identity key gated by page, prepared-rows
 * staging/commit targets, and the presentation-surface readiness keys — must be THIS value
 * (or null), never a re-derivation. `buildResultsIdentityKey` is called in exactly one place:
 * `deriveSearchResponseResultsCommitPatch` in use-search-submit-response-owner.ts.
 *
 * NOTE: search-results-list-admission-attribution.ts parses `:page:` out of this format for
 * admission telemetry — keep the segment layout stable or update it together.
 */
export type ResultsIdentityKeyInputs = {
  searchRequestId: string;
  page: number;
  dishCount: number;
  restaurantCount: number;
  totalFoodResults: number | 'na';
  totalRestaurantResults: number | 'na';
};

export const buildResultsIdentityKey = ({
  searchRequestId,
  page,
  dishCount,
  restaurantCount,
  totalFoodResults,
  totalRestaurantResults,
}: ResultsIdentityKeyInputs): string =>
  `${searchRequestId}:page:${page}:dishes:${dishCount}:restaurants:${restaurantCount}:totalFood:${totalFoodResults}:totalRestaurants:${totalRestaurantResults}`;
