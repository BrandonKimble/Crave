import type { SearchForegroundSuggestionMotionInputs } from './search-foreground-chrome-contract';

export type SearchSuggestionSurfaceMotionInputs =
  SearchForegroundSuggestionMotionInputs | null;

export const EMPTY_SEARCH_SUGGESTION_SURFACE_MOTION_INPUTS: SearchSuggestionSurfaceMotionInputs =
  null;
