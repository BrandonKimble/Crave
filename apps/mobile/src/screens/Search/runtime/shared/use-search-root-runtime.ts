import React from 'react';
import MapboxGL from '@rnmapbox/maps';

import { useSearchRootActionLanesRuntime } from './use-search-root-action-lanes-runtime';
import { useSearchRootConstructionRuntime } from './use-search-root-construction-runtime';
import { useSearchRootMapRuntime } from './use-search-root-map-runtime';
import { useSearchRootPresentationRuntime } from './use-search-root-presentation-owner-runtime';
import {
  type SearchRootRuntime,
  type UseSearchRootRuntimeArgs,
} from './use-search-root-runtime-contract';

MapboxGL.setTelemetryEnabled(false);

export type { SearchRootRuntime } from './use-search-root-runtime-contract';

export const useSearchRootRuntime = ({
  insets,
  isSignedIn,
  accessToken,
  startupPollBounds,
  startupCamera,
  startupLocationSnapshot,
  startupPollsSnapshot,
  markMainMapReady,
  userLocation,
  userLocationRef,
  ensureUserLocation: _ensureUserLocation,
  activeMainIntent,
  consumeActiveMainIntent,
  navigation,
  routeSearchIntent,
}: UseSearchRootRuntimeArgs): SearchRootRuntime => {
  const constructionRuntime = useSearchRootConstructionRuntime({
    insets,
    isSignedIn,
    accessToken,
    startupPollBounds,
    startupCamera,
    markMainMapReady,
  });
  const {
    rootPrimitivesRuntime,
    rootSessionRuntime,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
  } = constructionRuntime;
  const {
    searchState: { setShouldDisableSearchShortcuts },
  } = rootPrimitivesRuntime;

  React.useEffect(() => {
    setShouldDisableSearchShortcuts(false);
  }, [setShouldDisableSearchShortcuts]);
  const {
    sessionActionRuntime,
    resultsSheetInteractionModel,
    presentationState,
    pendingMarkerOpenAnimationFrameRef,
    restaurantSelectionModel,
  } = useSearchRootActionLanesRuntime({
    insets,
    isSignedIn,
    userLocation,
    userLocationRef,
    navigation,
    routeSearchIntent,
    activeMainIntent,
    consumeActiveMainIntent,
    rootSessionRuntime,
    rootPrimitivesRuntime,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
  });

  const rootMapRuntime = useSearchRootMapRuntime({
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
  });
  const presentationRuntime = useSearchRootPresentationRuntime({
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
    mapRenderStatePublicationArgsRuntime: rootMapRuntime.mapRenderStatePublicationArgsRuntime,
    mapRenderHandlersPublicationArgsRuntime: rootMapRuntime.mapRenderHandlersPublicationArgsRuntime,
  });

  return {
    ...presentationRuntime,
    searchRuntimeBus: rootSessionRuntime.runtimeOwner.searchRuntimeBus,
    markerEngineRef: rootPrimitivesRuntime.mapState.markerEngineRef,
    isInitialCameraReady: rootSessionRuntime.mapBootstrapRuntime.isInitialCameraReady,
  };
};
