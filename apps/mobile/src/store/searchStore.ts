import { create } from 'zustand';

interface SearchState {
  query: string;
  results: any[]; // Type this properly based on your API response
  isLoading: boolean;
  setQuery: (query: string) => void;
  setResults: (results: any[]) => void;
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
