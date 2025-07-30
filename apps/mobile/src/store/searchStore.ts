import { create } from 'zustand';
import { Entity } from '@crave-search/shared';

interface SearchState {
  query: string;
  results: Entity[];
  isLoading: boolean;
  setQuery: (query: string) => void;
  setResults: (results: Entity[]) => void;
  setIsLoading: (isLoading: boolean) => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  results: [],
  isLoading: false,
  setQuery: (query) => set({ query }),
  setResults: (results) => set({ results }),
  setIsLoading: (isLoading) => set({ isLoading }),
}));
