import {
  useSearchRootPrimitivesRuntime,
  type SearchRootPrimitivesRuntime,
} from './use-search-root-primitives-runtime';
import {
  useSearchRootRequestLaneRuntime,
  type SearchRootRequestLaneRuntime,
} from './use-search-root-request-lane-runtime';
import { useSearchRootScaffoldLaneRuntime } from './use-search-root-scaffold-lane-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import {
  useSearchRootSessionOverlayMapRuntime,
  type SearchRootSessionOverlayMapRuntime,
} from './use-search-root-session-overlay-map-runtime';
import {
  useSearchRootSessionSearchServicesRuntime,
  type SearchRootSessionSearchServicesRuntime,
} from './use-search-root-session-search-services-runtime';
import {
  useSearchRootSessionStateRuntime,
  type SearchRootSessionStateRuntime,
} from './use-search-root-session-state-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';
import {
  useSearchRootSuggestionRuntime,
  type SearchRootSuggestionRuntime,
} from './use-search-root-suggestion-runtime';
import type { UseSearchRootRuntimeArgs } from './use-search-root-runtime-contract';

export type UseSearchRootConstructionRuntimeArgs = Pick<
  UseSearchRootRuntimeArgs,
  | 'insets'
  | 'isSignedIn'
  | 'accessToken'
  | 'startupPollBounds'
  | 'startupCamera'
  | 'markMainMapReady'
>;

export type SearchRootConstructionRuntime = {
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  rootSessionRuntime: SearchRootSessionRuntime;
  rootSuggestionRuntime: SearchRootSuggestionRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
};

export const useSearchRootConstructionRuntime = ({
  insets,
  isSignedIn,
  accessToken,
  startupPollBounds,
  startupCamera,
  markMainMapReady,
}: UseSearchRootConstructionRuntimeArgs): SearchRootConstructionRuntime => {
  const rootPrimitivesRuntime = useSearchRootPrimitivesRuntime({
    startupCamera,
  });
  const sessionStateRuntime: SearchRootSessionStateRuntime = useSearchRootSessionStateRuntime({
    startupPollBounds,
    cameraRef: rootPrimitivesRuntime.mapState.cameraRef,
    markerEngineRef: rootPrimitivesRuntime.mapState.markerEngineRef,
    setMapCenter: rootPrimitivesRuntime.mapState.setMapCenter,
    setMapZoom: rootPrimitivesRuntime.mapState.setMapZoom,
    setMapCameraAnimation: rootPrimitivesRuntime.mapState.setMapCameraAnimation,
  });
  const sessionSearchServicesRuntime: SearchRootSessionSearchServicesRuntime =
    useSearchRootSessionSearchServicesRuntime({
      isSignedIn,
      ...sessionStateRuntime,
    });
  const sessionOverlayMapRuntime: SearchRootSessionOverlayMapRuntime =
    useSearchRootSessionOverlayMapRuntime({
      accessToken,
      startupCamera,
      mapRef: rootPrimitivesRuntime.mapState.mapRef,
      markMainMapReady,
      setMapCenter: rootPrimitivesRuntime.mapState.setMapCenter,
      setMapZoom: rootPrimitivesRuntime.mapState.setMapZoom,
      setIsFollowingUser: rootPrimitivesRuntime.mapState.setIsFollowingUser,
      ...sessionStateRuntime,
    });
  const {
    runtimeOwner,
    sharedSnapState,
    resultsArrivalState,
    runtimeFlags,
    primitives,
    hydrationRuntimeState,
  } = sessionStateRuntime;
  const { freezeGate, historyRuntime, filterStateRuntime, requestStatusRuntime } =
    sessionSearchServicesRuntime;
  const { overlayCommandRuntime, mapBootstrapRuntime } = sessionOverlayMapRuntime;
  const rootSessionRuntime: SearchRootSessionRuntime = {
    runtimeOwner,
    sharedSnapState,
    resultsArrivalState,
    runtimeFlags,
    primitives,
    freezeGate,
    hydrationRuntimeState,
    historyRuntime,
    overlayCommandRuntime,
    mapBootstrapRuntime,
    filterStateRuntime,
    requestStatusRuntime,
  };
  const rootSuggestionRuntime = useSearchRootSuggestionRuntime({
    searchInteractionRef: rootSessionRuntime.primitives.searchInteractionRef,
    query: rootPrimitivesRuntime.searchState.query,
    suggestions: rootPrimitivesRuntime.searchState.suggestions,
    recentSearches: rootSessionRuntime.historyRuntime.recentSearches,
    recentlyViewedRestaurants: rootSessionRuntime.historyRuntime.recentlyViewedRestaurants,
    recentlyViewedFoods: rootSessionRuntime.historyRuntime.recentlyViewedFoods,
    isRecentLoading: rootSessionRuntime.historyRuntime.isRecentLoading,
    isRecentlyViewedLoading: rootSessionRuntime.historyRuntime.isRecentlyViewedLoading,
    isRecentlyViewedFoodsLoading: rootSessionRuntime.historyRuntime.isRecentlyViewedFoodsLoading,
    isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    isAutocompleteSuppressed: rootPrimitivesRuntime.searchState.isAutocompleteSuppressed,
    isAutocompleteLoading: rootSessionRuntime.requestStatusRuntime.isAutocompleteLoading,
    setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
    setShowSuggestions: rootPrimitivesRuntime.searchState.setShowSuggestions,
    setBeginSuggestionCloseHold: rootPrimitivesRuntime.searchState.setBeginSuggestionCloseHold,
  });
  const rootScaffoldRuntime = useSearchRootScaffoldLaneRuntime({
    insets,
    startupPollBounds,
    mapRef: rootPrimitivesRuntime.mapState.mapRef,
    searchLayoutTop: rootSuggestionRuntime.searchLayout.top,
    searchBarFrame: rootSuggestionRuntime.searchBarFrame,
    isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    isAutocompleteSuppressed: rootPrimitivesRuntime.searchState.isAutocompleteSuppressed,
    rootSessionRuntime,
  });
  const requestLaneRuntime = useSearchRootRequestLaneRuntime({
    rootSessionRuntime,
    rootPrimitivesRuntime,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
  });

  return {
    rootPrimitivesRuntime,
    rootSessionRuntime,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
  };
};
