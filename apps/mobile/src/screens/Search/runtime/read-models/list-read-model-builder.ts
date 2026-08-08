import { logger } from '../../../../utils';
import type { FoodResult, RestaurantResult } from '../../../../types';
import type { RestaurantResultCardDescriptor } from '../../components/restaurant-result-card-descriptor';

// THE ONE-LIST LAW (owner ruling, plans/concept-graph.md §10, adjudication a2eedea3a):
// search results are ONE continuous list ranked by Crave Score. `exactMatch` is ROW
// METADATA (the card renders a provenance chip from it) — never a grouping. There is no
// section row, no divider, no exact-vs-broader section header, and no
// collapse-at-5 "show more exact" affordance: tiers are an ADMISSION mechanism on the
// server, and the client renders the server's rank order verbatim. Reintroducing a
// section/divider row here must fail to typecheck — that is why no such variant exists
// in `ResultsListItem`.
export type ResultsMountedRestaurantCardRow = {
  kind: 'mounted_restaurant_card';
  key: string;
  restaurant: RestaurantResult;
  restaurantId: string;
  preparedDescriptor: RestaurantResultCardDescriptor;
};

/** THE PENDING BLOCK (skeleton-sheet law §1): while a redraw episode is live the list's
 *  data IS this one full-viewport cutout item — the sheet scrolls/drag normally over it,
 *  and the reveal is a data swap in the same fence-release commit that lands the rows. */
export type ResultsPendingBlockRow = {
  kind: 'results_pending_block';
  key: string;
  rowType: 'restaurant' | 'dish';
};

export type ResultsListItem =
  | FoodResult
  | RestaurantResult
  | ResultsMountedRestaurantCardRow
  | ResultsPendingBlockRow;

const EMPTY_DISHES: FoodResult[] = [];
const EMPTY_RESTAURANTS: RestaurantResult[] = [];
const EMPTY_RESULTS: Array<FoodResult | RestaurantResult> = [];

type BuildSafeResultsDataArgs = {
  activeTab: 'dishes' | 'restaurants';
  dishes: ReadonlyArray<FoodResult> | null | undefined;
  restaurants: ReadonlyArray<RestaurantResult> | null | undefined;
};

export const buildSafeResultsData = ({
  activeTab,
  dishes,
  restaurants,
}: BuildSafeResultsDataArgs): Array<FoodResult | RestaurantResult> => {
  const source = activeTab === 'dishes' ? dishes : restaurants;
  if (!Array.isArray(source)) {
    logger.error('resultsData not array', { tab: activeTab, type: typeof source });
    return activeTab === 'dishes' ? EMPTY_DISHES : EMPTY_RESTAURANTS;
  }
  if (source.length === 0) {
    return EMPTY_RESULTS;
  }
  const filtered = source.filter(
    (item): item is FoodResult | RestaurantResult => item !== null && item !== undefined
  );
  return filtered.length > 0 ? filtered : EMPTY_RESULTS;
};

export type SearchResultsListRowsByTab = {
  dishes: Array<FoodResult | RestaurantResult>;
  restaurants: Array<FoodResult | RestaurantResult>;
};

/** THE list read model: both tabs' rows, in the order the server ranked them. No
 *  partitioning, no truncation — the projection IS the safe pass-through. */
export const buildSafeResultsDataByTab = ({
  dishes,
  restaurants,
}: {
  dishes: ReadonlyArray<FoodResult> | null | undefined;
  restaurants: ReadonlyArray<RestaurantResult> | null | undefined;
}): SearchResultsListRowsByTab => ({
  dishes: buildSafeResultsData({ activeTab: 'dishes', dishes, restaurants }),
  restaurants: buildSafeResultsData({ activeTab: 'restaurants', dishes, restaurants }),
});
