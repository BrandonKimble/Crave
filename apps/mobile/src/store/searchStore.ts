import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MapBounds } from '../types';
import { logger } from '../utils';

const HISTORY_LIMIT = 8;

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
  votes100Plus: boolean;
}

interface SearchState extends SearchFilters {
  query: string;
  page: number;
  history: SearchHistoryEntry[];
  setQuery: (query: string) => void;
  clearQuery: () => void;
  setPage: (page: number) => void;
  resetPage: () => void;
  setOpenNow: (openNow: boolean) => void;
  setBounds: (
    bounds: MapBounds | null,
    options?: { label?: string | null; presetId?: string | null }
  ) => void;
  setPriceLevels: (levels: number[]) => void;
  recordSearch: (query: string) => void;
  removeHistoryEntry: (query: string) => void;
  clearHistory: () => void;
  setVotes100Plus: (enabled: boolean) => void;
}

const defaultState = {
  query: '',
  page: 1,
  openNow: false,
  bounds: null,
  boundsLabel: null,
  boundsPresetId: null,
  priceLevels: [],
  votes100Plus: false,
  history: [] as SearchHistoryEntry[],
} as const satisfies Pick<
  SearchState,
  | 'query'
  | 'page'
  | 'openNow'
  | 'bounds'
  | 'boundsLabel'
  | 'boundsPresetId'
  | 'priceLevels'
  | 'votes100Plus'
  | 'history'
>;

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
      setOpenNow: (openNow) =>
        set(() => ({
          openNow,
        })),
      setBounds: (bounds, options) =>
        set(() => ({
          bounds,
          boundsLabel: options?.label ?? null,
          boundsPresetId: options?.presetId ?? null,
        })),
      setPriceLevels: (levels) =>
        set(() => ({
          priceLevels: Array.isArray(levels)
            ? Array.from(
                new Set(
                  levels
                    .map((level) => Math.round(level))
                    .filter((level) => Number.isInteger(level) && level >= 0 && level <= 4)
                )
              ).sort((a, b) => a - b)
            : [],
        })),
      setVotes100Plus: (enabled) =>
        set(() => ({
          votes100Plus: Boolean(enabled),
        })),
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
        votes100Plus: state.votes100Plus,
        history: state.history,
      }),
    }
  )
);
