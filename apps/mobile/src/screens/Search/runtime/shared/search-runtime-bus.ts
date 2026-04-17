import React from 'react';

import type { RestaurantResult, SearchResponse } from '../../../../types';
import type { MarkerCatalogEntry } from '../map/map-viewport-query';
import type {
  CameraSnapshot,
  ProfileTransitionStatus,
  RestaurantPanelSnapshot,
} from '../profile/profile-transition-state-contract';
import type { RunOneHandoffPhase } from '../controller/run-one-handoff-phase';
import {
  IDLE_RESULTS_PRESENTATION_READ_MODEL,
  IDLE_RESULTS_PRESENTATION_TRANSPORT_STATE,
  isResultsPresentationExecutionStageSettled,
  type ResultsPresentationReadModel,
  type ResultsPresentationTransportState,
} from './results-presentation-runtime-contract';
import {
  IDLE_TOGGLE_INTERACTION_STATE,
  type ToggleInteractionState,
} from './results-toggle-interaction-contract';

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

export type SearchRuntimeMapPresentationPhase =
  | 'idle'
  | 'covered'
  | 'enter_requested'
  | 'entering'
  | 'live'
  | 'exit_preroll'
  | 'exiting';

export const isSearchRuntimeMapPresentationPending = (
  phase: SearchRuntimeMapPresentationPhase
): boolean => phase !== 'idle' && phase !== 'live';

export const isSearchRuntimeMapPresentationSettled = (
  phase: SearchRuntimeMapPresentationPhase
): boolean => !isSearchRuntimeMapPresentationPending(phase);

export const deriveCommittedPreparedResultsSnapshotKey = (
  state: Pick<
    SearchRuntimeBusState,
    'resultsPresentationTransport' | 'resultsHydrationKey' | 'resultsRequestKey'
  >
): string | null => {
  const resultsSnapshotKey = state.resultsHydrationKey ?? state.resultsRequestKey;
  const { executionStage, snapshotKind, transactionId } = state.resultsPresentationTransport;
  return isResultsPresentationExecutionStageSettled(executionStage) ||
    snapshotKind == null ||
    transactionId == null
    ? null
    : resultsSnapshotKey;
};

export const derivePreparedPresentationSnapshotKey = (
  state: Pick<
    SearchRuntimeBusState,
    'preparedPresentationSnapshotKey' | 'resultsHydrationKey' | 'resultsRequestKey'
  >
): string | null =>
  state.preparedPresentationSnapshotKey ?? state.resultsHydrationKey ?? state.resultsRequestKey;

export type SearchRuntimeBusState = {
  results: SearchResponse | null;
  resultsHydrationKey: string | null;
  hydratedResultsKey: string | null;
  canLoadMore: boolean;
  priceButtonLabelText: string;
  priceButtonIsActive: boolean;
  openNow: boolean;
  votesFilterActive: boolean;
  isPriceSelectorVisible: boolean;
  toggleInteraction: ToggleInteractionState;
  shouldRetrySearchOnReconnect: boolean;
  hasSystemStatusBanner: boolean;
  resultsFirstPaintKey: string | null;
  listFirstPaintReady: boolean;
  shouldHydrateResultsForRender: boolean;
  isResultsHydrationSettled: boolean;
  runOneCommitSpanPressureActive: boolean;
  hydrationOperationId: string | null;
  allowHydrationFinalizeCommit: boolean;
  submittedQuery: string;
  activeTab: SearchRuntimeActiveTab;
  pendingTabSwitchTab: SearchRuntimeActiveTab | null;
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
  visibleSortedRestaurantMarkersCount: number;
  visibleDotRestaurantFeaturesCount: number;
  isShortcutCoverageLoading: boolean;
  // Pre-computed marker pipeline (populated by response handler, read by useMapMarkerEngine)
  precomputedMarkerCatalog: MarkerCatalogEntry[] | null;
  precomputedMarkerPrimaryCount: number;
  precomputedCanonicalRestaurantRankById: Map<string, number> | null;
  precomputedRestaurantsById: Map<string, RestaurantResult> | null;
  precomputedMarkerResultsKey: string | null;
  precomputedMarkerActiveTab: SearchRuntimeActiveTab | null;
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
  resultsPresentation: ResultsPresentationReadModel;
  resultsPresentationTransport: ResultsPresentationTransportState;
  // Presentation controller-driven map coordination.
  mapPreparedLabelSourcesReady: boolean;
  preparedPresentationSnapshotKey: string | null;
  profileShellState: SearchRuntimeProfileShellState;
};

export type SearchRuntimeProfileShellState = {
  transitionStatus: ProfileTransitionStatus;
  restaurantPanelSnapshot: RestaurantPanelSnapshot | null;
  mapCameraPadding: CameraSnapshot['padding'];
};

export type SearchRuntimeBusKey = keyof SearchRuntimeBusState;

type SearchRuntimeBusListener = () => void;

const IDLE_PROFILE_SHELL_STATE: SearchRuntimeProfileShellState = {
  transitionStatus: 'idle',
  restaurantPanelSnapshot: null,
  mapCameraPadding: null,
};

const INITIAL_STATE: SearchRuntimeBusState = {
  results: null,
  resultsHydrationKey: null,
  hydratedResultsKey: null,
  canLoadMore: false,
  priceButtonLabelText: '',
  priceButtonIsActive: false,
  openNow: false,
  votesFilterActive: false,
  isPriceSelectorVisible: false,
  toggleInteraction: IDLE_TOGGLE_INTERACTION_STATE,
  shouldRetrySearchOnReconnect: false,
  hasSystemStatusBanner: false,
  resultsFirstPaintKey: null,
  listFirstPaintReady: false,
  shouldHydrateResultsForRender: false,
  isResultsHydrationSettled: true,
  runOneCommitSpanPressureActive: false,
  hydrationOperationId: null,
  allowHydrationFinalizeCommit: true,
  submittedQuery: '',
  activeTab: 'dishes',
  pendingTabSwitchTab: null,
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
  visibleSortedRestaurantMarkersCount: 0,
  visibleDotRestaurantFeaturesCount: 0,
  isShortcutCoverageLoading: false,
  precomputedMarkerCatalog: null,
  precomputedMarkerPrimaryCount: 0,
  precomputedCanonicalRestaurantRankById: null,
  precomputedRestaurantsById: null,
  precomputedMarkerResultsKey: null,
  precomputedMarkerActiveTab: null,
  runOneHandoffPhase: 'idle',
  runOneHandoffOperationId: null,
  isRun1HandoffActive: false,
  isRunOnePreflightFreezeActive: false,
  isRunOneChromeFreezeActive: false,
  isChromeDeferred: false,
  runOneSelectionFeedbackOperationId: null,
  isResponseFrameFreezeActive: false,
  isSubmitChromePriming: false,
  resultsPresentation: IDLE_RESULTS_PRESENTATION_READ_MODEL,
  resultsPresentationTransport: IDLE_RESULTS_PRESENTATION_TRANSPORT_STATE,
  mapPreparedLabelSourcesReady: false,
  preparedPresentationSnapshotKey: null,
  profileShellState: IDLE_PROFILE_SHELL_STATE,
};

export class SearchRuntimeBus {
  private state: SearchRuntimeBusState = INITIAL_STATE;

  private version = 0;

  private readonly listeners = new Map<
    SearchRuntimeBusListener,
    ReadonlySet<SearchRuntimeBusKey> | null
  >();

  private batchDepth = 0;

  private hasPendingNotify = false;

  private pendingChangedKeys: Set<SearchRuntimeBusKey> | null = null;

  public getState(): SearchRuntimeBusState {
    return this.state;
  }

  public getVersion(): number {
    return this.version;
  }

  public subscribe(
    listener: SearchRuntimeBusListener,
    observedKeys?: readonly SearchRuntimeBusKey[]
  ): () => void {
    const scopedKeys =
      observedKeys != null && observedKeys.length > 0 ? new Set(observedKeys) : null;
    this.listeners.set(listener, scopedKeys);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public reset(): void {
    this.state = INITIAL_STATE;
    this.bump(new Set(Object.keys(INITIAL_STATE) as SearchRuntimeBusKey[]));
  }

  public publish(patch: Partial<SearchRuntimeBusState>): void {
    let hasChange = false;
    const changedKeys = new Set<SearchRuntimeBusKey>();
    const nextState: SearchRuntimeBusState = { ...this.state };
    const nextStateMutable = nextState as Record<string, unknown>;
    const currentStateLookup = this.state as Record<string, unknown>;
    (Object.keys(patch) as Array<keyof SearchRuntimeBusState>).forEach((key) => {
      const nextValue = patch[key];
      if (!Object.is(currentStateLookup[key], nextValue)) {
        nextStateMutable[key] = nextValue;
        changedKeys.add(key);
        hasChange = true;
      }
    });
    if (!hasChange) {
      return;
    }
    this.state = nextState;
    this.bump(changedKeys);
  }

  public batch(run: () => void): void {
    this.batchDepth += 1;
    try {
      run();
    } finally {
      this.batchDepth = Math.max(0, this.batchDepth - 1);
      if (this.batchDepth === 0 && this.hasPendingNotify) {
        this.hasPendingNotify = false;
        this.notify(this.pendingChangedKeys);
        this.pendingChangedKeys = null;
      }
    }
  }

  private bump(changedKeys: ReadonlySet<SearchRuntimeBusKey>): void {
    this.version += 1;
    if (this.batchDepth > 0) {
      this.hasPendingNotify = true;
      if (this.pendingChangedKeys == null) {
        this.pendingChangedKeys = new Set(changedKeys);
      } else {
        changedKeys.forEach((key) => this.pendingChangedKeys?.add(key));
      }
      return;
    }
    this.notify(changedKeys);
  }

  private notify(changedKeys: ReadonlySet<SearchRuntimeBusKey> | null): void {
    this.listeners.forEach((observedKeys, listener) => {
      if (observedKeys == null || changedKeys == null) {
        listener();
        return;
      }
      for (const key of observedKeys) {
        if (changedKeys.has(key)) {
          listener();
          return;
        }
      }
    });
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
