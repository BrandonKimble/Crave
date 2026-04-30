import type { SearchForegroundSuggestionLayoutInputs } from './search-foreground-chrome-contract';

export type SearchSuggestionSurfaceLayoutInputs =
  SearchForegroundSuggestionLayoutInputs | null;

export const EMPTY_SEARCH_SUGGESTION_SURFACE_LAYOUT_INPUTS: SearchSuggestionSurfaceLayoutInputs =
  null;
