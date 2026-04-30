import type { SearchResponse } from '../../../../types';
import type { ResultsPresentationReadModel } from './results-presentation-runtime-contract';
import type { SearchFreezeClassification } from './search-freeze-classification-runtime';

export type SearchResultsPayload = SearchResponse | null;

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
  priceButtonLabelText: string;
  priceButtonIsActive: boolean;
  openNow: boolean;
  votesFilterActive: boolean;
  isPriceSelectorVisible: boolean;
};

export type SearchResultsPanelHydrationRuntimeState = {
  runOneCommitSpanPressureActive: boolean;
  hydrationOperationId: string | null;
  allowHydrationFinalizeCommit: boolean;
  runtimeHydratedResultsKey: string | null;
  isRunOneChromeDeferred: boolean;
  chromeFreezeClassification: SearchFreezeClassification;
};

export type SearchResultsPanelPresentationRuntimeState = {
  pendingPresentationIntentId: string | null;
  renderPolicy: ResultsPresentationReadModel;
};
