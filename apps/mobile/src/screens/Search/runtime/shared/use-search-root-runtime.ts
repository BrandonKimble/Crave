import React from 'react';
import type { FlashListRef } from '@shopify/flash-list';
import MapboxGL from '@rnmapbox/maps';
import { PixelRatio, type TextInput, type LayoutChangeEvent } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import type { MapBounds } from '../../../../types';
import type { OverlaySheetSnap } from '../../../../overlays/types';
import { useOverlaySheetPositionStore } from '../../../../overlays/useOverlaySheetPositionStore';
import { useSearchStore } from '../../../../store/searchStore';
import { useOverlayStore, type OverlayKey } from '../../../../store/overlayStore';
import type { AutocompleteMatch } from '../../../../services/autocomplete';
import { logger } from '../../../../utils';
import {
  cloneSearchFiltersLayoutCache,
  type SearchFiltersLayoutCache,
} from '../../components/SearchFilters';
import type { SearchMapMarkerEngineHandle } from '../../components/SearchMapWithMarkerEngine';
import type { MapboxMapRef } from '../../components/search-map';
import { useMapInteractionController } from '../map/map-interaction-controller';
import { USA_FALLBACK_ZOOM } from '../../constants/search';
import type { ResultsListItem } from '../read-models/read-model-selectors';
import { boundsFromPairs, isLngLatTuple } from '../../utils/geo';
import type { SearchResponse } from '../../../../types';
import type {
  SearchBottomNavRuntime,
  SearchOverlayStoreRuntime,
} from './search-root-scaffold-runtime-contract';
import { useSearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import { useSearchRootRequestLaneRuntime } from './use-search-root-request-lane-runtime';
import { useSearchRootActionLanesRuntime } from './use-search-root-action-lanes-runtime';
import { useSearchRootVisualPublicationRuntime } from './use-search-root-visual-publication-runtime';
import { useSearchRootMapRenderSurfaceRuntime } from './use-search-root-map-render-surface-runtime';
import { useSearchRootOverlayRenderSurfaceRuntime } from './use-search-root-overlay-render-surface-runtime';
import { useSearchFreezeGateRuntime } from './use-search-freeze-gate-runtime';
import { useSearchHistoryRuntime } from './use-search-history-runtime';
import { useSearchRouteOverlayCommandRuntime } from '../../../../overlays/useSearchRouteOverlayCommandRuntime';
import { useSearchAppShellRuntimePublication } from '../../../../overlays/useSearchAppShellRuntimePublication';
import { useSearchRouteSessionController } from '../../../../overlays/useSearchRouteSessionController';
import { useSearchRequestStatusRuntime } from './use-search-request-status-runtime';
import { useSearchSessionShadowTransitionRuntime } from './use-search-session-shadow-transition-runtime';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';
import { useSearchFilterStateRuntime } from './use-search-filter-state-runtime';
import { useSearchRuntimeFlagsRuntime } from './use-search-runtime-flags-runtime';
import { useSearchRuntimeOwner } from '../../hooks/use-search-runtime-owner';
import { useSearchSuggestionLayoutRuntime } from './use-search-suggestion-layout-runtime';
import { useSearchSuggestionVisibilityRuntime } from './use-search-suggestion-visibility-runtime';
import {
  type SearchRootRuntime,
  type UseSearchRootRuntimeArgs,
} from './use-search-root-runtime-contract';
import type {
  SearchRootCameraViewportRuntime,
  SearchRootHydrationRuntimeState,
  SearchRootResultsArrivalState,
  SearchRootSharedSnapState,
} from './use-search-root-session-runtime-contract';
import { useSearchMapNativeCameraExecutor } from '../map/search-map-native-camera-executor';
import { useSearchRootProfileActionRuntime } from './use-search-root-profile-action-runtime';
import type { SearchRootPrimitivesRuntime } from './search-root-primitives-runtime-contract';
import {
  assertSearchStartupGeometryValue,
  buildSearchStartupGeometrySeed,
  getSearchStartupViewportMetrics,
  resolveSearchBottomInset,
} from './search-startup-geometry';

MapboxGL.setTelemetryEnabled(false);

const SHOULD_LOG_ROOT_OVERLAY_ATTRIBUTION = __DEV__;

const resolveResultsPage = (response: SearchResponse | null): number | null => {
  if (!response) {
    return null;
  }
  const page = response.metadata?.page;
  if (typeof page === 'number' && Number.isFinite(page) && page > 0) {
    return page;
  }
  return 1;
};

export type { SearchRootRuntime } from './use-search-root-runtime-contract';

export const useSearchRootRuntime = ({
  isSearchScreenFocused,
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
  activeMainIntent,
  consumeActiveMainIntent,
  navigation,
  routeSearchIntent,
}: UseSearchRootRuntimeArgs): SearchRootRuntime => {
  const cameraRef = React.useRef<MapboxGL.Camera>(null);
  const mapRef = React.useRef<MapboxMapRef | null>(null);
  const markerEngineRef = React.useRef<SearchMapMarkerEngineHandle>(null);
  const [mapCenter, setMapCenter] = React.useState<[number, number] | null>(
    () => startupCamera?.center ?? null
  );
  const [mapZoom, setMapZoom] = React.useState<number | null>(() => startupCamera?.zoom ?? null);
  const [mapCameraAnimation, setMapCameraAnimation] = React.useState<{
    mode: 'none' | 'easeTo';
    durationMs: number;
    completionId: string | null;
  }>(() => ({
    mode: 'none',
    durationMs: 0,
    completionId: null,
  }));
  const [isFollowingUser, setIsFollowingUser] = React.useState(false);
  const suppressMapMovedRef = React.useRef(false);
  const suppressMapMoved = React.useCallback(() => {
    suppressMapMovedRef.current = true;
  }, []);
  const rootMapState = React.useMemo(
    () => ({
      cameraRef,
      mapRef,
      markerEngineRef,
      mapCenter,
      setMapCenter,
      mapZoom,
      setMapZoom,
      mapCameraAnimation,
      setMapCameraAnimation,
      isFollowingUser,
      setIsFollowingUser,
      suppressMapMovedRef,
      suppressMapMoved,
    }),
    [
      isFollowingUser,
      mapCameraAnimation,
      mapCenter,
      mapZoom,
      setMapCameraAnimation,
      setMapCenter,
      setMapZoom,
      suppressMapMoved,
    ]
  );
  const pendingRestaurantSelectionRef = React.useRef<{
    restaurantId: string;
  } | null>(null);
  const [restaurantOnlyId, setRestaurantOnlyId] = React.useState<string | null>(null);
  const restaurantOnlySearchRef = React.useRef<string | null>(null);
  const setRestaurantOnlyIntent = React.useCallback((restaurantId: string | null) => {
    restaurantOnlySearchRef.current = restaurantId;
    if (!restaurantId) {
      setRestaurantOnlyId(null);
    }
  }, []);
  const resetFocusedMapState = React.useCallback(() => {
    pendingRestaurantSelectionRef.current = null;
  }, []);
  const searchSessionQueryRef = React.useRef('');
  const isClearingSearchRef = React.useRef(false);
  const beginSuggestionCloseHoldRef = React.useRef<() => boolean>(() => false);
  const setBeginSuggestionCloseHold = React.useCallback((handler: () => boolean) => {
    beginSuggestionCloseHoldRef.current = handler;
  }, []);
  const shouldDisableSearchShortcutsRef = React.useRef(false);
  const setShouldDisableSearchShortcuts = React.useCallback((disabled: boolean) => {
    shouldDisableSearchShortcutsRef.current = disabled;
  }, []);
  const [, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<AutocompleteMatch[]>([]);
  const [, setShowSuggestions] = React.useState(false);
  const [isAutocompleteSuppressed, setIsAutocompleteSuppressed] = React.useState(false);
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);
  const [isSuggestionPanelActive, setIsSuggestionPanelActive] = React.useState(false);
  const {
    activeTab,
    preferredActiveTab,
    setActiveTab,
    hasActiveTabPreference,
    setActiveTabPreference,
  } = useSearchStore(
    useShallow((state) => ({
      activeTab: state.activeTab,
      preferredActiveTab: state.preferredActiveTab,
      setActiveTab: state.setActiveTab,
      hasActiveTabPreference: state.hasActiveTabPreference,
      setActiveTabPreference: state.setActiveTabPreference,
    }))
  );
  const inputRef = React.useRef<TextInput | null>(null);
  const ignoreNextSearchBlurRef = React.useRef(false);
  const resultsScrollRef = React.useRef<FlashListRef<ResultsListItem> | null>(null);
  const searchFiltersLayoutCacheRef = React.useRef<SearchFiltersLayoutCache | null>(null);
  const [isSearchFiltersLayoutWarm, setIsSearchFiltersLayoutWarm] = React.useState(false);
  const handleSearchFiltersLayoutCache = React.useCallback((cache: SearchFiltersLayoutCache) => {
    searchFiltersLayoutCacheRef.current = cloneSearchFiltersLayoutCache(cache);
    setIsSearchFiltersLayoutWarm(true);
  }, []);
  const isSearchEditingRef = React.useRef(false);
  const allowSearchBlurExitRef = React.useRef(false);
  const rootSearchState = React.useMemo(
    () => ({
      pendingRestaurantSelectionRef,
      restaurantOnlyId,
      setRestaurantOnlyId,
      restaurantOnlySearchRef,
      setRestaurantOnlyIntent,
      resetFocusedMapState,
      searchSessionQueryRef,
      isClearingSearchRef,
      beginSuggestionCloseHoldRef,
      setBeginSuggestionCloseHold,
      shouldDisableSearchShortcutsRef,
      setShouldDisableSearchShortcuts,
      setError,
      query,
      setQuery,
      suggestions,
      setSuggestions,
      setShowSuggestions,
      isAutocompleteSuppressed,
      setIsAutocompleteSuppressed,
      isSearchFocused,
      setIsSearchFocused,
      isSuggestionPanelActive,
      setIsSuggestionPanelActive,
      activeTab,
      preferredActiveTab,
      setActiveTab,
      hasActiveTabPreference,
      setActiveTabPreference,
      inputRef,
      ignoreNextSearchBlurRef,
      resultsScrollRef,
      searchFiltersLayoutCacheRef,
      isSearchFiltersLayoutWarm,
      handleSearchFiltersLayoutCache,
      isSearchEditingRef,
      allowSearchBlurExitRef,
    }),
    [
      activeTab,
      handleSearchFiltersLayoutCache,
      hasActiveTabPreference,
      isAutocompleteSuppressed,
      isSearchFiltersLayoutWarm,
      isSearchFocused,
      isSuggestionPanelActive,
      preferredActiveTab,
      query,
      restaurantOnlyId,
      setActiveTab,
      setActiveTabPreference,
      setBeginSuggestionCloseHold,
      setError,
      setIsAutocompleteSuppressed,
      setIsSearchFocused,
      setIsSuggestionPanelActive,
      setQuery,
      setRestaurantOnlyId,
      setRestaurantOnlyIntent,
      setShouldDisableSearchShortcuts,
      suggestions,
    ]
  );
  const rootPrimitivesRuntime = React.useMemo<SearchRootPrimitivesRuntime>(
    () => ({
      mapState: rootMapState,
      searchState: rootSearchState,
    }),
    [rootMapState, rootSearchState]
  );
  const searchMapNativeCameraExecutor = useSearchMapNativeCameraExecutor();
  const runtimeOwner = useSearchRuntimeOwner({
    startupPollBounds,
    cameraRef: rootPrimitivesRuntime.mapState.cameraRef,
    searchMapNativeCameraExecutor,
    setMapCenter: rootPrimitivesRuntime.mapState.setMapCenter,
    setMapZoom: rootPrimitivesRuntime.mapState.setMapZoom,
    setMapCameraAnimation: rootPrimitivesRuntime.mapState.setMapCameraAnimation,
  });
  const sharedSnapState: SearchRootSharedSnapState = useOverlaySheetPositionStore(
    useShallow((state) => ({
      hasUserSharedSnap: state.hasUserSharedSnap,
      sharedSnap: state.sharedSnap,
    }))
  );
  const resultsArrivalState: SearchRootResultsArrivalState = useSearchRuntimeBusSelector(
    runtimeOwner.searchRuntimeBus,
    (state) => ({
      currentResults: state.results,
      hasResults: state.results != null,
      isLoadingMore: state.isLoadingMore,
      canLoadMore: state.canLoadMore,
      currentPage: state.currentPage,
      isPaginationExhausted: state.isPaginationExhausted,
      pendingTabSwitchTab: state.pendingTabSwitchTab,
      restaurantResults: (state.results?.restaurants ?? null) as
        | SearchResponse['restaurants']
        | null,
      resultsRequestKey: state.resultsRequestKey,
      submittedQuery: state.submittedQuery,
      resultsPage: resolveResultsPage(state.results),
    }),
    (a, b) =>
      a.currentResults === b.currentResults &&
      a.hasResults === b.hasResults &&
      a.isLoadingMore === b.isLoadingMore &&
      a.canLoadMore === b.canLoadMore &&
      a.currentPage === b.currentPage &&
      a.isPaginationExhausted === b.isPaginationExhausted &&
      a.pendingTabSwitchTab === b.pendingTabSwitchTab &&
      a.restaurantResults === b.restaurantResults &&
      a.resultsRequestKey === b.resultsRequestKey &&
      a.submittedQuery === b.submittedQuery &&
      a.resultsPage === b.resultsPage,
    [
      'results',
      'isLoadingMore',
      'canLoadMore',
      'currentPage',
      'isPaginationExhausted',
      'pendingTabSwitchTab',
      'resultsRequestKey',
      'submittedQuery',
    ] as const
  );
  const lastSearchBoundsCaptureSeqRef = React.useRef(0);
  const lastVisibleSheetStateRef = React.useRef<Exclude<OverlaySheetSnap, 'hidden'>>('middle');
  const lastCameraStateRef = React.useRef<{
    center: [number, number];
    zoom: number;
  } | null>(null);
  const lastPersistedCameraRef = React.useRef<string | null>(null);
  const commitCameraViewport = React.useCallback<
    SearchRootCameraViewportRuntime['commitCameraViewport']
  >(
    (payload, options) =>
      runtimeOwner.cameraIntentArbiter.commit({
        center: payload.center,
        zoom: payload.zoom,
        allowDuringGesture: options?.allowDuringGesture,
        animationMode: options?.animationMode,
        animationDurationMs: options?.animationDurationMs,
        requestToken: options?.requestToken,
      }),
    [runtimeOwner.cameraIntentArbiter]
  );
  const cameraViewportRuntime: SearchRootCameraViewportRuntime = React.useMemo(
    () => ({
      lastSearchBoundsCaptureSeqRef,
      lastVisibleSheetStateRef,
      lastCameraStateRef,
      lastPersistedCameraRef,
      commitCameraViewport,
    }),
    [commitCameraViewport]
  );
  const runtimeFlags = useSearchRuntimeFlagsRuntime({
    searchRuntimeBus: runtimeOwner.searchRuntimeBus,
    resultsRequestKey: resultsArrivalState.resultsRequestKey,
  });
  const searchInteractionRef = React.useRef({
    isInteracting: false,
    isResultsSheetDragging: false,
    isResultsListScrolling: false,
    isResultsSheetSettling: false,
  });
  const anySheetDraggingRef = React.useRef(false);
  const lastSearchRequestIdRef = React.useRef<string | null>(null);
  const lastAutoOpenKeyRef = React.useRef<string | null>(null);
  const runOneCommitSpanPressureByOperationRef = React.useRef<Map<string, number>>(new Map());
  const getPerfNow = React.useCallback(() => {
    if (typeof performance?.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }, []);
  const readRuntimeMemoryDiagnostics = React.useCallback(() => null, []);
  const handleShortcutSearchCoverageSnapshot = React.useCallback(
    (snapshot: {
      searchRequestId: string;
      bounds: MapBounds | null;
      entities: Record<string, unknown>;
    }) => {
      rootPrimitivesRuntime.mapState.markerEngineRef.current?.handleShortcutSearchCoverageSnapshot?.(
        snapshot
      );
    },
    [rootPrimitivesRuntime.mapState.markerEngineRef]
  );
  const resetShortcutCoverageState = React.useCallback(() => {
    rootPrimitivesRuntime.mapState.markerEngineRef.current?.resetShortcutCoverageState?.();
  }, [rootPrimitivesRuntime.mapState.markerEngineRef]);
  const runtimePrimitives = React.useMemo(
    () => ({
      searchInteractionRef,
      anySheetDraggingRef,
      lastSearchRequestIdRef,
      runOneCommitSpanPressureByOperationRef,
      getPerfNow,
      readRuntimeMemoryDiagnostics,
      handleShortcutSearchCoverageSnapshot,
      resetShortcutCoverageState,
    }),
    [
      getPerfNow,
      handleShortcutSearchCoverageSnapshot,
      readRuntimeMemoryDiagnostics,
      resetShortcutCoverageState,
    ]
  );
  const hydrationRuntimeState: SearchRootHydrationRuntimeState = useSearchRuntimeBusSelector(
    runtimeOwner.searchRuntimeBus,
    (state) => ({
      resultsHydrationKey: state.resultsHydrationKey,
      hydratedResultsKey: state.hydratedResultsKey,
    }),
    (a, b) =>
      a.resultsHydrationKey === b.resultsHydrationKey &&
      a.hydratedResultsKey === b.hydratedResultsKey,
    ['resultsHydrationKey', 'hydratedResultsKey'] as const
  );
  const primitives = React.useMemo(
    () => ({
      ...runtimePrimitives,
      ...cameraViewportRuntime,
    }),
    [cameraViewportRuntime, runtimePrimitives]
  );
  const freezeGate = useSearchFreezeGateRuntime({
    searchRuntimeBus: runtimeOwner.searchRuntimeBus,
    resultsRequestKey: resultsArrivalState.resultsRequestKey,
    searchMode: runtimeFlags.searchMode,
    getPerfNow: primitives.getPerfNow,
    runOneHandoffCoordinatorRef: runtimeOwner.runOneHandoffCoordinatorRef as Parameters<
      typeof useSearchFreezeGateRuntime
    >[0]['runOneHandoffCoordinatorRef'],
    runOneCommitSpanPressureByOperationRef: primitives.runOneCommitSpanPressureByOperationRef,
  });
  const historyRuntime = useSearchHistoryRuntime({ isSignedIn });
  const filterStateRuntime = useSearchFilterStateRuntime();
  const requestStatusRuntime = useSearchRequestStatusRuntime();
  const overlayCommandRuntime = useSearchRouteOverlayCommandRuntime({
    hasUserSharedSnap: sharedSnapState.hasUserSharedSnap,
    sharedSnap: sharedSnapState.sharedSnap,
  });
  const [isInitialCameraReady, setIsInitialCameraReady] = React.useState(
    () => startupCamera != null
  );
  const ensureInitialCameraReady = React.useCallback(() => {
    setIsInitialCameraReady(true);
  }, []);
  const [isMapStyleReady, setIsMapStyleReady] = React.useState(false);
  const hasPrimedInitialBoundsRef = React.useRef(false);
  React.useLayoutEffect(() => {
    if (accessToken) {
      void MapboxGL.setAccessToken(accessToken);
    }
  }, [accessToken]);
  React.useEffect(() => {
    if (!isInitialCameraReady) {
      setIsMapStyleReady(false);
    }
  }, [isInitialCameraReady]);
  const handleMapLoaded = React.useCallback(() => {
    setIsMapStyleReady(true);
    if (hasPrimedInitialBoundsRef.current) {
      return;
    }
    hasPrimedInitialBoundsRef.current = true;
    void (async () => {
      if (runtimeOwner.latestBoundsRef.current) {
        return;
      }
      if (!rootPrimitivesRuntime.mapState.mapRef.current?.getVisibleBounds) {
        return;
      }
      try {
        const visibleBounds =
          await rootPrimitivesRuntime.mapState.mapRef.current.getVisibleBounds();
        if (
          Array.isArray(visibleBounds) &&
          visibleBounds.length >= 2 &&
          isLngLatTuple(visibleBounds[0]) &&
          isLngLatTuple(visibleBounds[1])
        ) {
          runtimeOwner.viewportBoundsService.setBounds(
            boundsFromPairs(visibleBounds[0], visibleBounds[1])
          );
        }
      } catch {
        // ignore
      }
    })();
  }, [
    runtimeOwner.latestBoundsRef,
    runtimeOwner.viewportBoundsService,
    rootPrimitivesRuntime.mapState.mapRef,
  ]);
  const handleMainMapFullyRendered = React.useCallback(() => {
    markMainMapReady();
  }, [markMainMapReady]);
  React.useEffect(() => {
    if (!startupCamera) {
      return;
    }
    primitives.commitCameraViewport(
      {
        center: startupCamera.center,
        zoom: startupCamera.zoom,
      },
      { allowDuringGesture: true }
    );
    primitives.lastCameraStateRef.current = {
      center: startupCamera.center,
      zoom: startupCamera.zoom,
    };
    primitives.lastPersistedCameraRef.current = JSON.stringify({
      center: startupCamera.center,
      zoom: startupCamera.zoom,
    });
    rootPrimitivesRuntime.mapState.setMapCenter((current) => current ?? startupCamera.center);
    rootPrimitivesRuntime.mapState.setMapZoom((current) => current ?? startupCamera.zoom);
    rootPrimitivesRuntime.mapState.setIsFollowingUser(false);
    ensureInitialCameraReady();
  }, [ensureInitialCameraReady, primitives, rootPrimitivesRuntime.mapState, startupCamera]);
  const mapBootstrapRuntime = React.useMemo(
    () => ({
      isInitialCameraReady,
      ensureInitialCameraReady,
      isMapStyleReady,
      handleMapLoaded,
      handleMainMapFullyRendered,
    }),
    [
      ensureInitialCameraReady,
      handleMainMapFullyRendered,
      handleMapLoaded,
      isInitialCameraReady,
      isMapStyleReady,
    ]
  );
  const rootSessionRuntime = {
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
  const suggestionVisibilityRuntime = useSearchSuggestionVisibilityRuntime({
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
  const startupGeometrySeed = React.useMemo(() => {
    const viewport = getSearchStartupViewportMetrics();
    return buildSearchStartupGeometrySeed({
      windowWidth: viewport.width,
      windowHeight: viewport.height,
      insetsTop: viewport.insetsTop,
      insetsBottom: viewport.insetsBottom,
    });
  }, [insets.bottom, insets.top]);
  const suggestionLayoutRuntime = useSearchSuggestionLayoutRuntime({
    searchInteractionRef: rootSessionRuntime.primitives.searchInteractionRef,
    startupGeometrySeed,
    query: rootPrimitivesRuntime.searchState.query,
    isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
    isSuggestionPanelVisible: suggestionVisibilityRuntime.isSuggestionPanelVisible,
    shouldDriveSuggestionLayout: suggestionVisibilityRuntime.shouldDriveSuggestionLayout,
    shouldShowSuggestionBackground: suggestionVisibilityRuntime.shouldShowSuggestionBackground,
    shouldRenderSuggestionPanel: suggestionVisibilityRuntime.shouldRenderSuggestionPanel,
  });
  const rootSuggestionRuntime = {
    ...suggestionVisibilityRuntime,
    ...suggestionLayoutRuntime,
    isSuggestionScreenActive:
      rootPrimitivesRuntime.searchState.isSuggestionPanelActive ||
      suggestionVisibilityRuntime.isSuggestionPanelVisible,
  };
  const { activeOverlayKey, rootOverlay, registerTransientDismissor, dismissTransientOverlays } =
    useOverlayStore(
      useShallow((state) => ({
        activeOverlayKey: state.activeOverlayRoute.key,
        rootOverlay: (state.overlayRouteStack[0]?.key ??
          state.activeOverlayRoute.key) as OverlayKey,
        registerTransientDismissor: state.registerTransientDismissor,
        dismissTransientOverlays: state.dismissTransientOverlays,
      }))
    );
  const isSearchOverlay = rootOverlay === 'search';
  const showBookmarksOverlay = rootOverlay === 'bookmarks';
  const showPollsOverlay = false;
  const showProfileOverlay = rootOverlay === 'profile';
  const previousRootOverlayRef = React.useRef<OverlayKey | null>(null);
  React.useEffect(() => {
    const previous = previousRootOverlayRef.current;
    previousRootOverlayRef.current = rootOverlay;
    if (rootOverlay !== 'search') {
      return;
    }
    if (!previous || previous === 'search') {
      return;
    }
    rootSessionRuntime.runtimeOwner.overlayRuntimeController.restoreSearchRootEntry({
      snap: 'collapsed',
      clearTabSnapRequest: true,
    });
  }, [rootOverlay, rootSessionRuntime.runtimeOwner.overlayRuntimeController]);
  const ensureSearchOverlay = React.useCallback(() => {
    rootSessionRuntime.runtimeOwner.overlayRuntimeController.ensureSearchOverlay();
  }, [rootSessionRuntime.runtimeOwner.overlayRuntimeController]);
  const overlayStoreRuntime: SearchOverlayStoreRuntime = React.useMemo(
    () => ({
      activeOverlayKey,
      rootOverlay,
      isSearchOverlay,
      showBookmarksOverlay,
      showPollsOverlay,
      showProfileOverlay,
      registerTransientDismissor,
      dismissTransientOverlays,
      ensureSearchOverlay,
    }),
    [
      activeOverlayKey,
      dismissTransientOverlays,
      ensureSearchOverlay,
      isSearchOverlay,
      registerTransientDismissor,
      rootOverlay,
      showBookmarksOverlay,
      showPollsOverlay,
      showProfileOverlay,
    ]
  );
  const routeSessionRuntime = useSearchRouteSessionController({
    rootOverlay: overlayStoreRuntime.rootOverlay,
    pollsSheetSnap: rootSessionRuntime.overlayCommandRuntime.commandState.pollsSheetSnap,
    bookmarksSheetSnap: rootSessionRuntime.overlayCommandRuntime.commandState.bookmarksSheetSnap,
    profileSheetSnap: rootSessionRuntime.overlayCommandRuntime.commandState.profileSheetSnap,
    isDockedPollsDismissed:
      rootSessionRuntime.overlayCommandRuntime.commandState.isDockedPollsDismissed,
    hasUserSharedSnap: rootSessionRuntime.sharedSnapState.hasUserSharedSnap,
    sharedSnap: rootSessionRuntime.sharedSnapState.sharedSnap,
  });
  const searchBarTop = React.useMemo(
    () => startupGeometrySeed.searchBarTop,
    [startupGeometrySeed.searchBarTop]
  );
  const bottomInset = resolveSearchBottomInset(insets.bottom);
  const handleBottomNavLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const layout = event.nativeEvent.layout;
      assertSearchStartupGeometryValue(
        'bottomNav.top',
        startupGeometrySeed.navBarTopForSnaps,
        PixelRatio.roundToNearestPixel(layout.y)
      );
      assertSearchStartupGeometryValue(
        'bottomNav.height',
        startupGeometrySeed.bottomNavHeight,
        PixelRatio.roundToNearestPixel(layout.height)
      );
    },
    [startupGeometrySeed.bottomNavHeight, startupGeometrySeed.navBarTopForSnaps]
  );
  const bottomNavHiddenTranslateY = startupGeometrySeed.bottomNavHiddenTranslateY;
  const navBarTopForSnaps = startupGeometrySeed.navBarTopForSnaps;
  const navBarCutoutHeight = startupGeometrySeed.navBarCutoutHeight;
  const bottomNavRuntime: SearchBottomNavRuntime = React.useMemo(
    () => ({
      searchBarTop,
      bottomInset,
      handleBottomNavLayout,
      bottomNavHiddenTranslateY,
      navBarTopForSnaps,
      navBarCutoutHeight,
    }),
    [
      bottomInset,
      bottomNavHiddenTranslateY,
      handleBottomNavLayout,
      navBarCutoutHeight,
      navBarTopForSnaps,
      searchBarTop,
    ]
  );
  const rootScaffoldRuntime = useSearchRootScaffoldRuntime({
    insetsTop: insets.top,
    startupPollBounds,
    overlayStoreRuntime,
    routeSessionRuntime,
    bottomNavRuntime,
    rootPrimitivesRuntime,
    rootSessionRuntime,
  });
  const logPresentationDiag = React.useCallback((label: string, data?: Record<string, unknown>) => {
    const debugLogger = logger.debug as (
      message: string,
      payload?: Record<string, unknown>
    ) => void;
    debugLogger('[PRESENTATION-DIAG] controller', {
      label,
      ...(data ?? {}),
    });
  }, []);
  const resetResultsListScrollProgressRef = React.useRef<() => void>(() => {});
  const scrollResultsToTop = React.useCallback(() => {
    const listRef = rootPrimitivesRuntime.searchState.resultsScrollRef.current;
    if (!listRef?.scrollToOffset) {
      return;
    }

    resetResultsListScrollProgressRef.current();
    listRef.clearLayoutCacheOnUpdate?.();
    rootScaffoldRuntime.resultsSheetRuntimeOwner.resultsScrollOffset.value = 0;
    requestAnimationFrame(() => {
      listRef.scrollToOffset?.({ offset: 0, animated: false });
    });
  }, [
    resetResultsListScrollProgressRef,
    rootPrimitivesRuntime.searchState.resultsScrollRef,
    rootScaffoldRuntime.resultsSheetRuntimeOwner.resultsScrollOffset,
  ]);
  const cancelPendingMutationWorkRef = React.useRef<() => void>(() => {});
  const registerPendingMutationWorkCancel = React.useCallback((handler: () => void) => {
    cancelPendingMutationWorkRef.current = handler;
  }, []);
  const handleCancelPendingMutationWork = React.useCallback(() => {
    cancelPendingMutationWorkRef.current();
  }, []);
  const profilePresentationActiveRef = React.useRef(false);
  const closeRestaurantProfileRef = React.useRef<
    (options?: { dismissBehavior?: 'restore' | 'clear'; clearSearchOnDismiss?: boolean }) => void
  >(() => {});
  const resetRestaurantProfileFocusSessionRef = React.useRef<() => void>(() => {});
  const cancelToggleInteractionRef = React.useRef<() => void>(() => {});
  const profileBridgeRefs = React.useMemo(
    () => ({
      profilePresentationActiveRef,
      closeRestaurantProfileRef,
      resetRestaurantProfileFocusSessionRef,
    }),
    []
  );
  const handleSearchSessionShadowTransition = useSearchSessionShadowTransitionRuntime({
    runOneHandoffCoordinatorRef: rootSessionRuntime.runtimeOwner
      .runOneHandoffCoordinatorRef as Parameters<
      typeof useSearchSessionShadowTransitionRuntime
    >[0]['runOneHandoffCoordinatorRef'],
  });
  const requestLaneRuntime = useSearchRootRequestLaneRuntime({
    rootPrimitivesRuntime,
    rootSessionRuntime,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    handleSearchSessionShadowTransition,
    handleCancelPendingMutationWork,
    profileBridgeRefs,
    rootUiBridge: {
      registerPendingMutationWorkCancel,
      scrollResultsToTop,
    },
    cancelToggleInteractionRef,
    lastAutoOpenKeyRef,
    logPresentationDiag,
  });
  React.useEffect(() => {
    setShouldDisableSearchShortcuts(false);
  }, [setShouldDisableSearchShortcuts]);
  const profileActionRuntime = useSearchRootProfileActionRuntime({
    environment: {
      insets,
      isSignedIn,
      userLocation,
      userLocationRef,
    },
    rootPrimitivesRuntime,
    rootSessionRuntime,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
    profileBridgeRefs,
  });
  const actionLanesRuntime = useSearchRootActionLanesRuntime({
    activeMainIntent,
    consumeActiveMainIntent,
    navigation,
    routeSearchIntent,
    userLocation,
    rootPrimitivesRuntime,
    rootSessionRuntime,
    rootSuggestionRuntime,
    rootScaffoldRuntime,
    requestLaneRuntime,
    profileActionRuntime,
    lastAutoOpenKeyRef,
  });
  const {
    visualRuntime,
    shouldFreezeSuggestionSurfaceForRunOne,
    shouldFreezeOverlayHeaderChromeForRunOne,
  } = useSearchRootVisualPublicationRuntime({
    insetsTop: insets.top,
    startupPollsSnapshot,
    userLocation,
    scaffoldRuntime: rootScaffoldRuntime,
    sessionRuntime: rootSessionRuntime,
    suggestionRuntime: rootSuggestionRuntime,
    actionLanesRuntime,
    resultsPresentationOwner:
      requestLaneRuntime.requestPresentationFlowRuntime.requestPresentationRuntime
        .resultsPresentationOwner,
    searchState: {
      resultsScrollRef: rootPrimitivesRuntime.searchState.resultsScrollRef,
      searchFiltersLayoutCacheRef: rootPrimitivesRuntime.searchState.searchFiltersLayoutCacheRef,
      handleSearchFiltersLayoutCache:
        rootPrimitivesRuntime.searchState.handleSearchFiltersLayoutCache,
      isSuggestionPanelActive: rootPrimitivesRuntime.searchState.isSuggestionPanelActive,
      shouldDisableSearchShortcutsRef:
        rootPrimitivesRuntime.searchState.shouldDisableSearchShortcutsRef,
      setQuery: rootPrimitivesRuntime.searchState.setQuery,
    },
  });
  const {
    handleMapPress,
    handleNativeViewportChanged,
    handleMapIdle,
    handleMapTouchStart,
    handleMapTouchEnd,
  } = useMapInteractionController({
    searchInteractionRef: rootSessionRuntime.primitives.searchInteractionRef,
    anySheetDraggingRef: rootSessionRuntime.primitives.anySheetDraggingRef,
    pendingMarkerOpenAnimationFrameRef:
      actionLanesRuntime.profileActionRuntime.pendingMarkerOpenAnimationFrameRef,
    isSearchSessionActive: rootSessionRuntime.runtimeFlags.isSearchSessionActive,
    cancelAutocomplete: rootSessionRuntime.requestStatusRuntime.cancelAutocomplete,
    cameraIntentArbiter: rootSessionRuntime.runtimeOwner.cameraIntentArbiter,
    viewportBoundsService: rootSessionRuntime.runtimeOwner.viewportBoundsService,
    commitCameraViewport: rootSessionRuntime.primitives.commitCameraViewport,
    lastCameraStateRef: rootSessionRuntime.primitives.lastCameraStateRef,
    lastPersistedCameraRef: rootSessionRuntime.primitives.lastPersistedCameraRef,
    hasResults: rootSessionRuntime.resultsArrivalState.hasResults,
    shouldLogMapEventRates: rootScaffoldRuntime.instrumentationRuntime.shouldLogMapEventRates,
    mapEventLogIntervalMs: rootScaffoldRuntime.instrumentationRuntime.mapEventLogIntervalMs,
    shouldLogSearchStateChanges:
      rootScaffoldRuntime.instrumentationRuntime.shouldLogSearchStateChanges,
    mapGestureActiveRef: rootScaffoldRuntime.resultsSheetRuntimeLane.mapGestureActiveRef,
    shouldRenderResultsSheetRef:
      rootScaffoldRuntime.resultsSheetRuntimeOwner.shouldRenderResultsSheetRef,
    mapMotionPressureController:
      rootScaffoldRuntime.resultsSheetRuntimeLane.mapMotionPressureController,
    cancelPendingMapMovementUpdates:
      rootScaffoldRuntime.resultsSheetRuntimeLane.cancelPendingMapMovementUpdates,
    markMapMovedIfNeeded: rootScaffoldRuntime.resultsSheetRuntimeLane.markMapMovedIfNeeded,
    scheduleMapIdleEnter: rootScaffoldRuntime.resultsSheetRuntimeLane.scheduleMapIdleEnter,
    sheetState: rootScaffoldRuntime.resultsSheetRuntimeOwner.sheetState,
    isSearchOverlay: rootScaffoldRuntime.overlaySessionRuntime.isSearchOverlay,
    animateSheetTo: rootScaffoldRuntime.resultsSheetRuntimeOwner.animateSheetTo,
    shouldShowPollsSheet: rootScaffoldRuntime.overlaySessionRuntime.shouldShowPollsSheet,
    schedulePollBoundsUpdate: rootScaffoldRuntime.resultsSheetRuntimeLane.schedulePollBoundsUpdate,
    suppressAutocompleteResults:
      requestLaneRuntime.requestPresentationFlowRuntime.autocompleteRuntime
        .suppressAutocompleteResults,
    suppressMapMovedRef: rootPrimitivesRuntime.mapState.suppressMapMovedRef,
    allowSearchBlurExitRef: rootPrimitivesRuntime.searchState.allowSearchBlurExitRef,
    beginSuggestionCloseHold: rootSuggestionRuntime.beginSuggestionCloseHold,
    setIsAutocompleteSuppressed: rootPrimitivesRuntime.searchState.setIsAutocompleteSuppressed,
    setIsSearchFocused: rootPrimitivesRuntime.searchState.setIsSearchFocused,
    setIsSuggestionPanelActive: rootPrimitivesRuntime.searchState.setIsSuggestionPanelActive,
    setShowSuggestions: rootPrimitivesRuntime.searchState.setShowSuggestions,
    setSuggestions: rootPrimitivesRuntime.searchState.setSuggestions,
    isProfilePresentationActive:
      actionLanesRuntime.profileActionRuntime.profileOwner.profileViewState.presentation
        .isPresentationActive,
    clearMapHighlightedRestaurantId:
      actionLanesRuntime.profileActionRuntime.profileOwner.profileActions
        .clearMapHighlightedRestaurantId,
    shouldDisableResultsSheetInteraction:
      actionLanesRuntime.resultsActionRuntime.presentationState
        .shouldDisableResultsSheetInteraction,
    dismissSearchKeyboard:
      actionLanesRuntime.profileActionRuntime.suggestionInteractionRuntime.dismissSearchKeyboard,
  });
  const mapRenderSurfaceModel = useSearchRootMapRenderSurfaceRuntime({
    environment: {
      accessToken,
      startupLocationSnapshot,
      userLocation,
    },
    sessionRuntime: {
      runtimeOwner: rootSessionRuntime.runtimeOwner,
      mapBootstrapRuntime: rootSessionRuntime.mapBootstrapRuntime,
      filterStateRuntime: rootSessionRuntime.filterStateRuntime,
      primitives: rootSessionRuntime.primitives,
    },
    scaffoldRuntime: {
      resultsSheetRuntimeLane: rootScaffoldRuntime.resultsSheetRuntimeLane,
      instrumentationRuntime: rootScaffoldRuntime.instrumentationRuntime,
    },
    requestLaneRuntime,
    actionLanesRuntime,
    mapState: {
      restaurantOnlyId: rootPrimitivesRuntime.searchState.restaurantOnlyId,
      mapRef: rootPrimitivesRuntime.mapState.mapRef,
      cameraRef: rootPrimitivesRuntime.mapState.cameraRef,
      mapCenter: rootPrimitivesRuntime.mapState.mapCenter,
      mapZoom: rootPrimitivesRuntime.mapState.mapZoom ?? USA_FALLBACK_ZOOM,
      mapCameraAnimation: rootPrimitivesRuntime.mapState.mapCameraAnimation,
      isFollowingUser: rootPrimitivesRuntime.mapState.isFollowingUser,
    },
    mapInteractionHandlers: {
      handleMapPress,
      handleNativeViewportChanged,
      handleMapIdle,
      handleMapTouchStart,
      handleMapTouchEnd,
      handleMapLoaded: rootSessionRuntime.mapBootstrapRuntime.handleMapLoaded,
    },
  });
  const { overlayRenderSurfaceModel, modalSheetRenderSurfaceModel } =
    useSearchRootOverlayRenderSurfaceRuntime({
      insets: {
        top: insets.top,
        left: insets.left,
        right: insets.right,
      },
      overlaySessionRuntime: rootScaffoldRuntime.overlaySessionRuntime,
      instrumentationRuntime: rootScaffoldRuntime.instrumentationRuntime,
      suggestionRuntime: rootSuggestionRuntime,
      visualRuntime,
      actionLanesRuntime,
      headerVisualModel:
        requestLaneRuntime.requestPresentationFlowRuntime.requestPresentationRuntime
          .resultsPresentationOwner.shellModel.headerVisualModel,
      searchState: {
        activeTab: rootPrimitivesRuntime.searchState.activeTab,
        isSearchFiltersLayoutWarm: rootPrimitivesRuntime.searchState.isSearchFiltersLayoutWarm,
        searchFiltersLayoutCacheRef: rootPrimitivesRuntime.searchState.searchFiltersLayoutCacheRef,
        handleSearchFiltersLayoutCache:
          rootPrimitivesRuntime.searchState.handleSearchFiltersLayoutCache,
      },
      shouldFreezeSuggestionSurfaceForRunOne,
      shouldFreezeOverlayHeaderChromeForRunOne,
    });
  useSearchAppShellRuntimePublication({
    isVisible: isSearchScreenFocused,
    overlayRenderSurfaceModel,
    modalSheetRenderSurfaceModel,
    profilerRenderCallback: rootScaffoldRuntime.instrumentationRuntime.handleProfilerRender,
  });

  const handleProfilerRender = rootScaffoldRuntime.instrumentationRuntime.handleProfilerRender;
  const markerEngineRefForRender = rootPrimitivesRuntime.mapState.markerEngineRef;
  const isInitialCameraReadyForRender = rootSessionRuntime.mapBootstrapRuntime.isInitialCameraReady;
  const previousRootOverlayAttributionRef = React.useRef<{
    rootOverlay: OverlayKey;
    activeOverlayKey: OverlayKey;
    mapRenderSurfaceModel: SearchRootRuntime['mapRenderSurfaceModel'];
    searchMapProps: SearchRootRuntime['mapRenderSurfaceModel']['searchMapProps'];
    handleProfilerRender: SearchRootRuntime['handleProfilerRender'];
    markerEngineRef: SearchRootRuntime['markerEngineRef'];
    isInitialCameraReady: boolean;
  } | null>(null);

  React.useEffect(() => {
    if (!SHOULD_LOG_ROOT_OVERLAY_ATTRIBUTION) {
      return;
    }

    const previous = previousRootOverlayAttributionRef.current;
    const next = {
      rootOverlay,
      activeOverlayKey,
      mapRenderSurfaceModel,
      searchMapProps: mapRenderSurfaceModel.searchMapProps,
      handleProfilerRender,
      markerEngineRef: markerEngineRefForRender,
      isInitialCameraReady: isInitialCameraReadyForRender,
    };

    if (!previous) {
      previousRootOverlayAttributionRef.current = next;
      logger.debug('[ROOT-OVERLAY-ATTRIBUTION] rootRuntime:init', {
        rootOverlay,
        activeOverlayKey,
      });
      return;
    }

    const rootOverlayChanged = previous.rootOverlay !== next.rootOverlay;
    const activeOverlayKeyChanged = previous.activeOverlayKey !== next.activeOverlayKey;
    const mapRenderSurfaceModelChanged =
      previous.mapRenderSurfaceModel !== next.mapRenderSurfaceModel;
    const searchMapPropsChanged = previous.searchMapProps !== next.searchMapProps;
    const handleProfilerRenderChanged = previous.handleProfilerRender !== next.handleProfilerRender;
    const markerEngineRefChanged = previous.markerEngineRef !== next.markerEngineRef;
    const isInitialCameraReadyChanged = previous.isInitialCameraReady !== next.isInitialCameraReady;

    if (
      !rootOverlayChanged &&
      !activeOverlayKeyChanged &&
      !mapRenderSurfaceModelChanged &&
      !searchMapPropsChanged &&
      !handleProfilerRenderChanged &&
      !markerEngineRefChanged &&
      !isInitialCameraReadyChanged
    ) {
      previousRootOverlayAttributionRef.current = next;
      return;
    }

    logger.debug('[ROOT-OVERLAY-ATTRIBUTION] rootRuntime:outputs', {
      previousRootOverlay: previous.rootOverlay,
      nextRootOverlay: next.rootOverlay,
      previousActiveOverlayKey: previous.activeOverlayKey,
      nextActiveOverlayKey: next.activeOverlayKey,
      changed: {
        rootOverlay: rootOverlayChanged,
        activeOverlayKey: activeOverlayKeyChanged,
        mapRenderSurfaceModel: mapRenderSurfaceModelChanged,
        searchMapProps: searchMapPropsChanged,
        handleProfilerRender: handleProfilerRenderChanged,
        markerEngineRef: markerEngineRefChanged,
        isInitialCameraReady: isInitialCameraReadyChanged,
      },
    });

    previousRootOverlayAttributionRef.current = next;
  }, [
    activeOverlayKey,
    handleProfilerRender,
    isInitialCameraReadyForRender,
    mapRenderSurfaceModel,
    markerEngineRefForRender,
    rootOverlay,
  ]);

  return {
    mapRenderSurfaceModel,
    handleProfilerRender,
    searchRuntimeBus: rootSessionRuntime.runtimeOwner.searchRuntimeBus,
    markerEngineRef: markerEngineRefForRender,
    isInitialCameraReady: isInitialCameraReadyForRender,
  };
};
