import type { SearchForegroundSuggestionSelectionInputs } from './search-foreground-chrome-contract';

export type SearchSuggestionSurfaceSelectionInputs =
  SearchForegroundSuggestionSelectionInputs | null;

export const EMPTY_SEARCH_SUGGESTION_SURFACE_SELECTION_INPUTS: SearchSuggestionSurfaceSelectionInputs =
  null;
