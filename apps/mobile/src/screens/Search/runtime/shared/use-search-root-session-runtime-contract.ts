import React from 'react';

import type { OverlaySheetSnap } from '../../../../overlays/types';
import type { MainLaunchCoordinatorValue } from '../../../../navigation/runtime/MainLaunchCoordinator';
import type { MapBounds } from '../../../../types';
import type { SearchResponse } from '../../../../types/search';
import type { SearchMapMarkerEngineHandle } from '../../components/SearchMapWithMarkerEngine';
import type { MapboxMapRef } from '../../components/search-map';
import type { SearchRootEnvironment } from './search-root-environment-contract';
import { useSearchRequestStatusRuntime } from './use-search-request-status-runtime';
import { useSearchFilterStateRuntime } from './use-search-filter-state-runtime';
import { useSearchFreezeGateRuntime } from './use-search-freeze-gate-runtime';
import { useSearchHistoryRuntime } from './use-search-history-runtime';
import type { SearchSurfaceRedrawCoordinator } from '../controller/search-surface-redraw-coordinator';
import type { CameraIntentArbiter } from '../map/camera-intent-arbiter';
import type { CameraSnapshot } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';
import type { MapQueryBudget } from '../map/map-query-budget';
import type { SearchMapNativeCameraExecutor } from '../map/search-map-native-camera-executor';
import type { PhaseBMaterializer } from '../scheduler/phase-b-materializer';
import type { RuntimeWorkScheduler } from '../scheduler/runtime-work-scheduler';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchMapSourceFramePort } from '../map/search-map-source-frame-port';
import type { ViewportBoundsService } from '../viewport/viewport-bounds-service';
import type { UseAppRouteSceneCameraMotionTargetRuntimeArgs } from '../../../../navigation/runtime/use-app-route-scene-camera-motion-target-runtime';

export type {
  RouteOverlayNavigationAuthority,
  RouteSceneLayoutAuthority,
} from './route-authority-contract';

export type UseSearchRootSessionRuntimeArgs = {
  isSignedIn: boolean;
  accessToken: SearchRootEnvironment['accessToken'];
  startupPollBounds: MapBounds | null;
  startupCamera: MainLaunchCoordinatorValue['startupCamera'];
  cameraRef: React.RefObject<import('@rnmapbox/maps').Camera | null>;
  mapRef: React.MutableRefObject<MapboxMapRef | null>;
  markerEngineRef: React.RefObject<SearchMapMarkerEngineHandle | null>;
  markMainMapLoaded: () => void;
  markMainMapReady: () => void;
  searchMapNativeCameraExecutor: SearchMapNativeCameraExecutor;
  setMapCenter: React.Dispatch<React.SetStateAction<[number, number] | null>>;
  setMapZoom: React.Dispatch<React.SetStateAction<number | null>>;
  setMapCameraAnimation: React.Dispatch<
    React.SetStateAction<{
      mode: 'none' | 'easeTo';
      durationMs: number;
      completionId: string | null;
    }>
  >;
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
  searchSurfaceRedrawCommitSpanPressureByOperationRef: React.MutableRefObject<Map<string, number>>;
  getPerfNow: () => number;
  readRuntimeMemoryDiagnostics: () => null;
  resetShortcutCoverageState: () => void;
};

export type SearchRootResultsArrivalState = {
  currentResults: SearchResponse | null;
  hasResults: boolean;
  isLoadingMore: boolean;
  canLoadMore: boolean;
  currentPage: number;
  isPaginationExhausted: boolean;
  pendingTabSwitchTab: ReturnType<SearchRuntimeBus['getState']>['pendingTabSwitchTab'];
  restaurantResults: SearchResponse['restaurants'] | null;
  resultsRequestKey: string | null;
  submittedQuery: string;
  resultsPage: number | null;
};

export type SearchRootRuntimeFlagsRuntime = {
  searchMode: 'natural' | 'shortcut' | null;
  isSearchSessionActive: boolean;
  searchSurfaceRedrawOperationId: string | null;
  isSearchLoading: boolean;
  isSearchRequestLoadingRef: React.MutableRefObject<boolean>;
  setSearchRequestLoading: (isLoadingNext: boolean) => void;
  hydrationOperationId: string | null;
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
    payload: { center: [number, number]; zoom: number; padding?: CameraSnapshot['padding'] },
    options?: {
      allowDuringGesture?: boolean;
      animationMode?: 'none' | 'easeTo';
      animationDurationMs?: number;
      requestToken?: number | null;
      deferControlledCameraStateUntilCompletion?: boolean;
    }
  ) => ReturnType<CameraIntentArbiter['commit']>;
};

export type SearchRootMapBootstrapRuntime = {
  isInitialCameraReady: boolean;
  ensureInitialCameraReady: () => void;
  isMapStyleReady: boolean;
  handleMapLoaded: () => void;
  handleMainMapFullyRendered: () => void;
};

export type SearchRootDataPlaneRuntime = {
  resultsArrivalState: SearchRootResultsArrivalState;
  runtimeFlags: SearchRootRuntimeFlagsRuntime;
  freezeGate: ReturnType<typeof useSearchFreezeGateRuntime>;
  historyRuntime: ReturnType<typeof useSearchHistoryRuntime>;
  filterStateRuntime: ReturnType<typeof useSearchFilterStateRuntime>;
  requestStatusRuntime: ReturnType<typeof useSearchRequestStatusRuntime>;
};

export type SearchRootSessionCoreLane = {
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  searchMapSourceFramePort: SearchMapSourceFramePort;
  mapBootstrapRuntime: SearchRootMapBootstrapRuntime;
  mapQueryBudget: MapQueryBudget;
  viewportBoundsService: ViewportBoundsService;
  latestBoundsRef: React.MutableRefObject<MapBounds | null>;
  cameraIntentArbiter: CameraIntentArbiter;
  runtimeWorkSchedulerRef: React.MutableRefObject<RuntimeWorkScheduler>;
  searchSurfaceRedrawCoordinatorRef: React.MutableRefObject<SearchSurfaceRedrawCoordinator>;
  phaseBMaterializerRef: React.MutableRefObject<PhaseBMaterializer>;
};

export type SearchRootSessionControlServicesRuntime = Omit<
  SearchRootSessionCoreLane,
  'mapBootstrapRuntime'
>;

export type SearchRootSessionPrimitivesLane = {
  primitives: SearchRuntimePrimitivesRuntime & SearchRootCameraViewportRuntime;
  appRouteSceneCameraMotionTargetPorts: UseAppRouteSceneCameraMotionTargetRuntimeArgs;
};

export type SearchRootSessionRuntimeLanes = {
  sessionCoreLane: SearchRootSessionCoreLane;
  sessionPrimitivesLane: SearchRootSessionPrimitivesLane;
};
