import React from 'react';

import type { OverlaySheetSnap } from '../../../../overlays/types';
import { useOverlaySheetPositionStore } from '../../../../overlays/useOverlaySheetPositionStore';
import { useSearchRouteOverlayCommandRuntime } from '../../../../overlays/useSearchRouteOverlayCommandRuntime';
import type { SearchResponse } from '../../../types';
import { useSearchMapBootstrapRuntime } from './use-search-map-bootstrap-runtime';
import { useSearchRequestStatusRuntime } from './use-search-request-status-runtime';
import { useSearchRuntimeOwner } from '../../hooks/use-search-runtime-owner';
import { useSearchFilterStateRuntime } from './use-search-filter-state-runtime';
import { useSearchFreezeGateRuntime } from './use-search-freeze-gate-runtime';
import { useSearchHistoryRuntime } from './use-search-history-runtime';
import { useSearchRuntimeFlagsRuntime } from './use-search-runtime-flags-runtime';
import { useSearchRuntimePrimitivesRuntime } from './use-search-runtime-primitives-runtime';

export type UseSearchRootSessionRuntimeArgs = {
  isSignedIn: boolean;
  accessToken: string;
  startupPollBounds: Parameters<typeof useSearchRuntimeOwner>[0]['startupPollBounds'];
  startupCamera: Parameters<typeof useSearchMapBootstrapRuntime>[0]['startupCamera'];
  cameraRef: Parameters<typeof useSearchRuntimeOwner>[0]['cameraRef'];
  mapRef: Parameters<typeof useSearchMapBootstrapRuntime>[0]['mapRef'];
  markerEngineRef: Parameters<typeof useSearchRuntimePrimitivesRuntime>[0]['markerEngineRef'];
  markMainMapReady: Parameters<typeof useSearchMapBootstrapRuntime>[0]['markMainMapReady'];
  setMapCenter: Parameters<typeof useSearchRuntimeOwner>[0]['setMapCenter'];
  setMapZoom: Parameters<typeof useSearchRuntimeOwner>[0]['setMapZoom'];
  setMapCameraAnimation: Parameters<typeof useSearchRuntimeOwner>[0]['setMapCameraAnimation'];
  setIsFollowingUser: Parameters<typeof useSearchMapBootstrapRuntime>[0]['setIsFollowingUser'];
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

export type SearchRootSessionRuntime = {
  runtimeOwner: ReturnType<typeof useSearchRuntimeOwner>;
  sharedSnapState: SearchRootSharedSnapState;
  resultsArrivalState: SearchRootResultsArrivalState;
  runtimeFlags: ReturnType<typeof useSearchRuntimeFlagsRuntime>;
  primitives: ReturnType<typeof useSearchRuntimePrimitivesRuntime> &
    SearchRootCameraViewportRuntime;
  freezeGate: ReturnType<typeof useSearchFreezeGateRuntime>;
  hydrationRuntimeState: SearchRootHydrationRuntimeState;
  historyRuntime: ReturnType<typeof useSearchHistoryRuntime>;
  overlayCommandRuntime: ReturnType<typeof useSearchRouteOverlayCommandRuntime>;
  mapBootstrapRuntime: ReturnType<typeof useSearchMapBootstrapRuntime>;
  filterStateRuntime: ReturnType<typeof useSearchFilterStateRuntime>;
  requestStatusRuntime: ReturnType<typeof useSearchRequestStatusRuntime>;
};
