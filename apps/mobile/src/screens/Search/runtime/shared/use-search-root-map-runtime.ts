import type { SearchRootMapArgs } from './search-root-render-runtime-contract';
import type {
  SearchRootMapDisplayRuntime,
  UseSearchRootMapDisplayRuntimeArgs,
} from './use-search-root-map-display-runtime-contract';
import type { SearchRootProfileActionRuntime } from './use-search-root-profile-action-runtime-contract';
import type {
  SearchRootMapRenderHandlersPublicationArgsRuntime,
  SearchRootMapRenderStatePublicationArgsRuntime,
} from './search-root-map-render-publication-runtime-contract';
import {
  useSearchRootMapDisplayOwnerRuntime,
  type SearchRootMapDisplayOwnerRuntime,
} from './use-search-root-map-display-owner-runtime';
import {
  useSearchRootMapRenderPublicationOwnerRuntime,
  type SearchRootMapRenderPublicationOwnerRuntime,
} from './use-search-root-map-render-publication-owner-runtime';

type UseSearchRootMapRuntimeArgs = UseSearchRootMapDisplayRuntimeArgs & {
  accessToken: SearchRootMapArgs['accessToken'];
  startupLocationSnapshot: SearchRootMapArgs['userLocationSnapshot'];
  userLocation: SearchRootMapArgs['userLocation'];
  restaurantSelectionModel: SearchRootProfileActionRuntime['restaurantSelectionModel'];
};

export type SearchRootMapRuntime = {
  mapRuntime: SearchRootMapDisplayRuntime;
  mapRenderStatePublicationArgsRuntime: SearchRootMapRenderStatePublicationArgsRuntime;
  mapRenderHandlersPublicationArgsRuntime: SearchRootMapRenderHandlersPublicationArgsRuntime;
};

export const useSearchRootMapRuntime = ({
  accessToken,
  startupLocationSnapshot,
  userLocation,
  rootSessionRuntime,
  rootPrimitivesRuntime,
  rootSuggestionRuntime,
  rootScaffoldRuntime,
  requestLaneRuntime,
  sessionActionRuntime,
  resultsSheetInteractionModel,
  presentationState,
  pendingMarkerOpenAnimationFrameRef,
  restaurantSelectionModel,
}: UseSearchRootMapRuntimeArgs): SearchRootMapRuntime => {
  const mapDisplayOwnerRuntime: SearchRootMapDisplayOwnerRuntime =
    useSearchRootMapDisplayOwnerRuntime({
      rootSessionRuntime,
      rootPrimitivesRuntime,
      rootSuggestionRuntime,
      rootScaffoldRuntime,
      requestLaneRuntime,
      sessionActionRuntime,
      resultsSheetInteractionModel,
      presentationState,
      pendingMarkerOpenAnimationFrameRef,
    });
  const { mapRuntime } = mapDisplayOwnerRuntime;
  const mapRenderPublicationOwnerRuntime: SearchRootMapRenderPublicationOwnerRuntime =
    useSearchRootMapRenderPublicationOwnerRuntime({
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
      ...mapDisplayOwnerRuntime,
    });
  const { mapRenderStatePublicationArgsRuntime, mapRenderHandlersPublicationArgsRuntime } =
    mapRenderPublicationOwnerRuntime;

  return {
    mapRuntime,
    mapRenderStatePublicationArgsRuntime,
    mapRenderHandlersPublicationArgsRuntime,
  };
};
