import type { SearchRootActionLanes } from './search-root-action-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootRequestLaneRuntime } from './use-search-root-request-lane-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootSuggestionRuntime } from './use-search-root-suggestion-runtime';
import type { SearchRootPresentationVisualRuntime } from './use-search-root-presentation-visual-runtime';
import { useSearchRootRestaurantRoutePublicationOwnerRuntime } from './use-search-root-restaurant-route-publication-owner-runtime';
import { useSearchRootSearchRoutePublicationRuntime } from './use-search-root-search-route-publication-runtime';

type UseSearchRootPresentationRoutePublicationRuntimeArgs = {
  startupPollsSnapshot: Parameters<
    typeof import('./use-search-route-panel-publication-runtime').useSearchRoutePanelPublicationRuntime
  >[0]['startupPollsSnapshot'];
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSuggestionRuntime: SearchRootSuggestionRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
  presentationVisualRuntime: SearchRootPresentationVisualRuntime;
} & SearchRootActionLanes;

export const useSearchRootPresentationRoutePublicationRuntime = ({
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
}: UseSearchRootPresentationRoutePublicationRuntimeArgs): void => {
  useSearchRootSearchRoutePublicationRuntime({
    startupPollsSnapshot,
    rootSessionRuntime,
    rootPrimitivesRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
    sessionActionRuntime,
    resultsSheetInteractionModel,
    presentationVisualRuntime,
  });
  useSearchRootRestaurantRoutePublicationOwnerRuntime({
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    sessionActionRuntime,
    presentationState,
    presentationVisualRuntime,
  });
};
