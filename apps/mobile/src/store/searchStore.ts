import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MapBounds } from '../types';
import { logger } from '../utils';

const HISTORY_LIMIT = 8;
const SEARCH_STORE_VERSION = 8;
export type SearchActiveTab = 'restaurants' | 'dishes';

export const normalizePriceLevels = (levels: unknown): number[] => {
  if (!Array.isArray(levels)) {
    return [];
  }

  const normalized = levels
    .map((level) => Math.round(Number(level)))
    .filter((level) => Number.isInteger(level) && level >= 1 && level <= 4);

  const uniqueSorted = Array.from(new Set(normalized)).sort((a, b) => a - b);
  if (uniqueSorted.length === 4 && uniqueSorted[0] === 1 && uniqueSorted[3] === 4) {
    return [];
  }
  return uniqueSorted;
};

interface SearchHistoryEntry {
  query: string;
  lastRunAt: number;
}

export interface SearchFilters {
  openNow: boolean;
  bounds: MapBounds | null;
  boundsLabel?: string | null;
  boundsPresetId?: string | null;
  priceLevels: number[];
  risingActive: boolean;
}

// R1c single-writer contract (plans/search-flow-plan.md §D6): the filter/tab fields below
// (openNow, priceLevels, risingActive, activeTab, preferredActiveTab,
// hasActiveTabPreference) are RUNTIME-OWNED by the SearchRuntimeBus. This store is a pure
// persistence mirror for them: the ONLY writer is applySearchRuntimeStateMirror, called by
// the single bus subscription in search-runtime-filter-state-store-bridge.ts. Do not add
// per-field setters back here — publish to the bus instead.
export type SearchRuntimeMirroredState = {
  openNow: boolean;
  priceLevels: number[];
  risingActive: boolean;
  activeTab: SearchActiveTab;
  preferredActiveTab: SearchActiveTab;
  hasActiveTabPreference: boolean;
};

interface SearchState extends SearchFilters {
  query: string;
  page: number;
  activeTab: SearchActiveTab;
  preferredActiveTab: SearchActiveTab;
  hasActiveTabPreference: boolean;
  history: SearchHistoryEntry[];
  setQuery: (query: string) => void;
  clearQuery: () => void;
  setPage: (page: number) => void;
  resetPage: () => void;
  resetBoundsFilter: () => void;
  setBounds: (
    bounds: MapBounds | null,
    options?: { label?: string | null; presetId?: string | null }
  ) => void;
  recordSearch: (query: string) => void;
  removeHistoryEntry: (query: string) => void;
  clearHistory: () => void;
  applySearchRuntimeStateMirror: (patch: Partial<SearchRuntimeMirroredState>) => void;
}

const defaultState = {
  query: '',
  page: 1,
  activeTab: 'dishes' as SearchActiveTab,
  preferredActiveTab: 'dishes' as SearchActiveTab,
  hasActiveTabPreference: false,
  openNow: false,
  bounds: null,
  boundsLabel: null,
  boundsPresetId: null,
  priceLevels: [],
  risingActive: false,
  history: [] as SearchHistoryEntry[],
} as const satisfies Pick<
  SearchState,
  | 'query'
  | 'page'
  | 'activeTab'
  | 'preferredActiveTab'
  | 'hasActiveTabPreference'
  | 'openNow'
  | 'bounds'
  | 'boundsLabel'
  | 'boundsPresetId'
  | 'priceLevels'
  | 'risingActive'
  | 'history'
>;

export const normalizeActiveTab = (tab: unknown): SearchActiveTab => {
  if (tab === 'restaurants' || tab === 'dishes') {
    return tab;
  }
  return defaultState.activeTab;
};

export const useSearchStore = create<SearchState>()(
  persist(
    (set, get) => ({
      ...defaultState,
      setQuery: (query) =>
        set(() => ({
          query,
        })),
      clearQuery: () =>
        set(() => ({
          query: '',
        })),
      setPage: (page) =>
        set(() => ({
          page: Math.max(1, page),
        })),
      resetPage: () =>
        set(() => ({
          page: 1,
        })),
      resetBoundsFilter: () =>
        set(() => ({
          bounds: defaultState.bounds,
          boundsLabel: defaultState.boundsLabel,
          boundsPresetId: defaultState.boundsPresetId,
        })),
      setBounds: (bounds, options) =>
        set(() => ({
          bounds,
          boundsLabel: options?.label ?? null,
          boundsPresetId: options?.presetId ?? null,
        })),
      applySearchRuntimeStateMirror: (patch) =>
        set(() => {
          const next: Partial<SearchRuntimeMirroredState> = { ...patch };
          if (patch.priceLevels != null) {
            next.priceLevels = normalizePriceLevels(patch.priceLevels);
          }
          if (patch.activeTab != null) {
            next.activeTab = normalizeActiveTab(patch.activeTab);
          }
          if (patch.preferredActiveTab != null) {
            next.preferredActiveTab = normalizeActiveTab(patch.preferredActiveTab);
          }
          return next;
        }),
      recordSearch: (query) => {
        const trimmed = query.trim();
        if (!trimmed) {
          return;
        }
        const { history } = get();
        const withoutExisting = history.filter(
          (entry) => entry.query.toLowerCase() !== trimmed.toLowerCase()
        );
        const next: SearchHistoryEntry[] = [
          {
            query: trimmed,
            lastRunAt: Date.now(),
          },
          ...withoutExisting,
        ].slice(0, HISTORY_LIMIT);
        set({
          history: next,
        });
      },
      removeHistoryEntry: (query) => {
        set((state) => ({
          history: state.history.filter(
            (entry) => entry.query.toLowerCase() !== query.toLowerCase()
          ),
        }));
      },
      clearHistory: () =>
        set(() => ({
          history: [],
        })),
    }),
    {
      name: 'search-store',
      version: SEARCH_STORE_VERSION,
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return persistedState as SearchState;
        }

        const state = persistedState as Partial<SearchState> & { votes100Plus?: boolean };
        // v8: the '100+ votes' filter was removed end-to-end; strip the stale persisted key.
        delete state.votes100Plus;
        return {
          ...state,
          activeTab: defaultState.activeTab,
          preferredActiveTab: defaultState.preferredActiveTab,
          hasActiveTabPreference: false,
          priceLevels: normalizePriceLevels(state.priceLevels),
        };
      },
      storage: createJSONStorage(() => {
        if (
          AsyncStorage &&
          typeof AsyncStorage.getItem === 'function' &&
          typeof AsyncStorage.setItem === 'function' &&
          typeof AsyncStorage.removeItem === 'function'
        ) {
          return {
            getItem: async (name) => {
              try {
                return (await AsyncStorage.getItem(name)) ?? null;
              } catch (error) {
                logger.warn('AsyncStorage getItem failed', error);
                return null;
              }
            },
            setItem: async (name, value) => {
              try {
                await AsyncStorage.setItem(name, value);
              } catch (error) {
                logger.warn('AsyncStorage setItem failed', error);
              }
            },
            removeItem: async (name) => {
              try {
                await AsyncStorage.removeItem(name);
              } catch (error) {
                logger.warn('AsyncStorage removeItem failed', error);
              }
            },
          };
        }

        logger.warn('AsyncStorage unavailable; using in-memory storage');
        const memoryStorage = new Map<string, string>();
        return {
          getItem: async (name) => memoryStorage.get(name) ?? null,
          setItem: async (name, value) => {
            memoryStorage.set(name, value);
          },
          removeItem: async (name) => {
            memoryStorage.delete(name);
          },
        };
      }),
      partialize: (state) => ({
        query: state.query,
        page: state.page,
        openNow: state.openNow,
        bounds: state.bounds,
        boundsLabel: state.boundsLabel,
        boundsPresetId: state.boundsPresetId,
        priceLevels: state.priceLevels,
        risingActive: state.risingActive,
        history: state.history,
      }),
    }
  )
);
