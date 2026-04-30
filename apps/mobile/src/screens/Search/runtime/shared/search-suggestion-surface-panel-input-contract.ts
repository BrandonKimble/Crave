import type { SearchForegroundSuggestionPanelInputs } from './search-foreground-chrome-contract';

export type SearchSuggestionSurfacePanelInputs =
  SearchForegroundSuggestionPanelInputs | null;

export const EMPTY_SEARCH_SUGGESTION_SURFACE_PANEL_INPUTS: SearchSuggestionSurfacePanelInputs =
  null;
