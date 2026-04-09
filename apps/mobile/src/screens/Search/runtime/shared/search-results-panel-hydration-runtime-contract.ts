import type { FoodResult, RestaurantResult } from '../../../../types';
import type { SearchResultsPayload } from './search-results-panel-runtime-state-contract';

export type SearchResultsPanelRetainedResultsRuntime = {
  resolvedResults: SearchResultsPayload;
  dishes: FoodResult[];
  restaurants: RestaurantResult[];
};

export type SearchResultsPanelHydrationKeyRuntime = {
  resultsHydrationKey: string | null;
  hydratedResultsKey: string | null;
  shouldHydrateResultsForRender: boolean;
  setHydratedResultsKeySync: (nextHydrationKey: string | null) => void;
  requestVersionKey: string;
};

export type SearchResultsPanelOnDemandQueryRuntime = {
  onDemandNoticeQuery: string;
};
