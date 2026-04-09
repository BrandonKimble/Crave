import type { SearchRootActionLanes } from './search-root-action-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootRequestLaneRuntime } from './use-search-root-request-lane-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootSuggestionRuntime } from './use-search-root-suggestion-runtime';

export type UseSearchRootVisualPublicationArgsRuntimeArgs = {
  insets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSuggestionRuntime: SearchRootSuggestionRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
} & SearchRootActionLanes;

export type SearchRootVisualRuntimeArgsRuntime = Pick<
  {
    visualRuntimeArgs: Parameters<
      typeof import('./use-search-root-visual-runtime').useSearchRootVisualRuntime
    >[0];
  },
  'visualRuntimeArgs'
>;

export type SearchRootResultsSheetVisualArgsRuntime = Pick<
  {
    resultsSheetVisualArgs: Omit<
      Parameters<
        typeof import('./use-search-results-sheet-visual-runtime').useSearchResultsSheetVisualRuntime
      >[0],
      | 'overlayHeaderActionProgress'
      | 'navBarHeight'
      | 'navBarTopForSnaps'
      | 'closeVisualHandoffProgress'
      | 'navBarCutoutProgress'
      | 'bottomNavHiddenTranslateY'
      | 'navBarCutoutIsHiding'
    >;
  },
  'resultsSheetVisualArgs'
>;

export type SearchRootResultsPanelVisualArgsRuntime = Pick<
  {
    resultsPanelVisualArgs: Omit<
      Parameters<
        typeof import('./use-search-results-panel-visual-runtime-model').useSearchResultsPanelVisualRuntimeModel
      >[0],
      'resultsWashAnimatedStyle' | 'resultsSheetVisibilityAnimatedStyle'
    >;
  },
  'resultsPanelVisualArgs'
>;
