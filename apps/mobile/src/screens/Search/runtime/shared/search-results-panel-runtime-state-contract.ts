import type { SearchResponse } from '../../../../types';
import type { SearchSurfaceRedrawPhase } from '../controller/search-surface-redraw-phase';
import type { ResultsPresentationReadModel } from './results-presentation-runtime-contract';
import type { SearchFreezeClassification } from './search-freeze-classification-runtime';

export type SearchResultsPayload = SearchResponse | null;

export type SearchResultsPanelResultsRuntimeState = {
  results: SearchResultsPayload;
  resultsRequestKey: string | null;
  resultsIdentityCandidateKey: string | null;
  resultsPage: number | null;
  resultsDishCount: number;
  resultsRestaurantCount: number;
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
  includeSimilarActive: boolean;
  // metadata.similarAvailable from the committed page-1 response — drives the
  // "similar results available" chip (rendered when > 0 and the toggle is off).
  similarAvailableCount: number;
  risingActive: boolean;
  isPriceSelectorVisible: boolean;
};

export type SearchResultsPanelHydrationRuntimeState = {
  searchSurfaceRedrawPhase: SearchSurfaceRedrawPhase;
  rawSearchSurfaceRedrawPhase: SearchSurfaceRedrawPhase;
  getRawSearchSurfaceRedrawPhase: () => SearchSurfaceRedrawPhase;
  getAllowHydrationFinalizeCommit: () => boolean;
  searchSurfaceRedrawCommitSpanPressureActive: boolean;
  isSearchSurfaceRedrawChromeDeferred: boolean;
  chromeFreezeClassification: SearchFreezeClassification;
};

export type SearchResultsPanelPresentationRuntimeState = {
  pendingPresentationIntentId: string | null;
  renderPolicy: ResultsPresentationReadModel;
};
