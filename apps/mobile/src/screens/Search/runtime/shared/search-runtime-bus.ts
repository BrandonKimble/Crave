import React from 'react';

import type { SearchResponse } from '../../../../types';
import type {
  CameraSnapshot,
  ProfileTransitionStatus,
  RestaurantPanelSnapshot,
} from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import type { SearchSurfaceRedrawPhase } from '../controller/search-surface-redraw-phase';
import {
  IDLE_TOGGLE_INTERACTION_STATE,
  type ToggleInteractionState,
} from './results-toggle-interaction-contract';
import {
  resolveResultsPresentationFreezePolicyFacts,
  type ResultsPresentationFreezePolicyFacts,
} from './results-presentation-policy-facts-resolver';
import { logPerfScenarioStackAttribution } from '../../../../perf/perf-scenario-attribution';
export type SearchRuntimeActiveTab = 'dishes' | 'restaurants';
export type SearchRuntimeSearchMode = 'natural' | 'shortcut' | null;
export type SearchRuntimeOperationLane =
  | 'idle'
  | 'lane_a_ack'
  | 'lane_b_data_commit'
  | 'lane_c_prepared_rows'
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

export type SearchRuntimeBusState = {
  results: SearchResponse | null;
  resultsHydrationCandidateKey: string | null;
  resultsPage: number | null;
  resultsDishCount: number;
  resultsRestaurantCount: number;
  canLoadMore: boolean;
  priceButtonLabelText: string;
  priceButtonIsActive: boolean;
  openNow: boolean;
  votesFilterActive: boolean;
  isPriceSelectorVisible: boolean;
  toggleInteraction: ToggleInteractionState;
  shouldRetrySearchOnReconnect: boolean;
  hasSystemStatusBanner: boolean;
  searchSurfaceRedrawCommitSpanPressureActive: boolean;
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
  // Surface-redraw-derived fields (bridged from SearchSurfaceRedrawCoordinator)
  searchSurfaceRedrawPhase: SearchSurfaceRedrawPhase;
  searchSurfaceRedrawOperationId: string | null;
  isSearchSurfaceRedrawActive: boolean;
  isSearchSurfaceRedrawPreflightFreezeActive: boolean;
  isSearchSurfaceRedrawChromeFreezeActive: boolean;
  isChromeDeferred: boolean;
  searchSurfaceRedrawSelectionFeedbackOperationId: string | null;
  // Freeze gate fields (moved from useState hooks to bus for fewer re-renders)
  isResponseFrameFreezeActive: boolean;
  isSubmitChromePriming: boolean;
  profileShellState: SearchRuntimeProfileShellState;
};

export type SearchRuntimeProfileShellState = {
  transitionStatus: ProfileTransitionStatus;
  restaurantPanelSnapshot: RestaurantPanelSnapshot | null;
  mapCameraPadding: CameraSnapshot['padding'];
  mapHighlightedRestaurantId: string | null;
};

export type SearchRuntimeBusKey = keyof SearchRuntimeBusState;

type SearchRuntimeBusListener = () => void;

type SearchRuntimeBusListenerRecord = {
  observedKeys: ReadonlySet<SearchRuntimeBusKey> | null;
  debugLabel: string | null;
};

type SearchRuntimeBusDiagnosticEntry = {
  kind: 'publish' | 'notify';
  nowMs: number;
  durationMs: number;
  changedKeys: SearchRuntimeBusKey[];
  listenerCount: number;
  notifiedListenerCount?: number;
  notifiedListenerLabels?: string[];
  batchDepth: number;
  version: number;
  activeOperationLane: SearchRuntimeOperationLane;
  searchSurfaceRedrawPhase: SearchSurfaceRedrawPhase;
  resultsPresentationStage: string | null;
  stack?: string[];
};

export type SearchRuntimeBusDiagnosticsSnapshot = {
  version: number;
  listenerCount: number;
  batchDepth: number;
  pendingChangedKeys: SearchRuntimeBusKey[];
  recent: SearchRuntimeBusDiagnosticEntry[];
};

export type SearchRuntimeBusPolicyFactsSnapshot = ResultsPresentationFreezePolicyFacts;

export type SearchRuntimeBusSearchChromeScalarPrimitiveTarget = {
  updatePrimitiveSnapshot: (patch: {
    isSearchSessionActive?: boolean;
    isSearchLoading?: boolean;
    isLoadingMore?: boolean;
    hasResults?: boolean;
  }) => void;
};

const IDLE_PROFILE_SHELL_STATE: SearchRuntimeProfileShellState = {
  transitionStatus: 'idle',
  restaurantPanelSnapshot: null,
  mapCameraPadding: null,
  mapHighlightedRestaurantId: null,
};

const INITIAL_STATE: SearchRuntimeBusState = {
  results: null,
  resultsHydrationCandidateKey: null,
  resultsPage: null,
  resultsDishCount: 0,
  resultsRestaurantCount: 0,
  canLoadMore: false,
  priceButtonLabelText: '',
  priceButtonIsActive: false,
  openNow: false,
  votesFilterActive: false,
  isPriceSelectorVisible: false,
  toggleInteraction: IDLE_TOGGLE_INTERACTION_STATE,
  shouldRetrySearchOnReconnect: false,
  hasSystemStatusBanner: false,
  searchSurfaceRedrawCommitSpanPressureActive: false,
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
  searchSurfaceRedrawPhase: 'idle',
  searchSurfaceRedrawOperationId: null,
  isSearchSurfaceRedrawActive: false,
  isSearchSurfaceRedrawPreflightFreezeActive: false,
  isSearchSurfaceRedrawChromeFreezeActive: false,
  isChromeDeferred: false,
  searchSurfaceRedrawSelectionFeedbackOperationId: null,
  isResponseFrameFreezeActive: false,
  isSubmitChromePriming: false,
  profileShellState: IDLE_PROFILE_SHELL_STATE,
};

const resolveSearchRuntimeBusPolicyFactsSnapshot = (
  state: SearchRuntimeBusState
): SearchRuntimeBusPolicyFactsSnapshot => ({
  ...resolveResultsPresentationFreezePolicyFacts({
    isSearchSurfaceRedrawChromeFreezeActive: state.isSearchSurfaceRedrawChromeFreezeActive,
    isSearchSurfaceRedrawPreflightFreezeActive: state.isSearchSurfaceRedrawPreflightFreezeActive,
    isSearchSurfaceRedrawActive: state.isSearchSurfaceRedrawActive,
    isResponseFrameFreezeActive: state.isResponseFrameFreezeActive,
    isChromeDeferred: state.isChromeDeferred,
    searchSurfaceRedrawCommitSpanPressureActive: state.searchSurfaceRedrawCommitSpanPressureActive,
  }),
});

export class SearchRuntimeBus {
  private state: SearchRuntimeBusState = INITIAL_STATE;

  private policyFactsSnapshot: SearchRuntimeBusPolicyFactsSnapshot =
    resolveSearchRuntimeBusPolicyFactsSnapshot(INITIAL_STATE);

  private version = 0;

  private readonly listeners = new Map<SearchRuntimeBusListener, SearchRuntimeBusListenerRecord>();

  private batchDepth = 0;

  private hasPendingNotify = false;

  private pendingChangedKeys: Set<SearchRuntimeBusKey> | null = null;

  private searchChromeScalarPrimitiveTarget: SearchRuntimeBusSearchChromeScalarPrimitiveTarget | null =
    null;

  private readonly diagnosticsRing: SearchRuntimeBusDiagnosticEntry[] = [];

  public getState(): SearchRuntimeBusState {
    return this.state;
  }

  public getVersion(): number {
    return this.version;
  }

  public getPolicyFactsSnapshot(): SearchRuntimeBusPolicyFactsSnapshot {
    return this.policyFactsSnapshot;
  }

  public readDiagnostics(): SearchRuntimeBusDiagnosticsSnapshot {
    return {
      version: this.version,
      listenerCount: this.listeners.size,
      batchDepth: this.batchDepth,
      pendingChangedKeys: Array.from(this.pendingChangedKeys ?? []),
      recent: this.diagnosticsRing.slice(-12),
    };
  }

  public subscribe(
    listener: SearchRuntimeBusListener,
    observedKeys?: readonly SearchRuntimeBusKey[],
    debugLabel?: string
  ): () => void {
    const scopedKeys =
      observedKeys != null && observedKeys.length > 0 ? new Set(observedKeys) : null;
    this.listeners.set(listener, {
      observedKeys: scopedKeys,
      debugLabel: debugLabel ?? null,
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  public reset(): void {
    this.state = INITIAL_STATE;
    this.policyFactsSnapshot = resolveSearchRuntimeBusPolicyFactsSnapshot(INITIAL_STATE);
    this.syncSearchChromeScalarPrimitiveTarget(
      new Set(Object.keys(INITIAL_STATE) as SearchRuntimeBusKey[])
    );
    this.bump(new Set(Object.keys(INITIAL_STATE) as SearchRuntimeBusKey[]));
  }

  public setSearchChromeScalarPrimitiveTarget(
    target: SearchRuntimeBusSearchChromeScalarPrimitiveTarget | null
  ): () => void {
    this.searchChromeScalarPrimitiveTarget = target;
    this.syncSearchChromeScalarPrimitiveTarget(null);
    return () => {
      if (this.searchChromeScalarPrimitiveTarget === target) {
        this.searchChromeScalarPrimitiveTarget = null;
      }
    };
  }

  public publish(patch: Partial<SearchRuntimeBusState>): void {
    const startedAt = resolveSearchRuntimeBusPerfNow();
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
    this.policyFactsSnapshot = resolveSearchRuntimeBusPolicyFactsSnapshot(nextState);
    this.syncSearchChromeScalarPrimitiveTarget(changedKeys);
    this.bump(changedKeys);
    this.recordDiagnostic('publish', changedKeys, resolveSearchRuntimeBusPerfNow() - startedAt);
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
    const startedAt = resolveSearchRuntimeBusPerfNow();
    let notifiedListenerCount = 0;
    const notifiedListenerLabels: string[] = [];
    this.listeners.forEach((listenerRecord, listener) => {
      const { observedKeys, debugLabel } = listenerRecord;
      if (observedKeys == null || changedKeys == null) {
        notifiedListenerCount += 1;
        if (debugLabel != null) {
          notifiedListenerLabels.push(debugLabel);
        }
        listener();
        return;
      }
      for (const key of observedKeys) {
        if (changedKeys.has(key)) {
          notifiedListenerCount += 1;
          if (debugLabel != null) {
            notifiedListenerLabels.push(debugLabel);
          }
          listener();
          return;
        }
      }
    });
    if (changedKeys != null && notifiedListenerCount > 0) {
      this.recordDiagnostic(
        'notify',
        changedKeys,
        resolveSearchRuntimeBusPerfNow() - startedAt,
        notifiedListenerCount,
        notifiedListenerLabels
      );
    }
  }

  private syncSearchChromeScalarPrimitiveTarget(
    changedKeys: ReadonlySet<SearchRuntimeBusKey> | null
  ): void {
    const target = this.searchChromeScalarPrimitiveTarget;
    if (target == null) {
      return;
    }
    if (
      changedKeys != null &&
      !changedKeys.has('isSearchSessionActive') &&
      !changedKeys.has('isSearchLoading') &&
      !changedKeys.has('isLoadingMore') &&
      !changedKeys.has('results') &&
      !changedKeys.has('resultsRequestKey') &&
      !changedKeys.has('resultsHydrationCandidateKey') &&
      !changedKeys.has('resultsDishCount') &&
      !changedKeys.has('resultsRestaurantCount')
    ) {
      return;
    }
    target.updatePrimitiveSnapshot({
      isSearchSessionActive: this.state.isSearchSessionActive,
      isSearchLoading: this.state.isSearchLoading,
      isLoadingMore: this.state.isLoadingMore,
      hasResults:
        this.state.results != null ||
        this.state.resultsRequestKey != null ||
        this.state.resultsHydrationCandidateKey != null ||
        this.state.resultsDishCount > 0 ||
        this.state.resultsRestaurantCount > 0,
    });
  }

  private recordDiagnostic(
    kind: SearchRuntimeBusDiagnosticEntry['kind'],
    changedKeys: ReadonlySet<SearchRuntimeBusKey>,
    durationMs: number,
    notifiedListenerCount?: number,
    notifiedListenerLabels?: string[]
  ): void {
    if (durationMs < 0.25 && changedKeys.size <= 1) {
      return;
    }
    const changedKeysArray = Array.from(changedKeys);
    const shouldCaptureStack = changedKeys.has('results') || changedKeys.has('resultsRequestKey');
    if (shouldCaptureStack) {
      logPerfScenarioStackAttribution({
        owner: 'search_runtime_bus_writer',
        path: `${kind}:${changedKeysArray.join('|')}`,
        details: {
          durationMs: Math.round(durationMs * 10) / 10,
          listenerCount: this.listeners.size,
          notifiedListenerCount,
          notifiedListenerLabels:
            notifiedListenerLabels == null || notifiedListenerLabels.length === 0
              ? undefined
              : notifiedListenerLabels.slice(0, 16),
          activeOperationLane: this.state.activeOperationLane,
          searchSurfaceRedrawPhase: this.state.searchSurfaceRedrawPhase,
          resultsPresentationStage: null,
        },
      });
    }
    this.diagnosticsRing.push({
      kind,
      nowMs: resolveSearchRuntimeBusPerfNow(),
      durationMs: Math.round(durationMs * 10) / 10,
      changedKeys: changedKeysArray,
      listenerCount: this.listeners.size,
      notifiedListenerCount,
      notifiedListenerLabels:
        notifiedListenerLabels == null || notifiedListenerLabels.length === 0
          ? undefined
          : notifiedListenerLabels.slice(0, 16),
      batchDepth: this.batchDepth,
      version: this.version,
      activeOperationLane: this.state.activeOperationLane,
      searchSurfaceRedrawPhase: this.state.searchSurfaceRedrawPhase,
      resultsPresentationStage: null,
    });
    if (this.diagnosticsRing.length > 32) {
      this.diagnosticsRing.splice(0, this.diagnosticsRing.length - 32);
    }
  }
}

export const createSearchRuntimeBus = (): SearchRuntimeBus => new SearchRuntimeBus();

const resolveSearchRuntimeBusPerfNow = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

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
