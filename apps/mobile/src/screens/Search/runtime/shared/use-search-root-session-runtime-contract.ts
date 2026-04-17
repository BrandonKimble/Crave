import React from 'react';

import type { OverlaySheetSnap } from '../../../../overlays/types';
import { useOverlaySheetPositionStore } from '../../../../overlays/useOverlaySheetPositionStore';
import { useSearchRouteOverlayCommandRuntime } from '../../../../overlays/useSearchRouteOverlayCommandRuntime';
import type { MainLaunchCoordinatorValue } from '../../../../navigation/runtime/MainLaunchCoordinator';
import type { MapBounds } from '../../../../types';
import type { SearchResponse } from '../../../../types/search';
import type { SearchMapMarkerEngineHandle } from '../../components/SearchMapWithMarkerEngine';
import type { MapboxMapRef } from '../../components/search-map';
import { useSearchRequestStatusRuntime } from './use-search-request-status-runtime';
import { useSearchRuntimeOwner } from '../../hooks/use-search-runtime-owner';
import { useSearchFilterStateRuntime } from './use-search-filter-state-runtime';
import { useSearchFreezeGateRuntime } from './use-search-freeze-gate-runtime';
import { useSearchHistoryRuntime } from './use-search-history-runtime';
import { useSearchRuntimeFlagsRuntime } from './use-search-runtime-flags-runtime';

export type UseSearchRootSessionRuntimeArgs = {
  isSignedIn: boolean;
  accessToken: string;
  startupPollBounds: Parameters<typeof useSearchRuntimeOwner>[0]['startupPollBounds'];
  startupCamera: MainLaunchCoordinatorValue['startupCamera'];
  cameraRef: Parameters<typeof useSearchRuntimeOwner>[0]['cameraRef'];
  mapRef: React.MutableRefObject<MapboxMapRef | null>;
  markerEngineRef: React.RefObject<SearchMapMarkerEngineHandle | null>;
  markMainMapReady: () => void;
  setMapCenter: Parameters<typeof useSearchRuntimeOwner>[0]['setMapCenter'];
  setMapZoom: Parameters<typeof useSearchRuntimeOwner>[0]['setMapZoom'];
  setMapCameraAnimation: Parameters<typeof useSearchRuntimeOwner>[0]['setMapCameraAnimation'];
  setIsFollowingUser: React.Dispatch<React.SetStateAction<boolean>>;
};

export type SearchRuntimeInteractionState = {
  isInteracting: boolean;
  isResultsSheetDragging: boolean;
  isResultsListScrolling: boolean;
  isResultsSheetSettling: boolean;
};

export type SearchRuntimePrimitivesRuntime = {
  searchInteractionRef: React.MutableRefObject<SearchRuntimeInteractionState>;
  anySheetDraggingRef: React.MutableRefObject<boolean>;
  lastSearchRequestIdRef: React.MutableRefObject<string | null>;
  runOneCommitSpanPressureByOperationRef: React.MutableRefObject<Map<string, number>>;
  getPerfNow: () => number;
  readRuntimeMemoryDiagnostics: () => null;
  handleShortcutSearchCoverageSnapshot: (snapshot: {
    searchRequestId: string;
    bounds: MapBounds | null;
    entities: Record<string, unknown>;
  }) => void;
  resetShortcutCoverageState: () => void;
};

export type SearchRootSharedSnapState = {
  hasUserSharedSnap: boolean;
  sharedSnap: ReturnType<typeof useOverlaySheetPositionStore.getState>['sharedSnap'];
};

export type SearchRootResultsArrivalState = {
  currentResults: SearchResponse | null;
  hasResults: boolean;
  isLoadingMore: boolean;
  canLoadMore: boolean;
  currentPage: number;
  isPaginationExhausted: boolean;
  pendingTabSwitchTab: ReturnType<
    ReturnType<typeof useSearchRuntimeOwner>['searchRuntimeBus']['getState']
  >['pendingTabSwitchTab'];
  restaurantResults: SearchResponse['restaurants'] | null;
  resultsRequestKey: string | null;
  submittedQuery: string;
  resultsPage: number | null;
};

export type SearchRootHydrationRuntimeState = {
  resultsHydrationKey: string | null;
  hydratedResultsKey: string | null;
};

export type SearchRootCameraViewportRuntime = {
  lastSearchBoundsCaptureSeqRef: React.MutableRefObject<number>;
  lastVisibleSheetStateRef: React.MutableRefObject<Exclude<OverlaySheetSnap, 'hidden'>>;
  lastCameraStateRef: React.MutableRefObject<{
    center: [number, number];
    zoom: number;
  } | null>;
  lastPersistedCameraRef: React.MutableRefObject<string | null>;
  commitCameraViewport: (
    payload: { center: [number, number]; zoom: number },
    options?: {
      allowDuringGesture?: boolean;
      animationMode?: 'none' | 'easeTo';
      animationDurationMs?: number;
      requestToken?: number | null;
    }
  ) => ReturnType<ReturnType<typeof useSearchRuntimeOwner>['cameraIntentArbiter']['commit']>;
};

export type SearchRootMapBootstrapRuntime = {
  isInitialCameraReady: boolean;
  ensureInitialCameraReady: () => void;
  isMapStyleReady: boolean;
  handleMapLoaded: () => void;
  handleMainMapFullyRendered: () => void;
};

export type SearchRootSessionRuntime = {
  runtimeOwner: ReturnType<typeof useSearchRuntimeOwner>;
  sharedSnapState: SearchRootSharedSnapState;
  resultsArrivalState: SearchRootResultsArrivalState;
  runtimeFlags: ReturnType<typeof useSearchRuntimeFlagsRuntime>;
  primitives: SearchRuntimePrimitivesRuntime & SearchRootCameraViewportRuntime;
  freezeGate: ReturnType<typeof useSearchFreezeGateRuntime>;
  hydrationRuntimeState: SearchRootHydrationRuntimeState;
  historyRuntime: ReturnType<typeof useSearchHistoryRuntime>;
  overlayCommandRuntime: ReturnType<typeof useSearchRouteOverlayCommandRuntime>;
  mapBootstrapRuntime: SearchRootMapBootstrapRuntime;
  filterStateRuntime: ReturnType<typeof useSearchFilterStateRuntime>;
  requestStatusRuntime: ReturnType<typeof useSearchRequestStatusRuntime>;
};
