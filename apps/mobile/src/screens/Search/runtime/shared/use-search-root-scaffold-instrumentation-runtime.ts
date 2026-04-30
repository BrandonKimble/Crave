import React from 'react';

import type { SearchRootInstrumentationRuntime } from './search-root-scaffold-runtime-contract';
import type { AppRouteSceneSwitchAuthority } from '../../../../navigation/runtime/app-route-scene-switch-authority';
import type {
  SearchRootDataPlaneRuntime,
  SearchRootSessionCoreLane,
  SearchRootSessionPrimitivesLane,
} from './use-search-root-session-runtime-contract';
import { useSearchRuntimeInstrumentationRuntime } from './use-search-runtime-instrumentation-runtime';
import type { SearchOverlayStoreRuntime } from './search-root-scaffold-runtime-contract';

type RootPrimitivesRuntime = {
  searchState: {
    isAutocompleteSuppressed: boolean;
  };
};

type UseSearchRootScaffoldInstrumentationRuntimeArgs = {
  rootPrimitivesRuntime: RootPrimitivesRuntime;
  rootSessionCoreLane: SearchRootSessionCoreLane;
  rootSessionPrimitivesLane: SearchRootSessionPrimitivesLane;
  rootDataPlaneRuntime: SearchRootDataPlaneRuntime;
  rootOverlayStoreRuntime: Pick<
    SearchOverlayStoreRuntime,
    'rootOverlay' | 'activeOverlayKey' | 'isSearchOverlay' | 'getIdentitySnapshot'
  >;
  routeSceneSwitchAuthority: Pick<AppRouteSceneSwitchAuthority, 'getSnapshot'>;
};

export const useSearchRootScaffoldInstrumentationRuntime = ({
  rootPrimitivesRuntime,
  rootSessionCoreLane,
  rootSessionPrimitivesLane,
  rootDataPlaneRuntime,
  rootOverlayStoreRuntime,
  routeSceneSwitchAuthority,
}: UseSearchRootScaffoldInstrumentationRuntimeArgs): SearchRootInstrumentationRuntime => {
  const roundPerfValue = React.useCallback(
    (value: number): number => Math.round(value * 10) / 10,
    []
  );

  return useSearchRuntimeInstrumentationRuntime({
    getPerfNow: rootSessionPrimitivesLane.primitives.getPerfNow,
    roundPerfValue,
    searchSessionController: rootSessionCoreLane.searchSessionController,
    mapQueryBudget: rootSessionCoreLane.mapQueryBudget,
    searchMode: rootDataPlaneRuntime.runtimeFlags.searchMode,
    isSearchLoading: rootDataPlaneRuntime.runtimeFlags.isSearchLoading,
    isLoadingMore: rootDataPlaneRuntime.resultsArrivalState.isLoadingMore,
    isRunOneHandoffActive: rootDataPlaneRuntime.freezeGate.isRun1HandoffActive,
    resultsRequestKey: rootDataPlaneRuntime.resultsArrivalState.resultsRequestKey,
    searchInteractionRef: rootSessionPrimitivesLane.primitives.searchInteractionRef,
    isInitialCameraReady: rootSessionCoreLane.mapBootstrapRuntime.isInitialCameraReady,
    runTimeoutMs: 45000,
    settleQuietPeriodMs: 320,
    searchRuntimeBus: rootSessionCoreLane.searchRuntimeBus,
    runtimeWorkSchedulerRef: rootSessionCoreLane.runtimeWorkSchedulerRef,
    runOneHandoffCoordinatorRef: rootSessionCoreLane.runOneHandoffCoordinatorRef as Parameters<
      typeof useSearchRuntimeInstrumentationRuntime
    >[0]['runOneHandoffCoordinatorRef'],
    runOneCommitSpanPressureByOperationRef:
      rootSessionPrimitivesLane.primitives.runOneCommitSpanPressureByOperationRef,
    isSearchRequestLoadingRef: rootDataPlaneRuntime.runtimeFlags.isSearchRequestLoadingRef,
    readRuntimeMemoryDiagnostics: rootSessionPrimitivesLane.primitives.readRuntimeMemoryDiagnostics,
    isSearchSessionActive: rootDataPlaneRuntime.runtimeFlags.isSearchSessionActive,
    isAutocompleteSuppressed: rootPrimitivesRuntime.searchState.isAutocompleteSuppressed,
    rootOverlay: rootOverlayStoreRuntime.rootOverlay,
    activeOverlayKey: rootOverlayStoreRuntime.activeOverlayKey,
    isSearchOverlay: rootOverlayStoreRuntime.isSearchOverlay,
    getRouteOverlayIdentitySnapshot: rootOverlayStoreRuntime.getIdentitySnapshot,
    getRouteActiveSceneKey: () => routeSceneSwitchAuthority.getSnapshot().routeActiveSceneKey,
    resultsPage: rootDataPlaneRuntime.resultsArrivalState.resultsPage,
  });
};
