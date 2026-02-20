import React from 'react';

import type { RestaurantResult, SearchResponse } from '../../../../types';
import type { MarkerCatalogEntry } from '../map/map-viewport-query';
import type { RunOneHandoffPhase } from '../controller/run-one-handoff-phase';

export type SearchRuntimeActiveTab = 'dishes' | 'restaurants';
export type SearchRuntimeSearchMode = 'natural' | 'shortcut' | null;
export type SearchRuntimeOperationLane =
  | 'idle'
  | 'lane_a_ack'
  | 'lane_b_data_commit'
  | 'lane_c_list_first_paint'
  | 'lane_d_map_dots'
  | 'lane_e_map_pins'
  | 'lane_f_polish';

export type SearchRuntimeBusState = {
  results: SearchResponse | null;
  resultsHydrationKey: string | null;
  hydratedResultsKey: string | null;
  canLoadMore: boolean;
  rankButtonLabelText: string;
  rankButtonIsActive: boolean;
  priceButtonLabelText: string;
  priceButtonIsActive: boolean;
  openNow: boolean;
  votesFilterActive: boolean;
  isRankSelectorVisible: boolean;
  isPriceSelectorVisible: boolean;
  isFilterTogglePending: boolean;
  shouldRetrySearchOnReconnect: boolean;
  hasSystemStatusBanner: boolean;
  shouldHydrateResultsForRender: boolean;
  isResultsHydrationSettled: boolean;
  isVisualSyncPending: boolean;
  visualSyncCandidateRequestKey: string | null;
  visualReadyRequestKey: string | null;
  markerRevealCommitId: number | null;
  runOneCommitSpanPressureActive: boolean;
  hydrationOperationId: string | null;
  allowHydrationFinalizeCommit: boolean;
  submittedQuery: string;
  activeTab: SearchRuntimeActiveTab;
  searchMode: SearchRuntimeSearchMode;
  isSearchSessionActive: boolean;
  isSearchLoading: boolean;
  isLoadingMore: boolean;
  isMapActivationDeferred: boolean;
  activeOperationId: string | null;
  activeOperationLane: SearchRuntimeOperationLane;
  currentPage: number;
  hasMoreFood: boolean;
  hasMoreRestaurants: boolean;
  isPaginationExhausted: boolean;
  resultsRequestKey: string | null;
  mapHighlightedRestaurantId: string | null;
  visibleSortedRestaurantMarkersCount: number;
  visibleDotRestaurantFeaturesCount: number;
  isShortcutCoverageLoading: boolean;
  // Pre-computed marker pipeline (populated by response handler, read by useMapMarkerEngine)
  precomputedMarkerCatalog: MarkerCatalogEntry[] | null;
  precomputedMarkerPrimaryCount: number;
  precomputedCanonicalRestaurantRankById: Map<string, number> | null;
  precomputedRestaurantsById: Map<string, RestaurantResult> | null;
  precomputedMarkerResultsKey: string | null;
  // Handoff-derived fields (bridged from RunOneHandoffCoordinator)
  runOneHandoffPhase: RunOneHandoffPhase;
  runOneHandoffOperationId: string | null;
  isRun1HandoffActive: boolean;
  isRunOnePreflightFreezeActive: boolean;
  isRunOneChromeFreezeActive: boolean;
  isChromeDeferred: boolean;
  runOneSelectionFeedbackOperationId: string | null;
  // Freeze gate fields (moved from useState hooks to bus for fewer re-renders)
  isResponseFrameFreezeActive: boolean;
  isSubmitChromePriming: boolean;
};

type SearchRuntimeBusListener = () => void;

const INITIAL_STATE: SearchRuntimeBusState = {
  results: null,
  resultsHydrationKey: null,
  hydratedResultsKey: null,
  canLoadMore: false,
  rankButtonLabelText: '',
  rankButtonIsActive: false,
  priceButtonLabelText: '',
  priceButtonIsActive: false,
  openNow: false,
  votesFilterActive: false,
  isRankSelectorVisible: false,
  isPriceSelectorVisible: false,
  isFilterTogglePending: false,
  shouldRetrySearchOnReconnect: false,
  hasSystemStatusBanner: false,
  shouldHydrateResultsForRender: false,
  isResultsHydrationSettled: true,
  isVisualSyncPending: false,
  visualSyncCandidateRequestKey: null,
  visualReadyRequestKey: null,
  markerRevealCommitId: null,
  runOneCommitSpanPressureActive: false,
  hydrationOperationId: null,
  allowHydrationFinalizeCommit: true,
  submittedQuery: '',
  activeTab: 'dishes',
  searchMode: null,
  isSearchSessionActive: false,
  isSearchLoading: false,
  isLoadingMore: false,
  isMapActivationDeferred: false,
  activeOperationId: null,
  activeOperationLane: 'idle',
  currentPage: 1,
  hasMoreFood: false,
  hasMoreRestaurants: false,
  isPaginationExhausted: false,
  resultsRequestKey: null,
  mapHighlightedRestaurantId: null,
  visibleSortedRestaurantMarkersCount: 0,
  visibleDotRestaurantFeaturesCount: 0,
  isShortcutCoverageLoading: false,
  precomputedMarkerCatalog: null,
  precomputedMarkerPrimaryCount: 0,
  precomputedCanonicalRestaurantRankById: null,
  precomputedRestaurantsById: null,
  precomputedMarkerResultsKey: null,
  runOneHandoffPhase: 'idle',
  runOneHandoffOperationId: null,
  isRun1HandoffActive: false,
  isRunOnePreflightFreezeActive: false,
  isRunOneChromeFreezeActive: false,
  isChromeDeferred: false,
  runOneSelectionFeedbackOperationId: null,
  isResponseFrameFreezeActive: false,
  isSubmitChromePriming: false,
};

export class SearchRuntimeBus {
  private state: SearchRuntimeBusState = INITIAL_STATE;

  private version = 0;

  private readonly listeners = new Set<SearchRuntimeBusListener>();

  private batchDepth = 0;

  private hasPendingNotify = false;

  public getState(): SearchRuntimeBusState {
    return this.state;
  }

  public getVersion(): number {
    return this.version;
  }

  public subscribe(listener: SearchRuntimeBusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public reset(): void {
    this.state = INITIAL_STATE;
    this.bump();
  }

  public publish(patch: Partial<SearchRuntimeBusState>): void {
    let hasChange = false;
    const nextState: SearchRuntimeBusState = { ...this.state };
    const nextStateMutable = nextState as Record<string, unknown>;
    const currentStateLookup = this.state as Record<string, unknown>;
    (Object.keys(patch) as Array<keyof SearchRuntimeBusState>).forEach((key) => {
      const nextValue = patch[key];
      if (!Object.is(currentStateLookup[key], nextValue)) {
        nextStateMutable[key] = nextValue;
        hasChange = true;
      }
    });
    if (!hasChange) {
      return;
    }
    this.state = nextState;
    this.bump();
  }

  public batch(run: () => void): void {
    this.batchDepth += 1;
    try {
      run();
    } finally {
      this.batchDepth = Math.max(0, this.batchDepth - 1);
      if (this.batchDepth === 0 && this.hasPendingNotify) {
        this.hasPendingNotify = false;
        this.notify();
      }
    }
  }

  private bump(): void {
    this.version += 1;
    if (this.batchDepth > 0) {
      this.hasPendingNotify = true;
      return;
    }
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const createSearchRuntimeBus = (): SearchRuntimeBus => new SearchRuntimeBus();

// ---------------------------------------------------------------------------
// React Context — allows descendants to read bus directly without prop drilling
// ---------------------------------------------------------------------------

export const SearchRuntimeBusContext = React.createContext<SearchRuntimeBus | null>(null);

export const useSearchBus = (): SearchRuntimeBus => {
  const bus = React.useContext(SearchRuntimeBusContext);
  if (bus == null) {
    throw new Error('useSearchBus must be used within a SearchRuntimeBusContext.Provider');
  }
  return bus;
};
