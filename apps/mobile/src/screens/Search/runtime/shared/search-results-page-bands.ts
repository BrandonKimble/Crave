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
  if (item && 'itemId' in item) {
    if (item.connectionId) {
      return item.connectionId;
    }
    if (item.itemId && item.placeId) {
      return `${item.itemId}-${item.placeId}`;
    }
    return `dish-${index}`;
  }
  if (item && 'placeId' in item) {
    return item.placeId || `restaurant-${index}`;
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

// F1325: FlashList uses `overrideItemLayout` in PREFERENCE to `estimatedItemSize`
// for layout, so these are the numbers that actually govern row geometry — they
// used to be five bare integers hardcoded in the list-item TRANSPORT runtime,
// duplicating (and able to silently drift from) the estimates above. One home:
// dish/restaurant match the per-tab estimates exactly (a kind-tagged
// mounted_restaurant_card row is the same visual height as a shape-only
// restaurant row); the untyped-kind fallback has no per-tab estimate to
// duplicate, so it lives here as its own fact. There is no section height:
// the one-list law leaves no section row to measure.
export const SEARCH_RESULTS_ROW_KIND_HEIGHTS = {
  mountedRestaurantCard: SEARCH_RESULTS_BANDS.restaurants.estimatedRowHeight,
  kindFallback: 88,
  dish: SEARCH_RESULTS_BANDS.dishes.estimatedRowHeight,
  restaurant: SEARCH_RESULTS_BANDS.restaurants.estimatedRowHeight,
} as const;
