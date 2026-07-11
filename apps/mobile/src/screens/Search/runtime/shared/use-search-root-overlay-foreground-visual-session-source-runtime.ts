import React from 'react';

import type { AppRouteSceneChromeMotionRuntime } from '../../../../navigation/runtime/app-route-scene-chrome-motion-runtime-contract';
import type {
  SearchOverlayStoreRuntime,
  SearchRootOverlaySessionSurfaceRuntime,
  SearchRootResultsSheetRuntimeLane,
} from './search-root-scaffold-runtime-contract';
import type { SearchRootSuggestionRuntime } from './search-root-core-runtime-contract';
import type { SearchRootDataPlaneRuntime } from './use-search-root-session-runtime-contract';

export const useSearchRootOverlayForegroundVisualSessionSourceRuntime = ({
  insetsTop,
  rootOverlayStoreRuntime,
  rootOverlaySessionSurfaceRuntime,
  resultsSheetRuntimeLane,
  suggestionRuntime,
  dataPlaneRuntime,
  isSuggestionPanelActive,
  shouldDisableSearchShortcuts,
  appRouteSceneChromeMotionRuntime,
}: {
  insetsTop: number;
  rootOverlayStoreRuntime: Pick<SearchOverlayStoreRuntime, 'isSearchOverlay'>;
  rootOverlaySessionSurfaceRuntime: Pick<
    SearchRootOverlaySessionSurfaceRuntime,
    | 'navBarTopForSnaps'
    | 'navBarCutoutHeight'
    | 'bottomNavHiddenTranslateY'
    | 'shouldRenderSearchOverlay'
  >;
  resultsSheetRuntimeLane: SearchRootResultsSheetRuntimeLane;
  suggestionRuntime: SearchRootSuggestionRuntime;
  dataPlaneRuntime: SearchRootDataPlaneRuntime;
  isSuggestionPanelActive: boolean;
  shouldDisableSearchShortcuts: boolean;
  appRouteSceneChromeMotionRuntime: Pick<
    AppRouteSceneChromeMotionRuntime,
    | 'overlayChromeTransitionProgress'
    | 'searchChromeOpacity'
    | 'searchChromeContentOpacity'
    | 'searchChromeScale'
    | 'searchChromeTranslateY'
  >;
}) =>
  React.useMemo(
    () => ({
      isSuggestionOverlayVisible: suggestionRuntime.isSuggestionOverlayVisible,
      suggestionProgress: suggestionRuntime.suggestionProgress,
      isSearchOverlay: rootOverlayStoreRuntime.isSearchOverlay,
      navBarTopForSnaps: rootOverlaySessionSurfaceRuntime.navBarTopForSnaps,
      fallbackNavBarHeight: rootOverlaySessionSurfaceRuntime.navBarCutoutHeight,
      bottomNavHiddenTranslateY: rootOverlaySessionSurfaceRuntime.bottomNavHiddenTranslateY,
      shouldDisableSearchShortcuts,
      shouldRenderSearchOverlay: rootOverlaySessionSurfaceRuntime.shouldRenderSearchOverlay,
      isSuggestionPanelActive,
      searchChromeOpacity: appRouteSceneChromeMotionRuntime.searchChromeOpacity,
      searchChromeContentOpacity: appRouteSceneChromeMotionRuntime.searchChromeContentOpacity,
      searchChromeScale: appRouteSceneChromeMotionRuntime.searchChromeScale,
      searchChromeTranslateY: appRouteSceneChromeMotionRuntime.searchChromeTranslateY,
      isSearchSessionActive: dataPlaneRuntime.runtimeFlags.isSearchSessionActive,
      mapMovedSinceSearch: resultsSheetRuntimeLane.mapMovedSinceSearch,
      isSearchLoading: dataPlaneRuntime.runtimeFlags.isSearchLoading,
      isLoadingMore: dataPlaneRuntime.resultsArrivalState.isLoadingMore,
      hasResults: dataPlaneRuntime.resultsArrivalState.hasResults,
      searchLayoutTop: suggestionRuntime.searchLayout.top,
      searchLayoutHeight: suggestionRuntime.searchLayout.height,
      insetsTop,
      searchChromeTransitionProgress:
        appRouteSceneChromeMotionRuntime.overlayChromeTransitionProgress,
    }),
    [
      dataPlaneRuntime.resultsArrivalState.hasResults,
      dataPlaneRuntime.resultsArrivalState.isLoadingMore,
      dataPlaneRuntime.runtimeFlags.isSearchLoading,
      dataPlaneRuntime.runtimeFlags.isSearchSessionActive,
      insetsTop,
      isSuggestionPanelActive,
      appRouteSceneChromeMotionRuntime.overlayChromeTransitionProgress,
      appRouteSceneChromeMotionRuntime.searchChromeOpacity,
      appRouteSceneChromeMotionRuntime.searchChromeContentOpacity,
      appRouteSceneChromeMotionRuntime.searchChromeScale,
      appRouteSceneChromeMotionRuntime.searchChromeTranslateY,
      resultsSheetRuntimeLane.mapMovedSinceSearch,
      rootOverlaySessionSurfaceRuntime.bottomNavHiddenTranslateY,
      rootOverlaySessionSurfaceRuntime.navBarCutoutHeight,
      rootOverlaySessionSurfaceRuntime.navBarTopForSnaps,
      rootOverlaySessionSurfaceRuntime.shouldRenderSearchOverlay,
      rootOverlayStoreRuntime.isSearchOverlay,
      shouldDisableSearchShortcuts,
      suggestionRuntime.isSuggestionOverlayVisible,
      suggestionRuntime.searchLayout.height,
      suggestionRuntime.searchLayout.top,
      suggestionRuntime.suggestionProgress,
    ]
  );
