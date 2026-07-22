import { defineBandTemplate } from '../../../../overlays/page-body-contract';
import type { ResultsListItem } from '../read-models/read-model-selectors';

// ─── THE RESULTS BODY BANDS (THE PAGE L2, search family — A#14/B#15) ────────────────
//
// The dual-tab results body is TWO BANDS in one shell; a tab toggle is intra-shell
// band visibility, never a scene transition. These templates are the ONE home of the
// band facts that were scattered literals before this declaration:
// - estimatedRowHeight: the 240/270 per-tab literals in the list-item content runtime
// - materialRowType: the pending-face row shape per band (the old empty-face twins
//   hardcoded 'restaurant' EVEN FOR THE DISHES TAB — a live bug this kills)
// - placeholder.count: the pending block's row count
// - keyOf: the one row-identity function (was a per-render useCallback)
//
// The row RENDER stays the family's transport slot (controller closures over resolved
// descriptors + commands — the content-transport seam verdict 2026-07-18); the
// declared template facts here are what the transport reads. The EMPTY surface also
// stays controller-side deliberately: the results empty composes runtime data
// (metadata copy, on-demand notices, failure variants) — it is a content composition,
// not the pure declared-empty case.
//
// Band key ↔ transport lane mapping (the one place it is written down):
// 'restaurants' = the PRIMARY list lane; 'dishes' = the SECONDARY list lane.

export const searchResultsRowKeyOf = (item: ResultsListItem, index: number): string => {
  if (item && typeof item === 'object' && 'kind' in item) {
    return item.key || `row-${index}`;
  }
  if (item && 'foodId' in item) {
    if (item.connectionId) {
      return item.connectionId;
    }
    if (item.foodId && item.restaurantId) {
      return `${item.foodId}-${item.restaurantId}`;
    }
    return `dish-${index}`;
  }
  if (item && 'restaurantId' in item) {
    return item.restaurantId || `restaurant-${index}`;
  }
  return `result-${index}`;
};

export const SEARCH_RESULTS_BANDS = {
  restaurants: defineBandTemplate({
    key: 'restaurants',
    keyOf: searchResultsRowKeyOf,
    estimatedRowHeight: 270,
    materialRowType: 'restaurant',
    placeholder: { count: 8 },
  } as const),
  dishes: defineBandTemplate({
    key: 'dishes',
    keyOf: searchResultsRowKeyOf,
    estimatedRowHeight: 240,
    materialRowType: 'dish',
    placeholder: { count: 8 },
  } as const),
};

export const resolveSearchResultsBand = (activeTab: 'dishes' | 'restaurants') =>
  activeTab === 'dishes' ? SEARCH_RESULTS_BANDS.dishes : SEARCH_RESULTS_BANDS.restaurants;
