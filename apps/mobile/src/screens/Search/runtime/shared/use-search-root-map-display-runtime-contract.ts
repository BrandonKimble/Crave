import type { SearchMapRuntime } from './use-search-map-runtime';
import type { SearchRootActionLanes } from './search-root-action-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootRequestLaneRuntime } from './use-search-root-request-lane-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootSuggestionRuntime } from './use-search-root-suggestion-runtime';

export type UseSearchRootMapDisplayRuntimeArgs = {
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSuggestionRuntime: SearchRootSuggestionRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
  pendingMarkerOpenAnimationFrameRef: SearchRootScaffoldRuntime['resultsSheetRuntimeOwner']['shouldRenderResultsSheetRef'] extends never
    ? never
    : Parameters<
        typeof import('./use-search-map-runtime').useSearchMapRuntime
      >[0]['interactionArgs']['pendingMarkerOpenAnimationFrameRef'];
} & SearchRootActionLanes;

export type SearchRootMapInteractionArgsRuntime = {
  interactionArgs: Parameters<
    typeof import('./use-search-map-runtime').useSearchMapRuntime
  >[0]['interactionArgs'];
};

export type SearchRootMapStableHandlersArgsRuntime = {
  stableHandlersArgs: Parameters<
    typeof import('./use-search-map-runtime').useSearchMapRuntime
  >[0]['stableHandlersArgs'];
};

export type SearchRootMapDisplayRuntime = SearchMapRuntime;
