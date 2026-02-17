import type { SearchResponse } from '../../../../types';

export type SearchRuntimeMode = 'natural' | 'shortcut' | null;
export type SearchRuntimeActiveTab = 'dishes' | 'restaurants';

export type SearchRuntimeBusState = {
  results: SearchResponse | null;
  resultsRequestKey: string | null;
  query: string;
  submittedQuery: string;
  activeTab: SearchRuntimeActiveTab;
  searchMode: SearchRuntimeMode;
  isSearchLoading: boolean;
  isLoadingMore: boolean;
  isSearchSessionActive: boolean;
  currentPage: number;
};

type SearchRuntimeBusListener = () => void;

const INITIAL_STATE: SearchRuntimeBusState = {
  results: null,
  resultsRequestKey: null,
  query: '',
  submittedQuery: '',
  activeTab: 'dishes',
  searchMode: null,
  isSearchLoading: false,
  isLoadingMore: false,
  isSearchSessionActive: false,
  currentPage: 1,
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
    (Object.keys(patch) as Array<keyof SearchRuntimeBusState>).forEach((key) => {
      const nextValue = patch[key];
      if (!Object.is(this.state[key], nextValue)) {
        nextState[key] = nextValue as SearchRuntimeBusState[typeof key];
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
