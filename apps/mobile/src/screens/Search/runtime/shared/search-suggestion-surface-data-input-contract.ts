import type { SearchForegroundSuggestionDataInputs } from './search-foreground-chrome-contract';

export type SearchSuggestionSurfaceDataInputs = SearchForegroundSuggestionDataInputs | null;

export const EMPTY_SEARCH_SUGGESTION_SURFACE_DATA_INPUTS: SearchSuggestionSurfaceDataInputs = null;
