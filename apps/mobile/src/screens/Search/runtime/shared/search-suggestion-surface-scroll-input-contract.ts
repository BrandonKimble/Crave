import type { SearchForegroundSuggestionScrollInputs } from './search-foreground-chrome-contract';

export type SearchSuggestionSurfaceScrollInputs = SearchForegroundSuggestionScrollInputs | null;

export const EMPTY_SEARCH_SUGGESTION_SURFACE_SCROLL_INPUTS: SearchSuggestionSurfaceScrollInputs =
  null;
