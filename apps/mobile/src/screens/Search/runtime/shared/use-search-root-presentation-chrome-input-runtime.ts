import { useSearchForegroundFiltersWarmupInputs } from './use-search-foreground-filters-warmup-inputs';
import { useSearchForegroundHeaderInputs } from './use-search-foreground-header-inputs';
import { useSearchForegroundSuggestionInputs } from './use-search-foreground-suggestion-inputs';
import { useSearchRootFiltersWarmupPublicationArgsRuntime } from './use-search-root-filters-warmup-publication-args-runtime';
import { useSearchRootHeaderInputPublicationArgsRuntime } from './use-search-root-header-input-publication-args-runtime';
import type { SearchRootActionLanes } from './search-root-action-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootRequestLaneRuntime } from './use-search-root-request-lane-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import { useSearchRootSuggestionInputPublicationArgsRuntime } from './use-search-root-suggestion-input-publication-args-runtime';
import type { SearchRootSuggestionRuntime } from './use-search-root-suggestion-runtime';
import type { SearchRootPresentationSurfaceVisualRuntime } from './use-search-root-presentation-surface-visual-runtime';
import type { SearchRootChromeArgs } from './search-root-render-runtime-contract';

type UseSearchRootPresentationChromeInputRuntimeArgs = {
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSuggestionRuntime: SearchRootSuggestionRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
  presentationSurfaceVisualRuntime: SearchRootPresentationSurfaceVisualRuntime;
} & Pick<SearchRootActionLanes, 'sessionActionRuntime'>;

export type SearchRootPresentationChromeInputRuntime = {
  suggestionInputs: ReturnType<typeof useSearchForegroundSuggestionInputs>;
  headerInputs: ReturnType<typeof useSearchForegroundHeaderInputs>;
  filtersWarmupInputs: SearchRootChromeArgs['filtersWarmupInputs'];
};

export const useSearchRootPresentationChromeInputRuntime = ({
  rootPrimitivesRuntime,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
  sessionActionRuntime,
  presentationSurfaceVisualRuntime,
}: UseSearchRootPresentationChromeInputRuntimeArgs): SearchRootPresentationChromeInputRuntime => {
  const suggestionInputPublicationArgsRuntime = useSearchRootSuggestionInputPublicationArgsRuntime({
    rootPrimitivesRuntime,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
    sessionActionRuntime,
  });
  const headerInputPublicationArgsRuntime = useSearchRootHeaderInputPublicationArgsRuntime({
    rootPrimitivesRuntime,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
    sessionActionRuntime,
  });
  const filtersWarmupPublicationArgsRuntime = useSearchRootFiltersWarmupPublicationArgsRuntime({
    rootPrimitivesRuntime,
    sessionActionRuntime,
  });
  const suggestionInputs = useSearchForegroundSuggestionInputs({
    ...suggestionInputPublicationArgsRuntime.suggestionInputsArgs,
    searchSurfaceAnimatedStyle:
      presentationSurfaceVisualRuntime.visualRuntime.searchSurfaceAnimatedStyle,
    suggestionPanelAnimatedStyle:
      presentationSurfaceVisualRuntime.visualRuntime.suggestionPanelAnimatedStyle,
    navBarHeight: presentationSurfaceVisualRuntime.visualRuntime.navBarHeight,
  });
  const headerInputs = useSearchForegroundHeaderInputs({
    ...headerInputPublicationArgsRuntime.headerInputsArgs,
    searchBarInputAnimatedStyle:
      presentationSurfaceVisualRuntime.visualRuntime.searchBarInputAnimatedStyle,
    searchBarContainerAnimatedStyle:
      presentationSurfaceVisualRuntime.visualRuntime.searchBarContainerAnimatedStyle,
    shouldMountSearchShortcuts:
      presentationSurfaceVisualRuntime.visualRuntime.shouldMountSearchShortcuts,
    shouldEnableSearchShortcutsInteraction:
      presentationSurfaceVisualRuntime.visualRuntime.shouldEnableSearchShortcutsInteraction,
    searchShortcutsAnimatedStyle:
      presentationSurfaceVisualRuntime.visualRuntime.searchShortcutsAnimatedStyle,
    searchShortcutChipAnimatedStyle:
      presentationSurfaceVisualRuntime.visualRuntime.searchShortcutChipAnimatedStyle,
    shouldShowSearchThisArea:
      presentationSurfaceVisualRuntime.visualRuntime.shouldShowSearchThisArea,
    searchThisAreaTop: presentationSurfaceVisualRuntime.visualRuntime.searchThisAreaTop,
    searchThisAreaAnimatedStyle:
      presentationSurfaceVisualRuntime.visualRuntime.searchThisAreaAnimatedStyle,
  });
  const filtersWarmupInputs = useSearchForegroundFiltersWarmupInputs(
    filtersWarmupPublicationArgsRuntime.filtersWarmupInputsArgs
  );

  return {
    suggestionInputs,
    headerInputs,
    filtersWarmupInputs,
  };
};
