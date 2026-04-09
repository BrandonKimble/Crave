import type { FoodResult, RestaurantResult } from '../../../../types';
import type { ResultsPresentationReadModel } from './results-presentation-runtime-contract';

export type SearchResultsPayload = {
  dishes?: FoodResult[];
  restaurants?: RestaurantResult[];
  metadata?: Record<string, unknown>;
} | null;

export type SearchResultsPanelResultsRuntimeState = {
  results: SearchResultsPayload;
  activeTab: 'dishes' | 'restaurants';
  pendingTabSwitchTab: 'dishes' | 'restaurants' | null;
  canLoadMore: boolean;
  isSearchLoading: boolean;
  isLoadingMore: boolean;
  submittedQuery: string;
};

export type SearchResultsPanelFiltersRuntimeState = {
  rankButtonLabelText: string;
  rankButtonIsActive: boolean;
  priceButtonLabelText: string;
  priceButtonIsActive: boolean;
  openNow: boolean;
  votesFilterActive: boolean;
  isRankSelectorVisible: boolean;
  isPriceSelectorVisible: boolean;
};

export type SearchResultsPanelHydrationRuntimeState = {
  runOneCommitSpanPressureActive: boolean;
  hydrationOperationId: string | null;
  allowHydrationFinalizeCommit: boolean;
  runtimeHydratedResultsKey: string | null;
  isRunOneChromeDeferred: boolean;
};

export type SearchResultsPanelPresentationRuntimeState = {
  pendingPresentationIntentId: string | null;
  renderPolicy: ResultsPresentationReadModel;
};
