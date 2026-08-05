import type { SearchResponse } from '../../../../types';
import type { ResultsPresentationReadModel } from './results-presentation-runtime-contract';
import type { SearchFreezeClassification } from './search-freeze-classification-runtime';

export type SearchResultsPayload = SearchResponse | null;

export type SearchResultsPanelResultsRuntimeState = {
  resultsRequestKey: string | null;
  resultsIdentityCandidateKey: string | null;
  resultsPage: number | null;
  resultsDishCount: number;
  resultsRestaurantCount: number;
  activeTab: 'dishes' | 'restaurants';
  desiredTab: 'dishes' | 'restaurants';
  resolutionFailure: {
    generation: number;
    reason: string;
    offline: boolean;
    atMs: number;
  } | null;
  canLoadMore: boolean;
  isSearchLoading: boolean;
  isLoadingMore: boolean;
  submittedQuery: string;
  searchMode: string | null;
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

/** F1735: the redraw-coordinator phase machine was a structural fossil (pinned at
 *  'idle'), so the former SearchSurfaceRedrawPhase channel collapses to this two-valued
 *  body-admission handoff derived from the surface authority's results identity. */
export type SearchResultsBodyAdmissionHandoffPhase = 'idle' | 'markers_ready';

export type SearchResultsPanelHydrationRuntimeState = {
  searchSurfaceRedrawPhase: SearchResultsBodyAdmissionHandoffPhase;
  chromeFreezeClassification: SearchFreezeClassification;
};

export type SearchResultsPanelPresentationRuntimeState = {
  pendingPresentationIntentId: string | null;
  renderPolicy: ResultsPresentationReadModel;
};
