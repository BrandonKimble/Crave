import type { SearchRootMapArgs } from './search-root-render-runtime-contract';
import type { SearchRootProfileActionRuntime } from './use-search-root-profile-action-runtime-contract';
import type {
  SearchRootMapRenderHandlersPublicationArgsRuntime,
  SearchRootMapRenderStatePublicationArgsRuntime,
} from './search-root-map-render-publication-runtime-contract';
import { useSearchRootMapRenderHandlersPublicationArgsRuntime } from './use-search-root-map-render-handlers-publication-args-runtime';
import { useSearchRootMapRenderStatePublicationArgsRuntime } from './use-search-root-map-render-state-publication-args-runtime';
import type { SearchRootActionLanes } from './search-root-action-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootRequestLaneRuntime } from './use-search-root-request-lane-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import type { SearchRootMapDisplayOwnerRuntime } from './use-search-root-map-display-owner-runtime';

type UseSearchRootMapRenderPublicationOwnerRuntimeArgs = {
  accessToken: SearchRootMapArgs['accessToken'];
  startupLocationSnapshot: SearchRootMapArgs['userLocationSnapshot'];
  userLocation: SearchRootMapArgs['userLocation'];
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
  pendingMarkerOpenAnimationFrameRef: SearchRootMapArgs['pendingMarkerOpenAnimationFrameRef'];
  restaurantSelectionModel: SearchRootProfileActionRuntime['restaurantSelectionModel'];
} & Pick<SearchRootActionLanes, 'sessionActionRuntime'> &
  SearchRootMapDisplayOwnerRuntime;

export type SearchRootMapRenderPublicationOwnerRuntime = {
  mapRenderStatePublicationArgsRuntime: SearchRootMapRenderStatePublicationArgsRuntime;
  mapRenderHandlersPublicationArgsRuntime: SearchRootMapRenderHandlersPublicationArgsRuntime;
};

export const useSearchRootMapRenderPublicationOwnerRuntime = ({
  accessToken,
  startupLocationSnapshot,
  userLocation,
  rootSessionRuntime,
  rootPrimitivesRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
  sessionActionRuntime,
  pendingMarkerOpenAnimationFrameRef,
  restaurantSelectionModel,
  mapRuntime,
}: UseSearchRootMapRenderPublicationOwnerRuntimeArgs): SearchRootMapRenderPublicationOwnerRuntime => {
  const mapRenderStatePublicationArgsRuntime = useSearchRootMapRenderStatePublicationArgsRuntime({
    accessToken,
    startupLocationSnapshot,
    userLocation,
    rootSessionRuntime,
    rootPrimitivesRuntime,
    sessionActionRuntime,
    restaurantSelectionModel,
  });
  const mapRenderHandlersPublicationArgsRuntime =
    useSearchRootMapRenderHandlersPublicationArgsRuntime({
      rootSessionRuntime,
      rootScaffoldRuntime,
      requestLaneRuntime,
      mapRuntime,
      pendingMarkerOpenAnimationFrameRef,
    });

  return {
    mapRenderStatePublicationArgsRuntime,
    mapRenderHandlersPublicationArgsRuntime,
  };
};
