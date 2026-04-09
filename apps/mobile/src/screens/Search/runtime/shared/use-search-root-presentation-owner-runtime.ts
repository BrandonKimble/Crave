import type { SearchRootActionLanes } from './search-root-action-runtime-contract';
import type { SearchRootPresentationRuntime } from './use-search-root-runtime-contract';
import { useSearchRootPresentationRenderRuntime } from './use-search-root-presentation-render-runtime';
import { useSearchRootPresentationRoutePublicationRuntime } from './use-search-root-presentation-route-publication-runtime';
import { useSearchRootPresentationVisualRuntime } from './use-search-root-presentation-visual-runtime';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootRequestLaneRuntime } from './use-search-root-request-lane-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootSuggestionRuntime } from './use-search-root-suggestion-runtime';
import type {
  SearchRootMapRenderHandlersPublicationArgsRuntime,
  SearchRootMapRenderStatePublicationArgsRuntime,
} from './search-root-map-render-publication-runtime-contract';

type UseSearchRootPresentationRuntimeArgs = {
  insets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  startupPollsSnapshot: Parameters<
    typeof import('./use-search-route-panel-publication-runtime').useSearchRoutePanelPublicationRuntime
  >[0]['startupPollsSnapshot'];
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSuggestionRuntime: SearchRootSuggestionRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
  mapRenderStatePublicationArgsRuntime: SearchRootMapRenderStatePublicationArgsRuntime;
  mapRenderHandlersPublicationArgsRuntime: SearchRootMapRenderHandlersPublicationArgsRuntime;
} & SearchRootActionLanes;

export const useSearchRootPresentationRuntime = ({
  insets,
  startupPollsSnapshot,
  rootSessionRuntime,
  rootPrimitivesRuntime,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
  sessionActionRuntime,
  resultsSheetInteractionModel,
  presentationState,
  mapRenderStatePublicationArgsRuntime,
  mapRenderHandlersPublicationArgsRuntime,
}: UseSearchRootPresentationRuntimeArgs): SearchRootPresentationRuntime => {
  const presentationVisualRuntime = useSearchRootPresentationVisualRuntime({
    insets,
    rootSessionRuntime,
    rootPrimitivesRuntime,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
    sessionActionRuntime,
    resultsSheetInteractionModel,
    presentationState,
  });

  useSearchRootPresentationRoutePublicationRuntime({
    startupPollsSnapshot,
    rootSessionRuntime,
    rootPrimitivesRuntime,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
    sessionActionRuntime,
    resultsSheetInteractionModel,
    presentationState,
    presentationVisualRuntime,
  });

  return useSearchRootPresentationRenderRuntime({
    insets,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
    sessionActionRuntime,
    resultsSheetInteractionModel,
    presentationState,
    presentationVisualRuntime,
    mapRenderStatePublicationArgsRuntime,
    mapRenderHandlersPublicationArgsRuntime,
  });
};
