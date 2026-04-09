import type { UseSearchRootVisualPublicationArgsRuntimeArgs } from './use-search-root-visual-publication-args-runtime-contract';

export type UseSearchRootChromeInputPublicationArgsRuntimeArgs = Pick<
  UseSearchRootVisualPublicationArgsRuntimeArgs,
  | 'rootPrimitivesRuntime'
  | 'rootSuggestionRuntime'
  | 'rootScaffoldRuntime'
  | 'requestLaneRuntime'
  | 'sessionActionRuntime'
>;

export type SearchRootSuggestionInputPublicationArgsRuntime = {
  suggestionInputsArgs: Omit<
    Parameters<
      typeof import('./use-search-foreground-suggestion-inputs').useSearchForegroundSuggestionInputs
    >[0],
    'searchSurfaceAnimatedStyle' | 'suggestionPanelAnimatedStyle' | 'navBarHeight'
  >;
};

export type SearchRootHeaderInputPublicationArgsRuntime = {
  headerInputsArgs: Omit<
    Parameters<
      typeof import('./use-search-foreground-header-inputs').useSearchForegroundHeaderInputs
    >[0],
    | 'searchBarInputAnimatedStyle'
    | 'searchBarContainerAnimatedStyle'
    | 'shouldMountSearchShortcuts'
    | 'shouldEnableSearchShortcutsInteraction'
    | 'searchShortcutsAnimatedStyle'
    | 'searchShortcutChipAnimatedStyle'
    | 'shouldShowSearchThisArea'
    | 'searchThisAreaTop'
    | 'searchThisAreaAnimatedStyle'
  >;
};

export type SearchRootFiltersWarmupPublicationArgsRuntime = {
  filtersWarmupInputsArgs: Parameters<
    typeof import('./use-search-foreground-filters-warmup-inputs').useSearchForegroundFiltersWarmupInputs
  >[0];
};
