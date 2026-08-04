import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils';

// v9 (F1550): this store is EXACTLY what it says in the R1c contract below and nothing else —
// a persistence mirror of the runtime's filter/tab state. What was deleted, each proven by a
// repo-wide grep returning only its own definition:
//   • the imperative surface — setQuery, clearQuery, setPage, resetPage, recordSearch,
//     removeHistoryEntry, clearHistory, setBounds: ZERO external callers. `applySearchRuntime-
//     StateMirror` is the only verb anyone calls.
//   • the fields query / page / history, and the bounds triple (bounds / boundsLabel /
//     boundsPresetId). `resetBoundsFilter` was the one surviving imperative verb and it reset
//     three fields NOBODY READS — a write-only write, so the reset went with the fields.
//   • the persisted payload for all of the above: `partialize` serialized query, page and
//     history to AsyncStorage on every mirrored change, forever, for no reader.
//   • `SearchHistoryEntry` / `HISTORY_LIMIT`, a second recent-search concept whose real,
//     server-backed home is `store/searchHistoryStore.ts` two files away.
// UNCHANGED on purpose: the tab fields (activeTab / preferredActiveTab /
// hasActiveTabPreference) are mirrored into the store but are NOT persisted, and `migrate`
// resets them — so the tab preference does not survive a cold start today. Whether it SHOULD
// is an owner question, and a silent change here would answer it without asking.
const SEARCH_STORE_VERSION = 9;
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

type SearchState = SearchRuntimeMirroredState & {
  applySearchRuntimeStateMirror: (patch: Partial<SearchRuntimeMirroredState>) => void;
};

const defaultState = {
  activeTab: 'dishes',
  preferredActiveTab: 'dishes',
  hasActiveTabPreference: false,
  openNow: false,
  priceLevels: [],
  risingActive: false,
} as const satisfies SearchRuntimeMirroredState;

// The persisted subset — the three FILTER fields, and only those. Derived from one list so
// `partialize` and the migration's key-strip can never drift apart.
const PERSISTED_KEYS = ['openNow', 'priceLevels', 'risingActive'] as const;
type PersistedKey = (typeof PERSISTED_KEYS)[number];

export const normalizeActiveTab = (tab: unknown): SearchActiveTab => {
  if (tab === 'restaurants' || tab === 'dishes') {
    return tab;
  }
  return defaultState.activeTab;
};

export const useSearchStore = create<SearchState>()(
  persist(
    (set) => ({
      ...defaultState,
      priceLevels: [...defaultState.priceLevels],
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
    }),
    {
      name: 'search-store',
      version: SEARCH_STORE_VERSION,
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return persistedState as SearchState;
        }

        // v8 stripped the removed '100+ votes' key; v9 keeps ONLY the three persisted filter
        // fields, dropping the query / page / history / bounds payload that no reader ever
        // read. Anything not in PERSISTED_KEYS is discarded rather than carried forward.
        const state = persistedState as Record<string, unknown>;
        const carried: Partial<Record<PersistedKey, unknown>> = {};
        PERSISTED_KEYS.forEach((key) => {
          if (state[key] !== undefined) {
            carried[key] = state[key];
          }
        });
        return {
          ...defaultState,
          ...carried,
          priceLevels: normalizePriceLevels(carried.priceLevels),
        } as SearchState;
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
        openNow: state.openNow,
        priceLevels: state.priceLevels,
        risingActive: state.risingActive,
      }),
    }
  )
);
