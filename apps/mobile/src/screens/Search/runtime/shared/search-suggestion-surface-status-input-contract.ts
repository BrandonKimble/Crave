import type { SearchForegroundSuggestionStatusInputs } from './search-foreground-chrome-contract';

export type SearchSuggestionSurfaceStatusInputs =
  SearchForegroundSuggestionStatusInputs | null;

export const EMPTY_SEARCH_SUGGESTION_SURFACE_STATUS_INPUTS: SearchSuggestionSurfaceStatusInputs =
  null;
