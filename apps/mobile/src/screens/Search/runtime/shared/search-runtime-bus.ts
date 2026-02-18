import type { SearchResponse } from '../../../../types';

export type SearchRuntimeActiveTab = 'dishes' | 'restaurants';

export type SearchRuntimeBusState = {
  results: SearchResponse | null;
  canLoadMore: boolean;
  activeOverlay: string;
  rankButtonLabelText: string;
  rankButtonIsActive: boolean;
  priceButtonLabelText: string;
  priceButtonIsActive: boolean;
  openNow: boolean;
  votesFilterActive: boolean;
  isRankSelectorVisible: boolean;
  isPriceSelectorVisible: boolean;
  didSearchSessionJustActivate: boolean;
  isInitialResultsLoadPending: boolean;
  isFilterTogglePending: boolean;
  shouldRetrySearchOnReconnect: boolean;
  hasSystemStatusBanner: boolean;
  isResultsFinalizeLaneActive: boolean;
  shouldHydrateResultsForRender: boolean;
  isVisualSyncPending: boolean;
  runOneCommitSpanPressureActive: boolean;
  hydrationOperationId: string | null;
  allowHydrationFinalizeCommit: boolean;
  submittedQuery: string;
  activeTab: SearchRuntimeActiveTab;
  isSearchLoading: boolean;
  isLoadingMore: boolean;
};

type SearchRuntimeBusListener = () => void;

const INITIAL_STATE: SearchRuntimeBusState = {
  results: null,
  canLoadMore: false,
  activeOverlay: 'search',
  rankButtonLabelText: '',
  rankButtonIsActive: false,
  priceButtonLabelText: '',
  priceButtonIsActive: false,
  openNow: false,
  votesFilterActive: false,
  isRankSelectorVisible: false,
  isPriceSelectorVisible: false,
  didSearchSessionJustActivate: false,
  isInitialResultsLoadPending: false,
  isFilterTogglePending: false,
  shouldRetrySearchOnReconnect: false,
  hasSystemStatusBanner: false,
  isResultsFinalizeLaneActive: false,
  shouldHydrateResultsForRender: false,
  isVisualSyncPending: false,
  runOneCommitSpanPressureActive: false,
  hydrationOperationId: null,
  allowHydrationFinalizeCommit: true,
  submittedQuery: '',
  activeTab: 'dishes',
  isSearchLoading: false,
  isLoadingMore: false,
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
    const nextStateMutable = nextState as SearchRuntimeBusState & Record<string, unknown>;
    (Object.keys(patch) as Array<keyof SearchRuntimeBusState>).forEach((key) => {
      const nextValue = patch[key];
      if (!Object.is(this.state[key], nextValue)) {
        nextStateMutable[key] = nextValue as SearchRuntimeBusState[typeof key];
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
