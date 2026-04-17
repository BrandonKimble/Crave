import type { ResultsInteractionModel } from './results-presentation-owner-contract';
import type { ResultsPresentationReadModel } from './results-presentation-runtime-contract';
import type {
  SearchResultsPanelHydrationKeyRuntime,
  SearchResultsPanelRetainedResultsRuntime,
} from './search-results-panel-hydration-runtime-contract';
import type { UseSearchResultsRoutePublicationArgs } from './search-results-panel-runtime-contract';
import type { SearchResultsPanelCardRuntime } from './search-results-panel-card-runtime-contract';
import type { SearchResultsPanelFiltersRuntime } from './use-search-results-panel-filters-runtime';
import type { SearchResultsShellModel } from './results-presentation-shell-contract';

export type UseSearchResultsPanelDataRuntimeArgs = Pick<
  UseSearchResultsRoutePublicationArgs,
  | 'searchRuntimeBus'
  | 'resultsPresentationOwner'
  | 'searchFiltersLayoutCacheRef'
  | 'handleSearchFiltersLayoutCache'
  | 'toggleOpenNow'
  | 'toggleVotesFilter'
  | 'togglePriceSelector'
  | 'getDishSaveHandler'
  | 'getRestaurantSaveHandler'
  | 'stableOpenRestaurantProfileFromResults'
  | 'openScoreInfo'
>;

export type SearchResultsPanelDataRuntime = {
  searchSheetContentLane: SearchResultsShellModel['searchSheetContentLane'];
  handleCloseResults: UseSearchResultsRoutePublicationArgs['resultsPresentationOwner']['presentationActions']['handleCloseResults'];
  notifyToggleInteractionFrostReady: ResultsInteractionModel['notifyToggleInteractionFrostReady'];
  renderPolicy: ResultsPresentationReadModel;
  pendingPresentationIntentId: string | null;
  activeTab: 'dishes' | 'restaurants';
  canLoadMore: boolean;
  isSearchLoading: boolean;
  isLoadingMore: boolean;
  submittedQuery: string;
  activeOverlayKey: string | null;
  runOneCommitSpanPressureActive: boolean;
  isRunOneChromeDeferred: boolean;
  hydrationOperationId: string | null;
  allowHydrationFinalizeCommit: boolean;
  resultsHydrationKey: SearchResultsPanelHydrationKeyRuntime['resultsHydrationKey'];
  hydratedResultsKey: SearchResultsPanelHydrationKeyRuntime['hydratedResultsKey'];
  shouldHydrateResultsForRender: SearchResultsPanelHydrationKeyRuntime['shouldHydrateResultsForRender'];
  setHydratedResultsKeySync: SearchResultsPanelHydrationKeyRuntime['setHydratedResultsKeySync'];
  filtersHeader: SearchResultsPanelFiltersRuntime['filtersHeader'];
  dishes: SearchResultsPanelRetainedResultsRuntime['dishes'];
  restaurants: SearchResultsPanelRetainedResultsRuntime['restaurants'];
  resolvedResults: SearchResultsPanelRetainedResultsRuntime['resolvedResults'];
  onDemandNotice: SearchResultsPanelCardRuntime['onDemandNotice'];
  renderDishCard: SearchResultsPanelCardRuntime['renderDishCard'];
  renderRestaurantCard: SearchResultsPanelCardRuntime['renderRestaurantCard'];
};
