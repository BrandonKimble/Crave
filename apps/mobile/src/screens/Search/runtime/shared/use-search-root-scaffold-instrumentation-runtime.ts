import type {
  SearchRootInstrumentationRuntime,
  SearchRootResultsSheetRuntimeLane,
} from './search-root-scaffold-runtime-contract';
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
  rootSharedSheetRuntimeLane: SearchRootResultsSheetRuntimeLane;
  rootDataPlaneRuntime: SearchRootDataPlaneRuntime;
  rootOverlayStoreRuntime: Pick<
    SearchOverlayStoreRuntime,
    'rootOverlay' | 'activeOverlayKey' | 'isSearchOverlay'
  >;
};

export const useSearchRootScaffoldInstrumentationRuntime = ({
  rootPrimitivesRuntime,
  rootSessionCoreLane,
  rootSessionPrimitivesLane,
  rootSharedSheetRuntimeLane,
  rootDataPlaneRuntime,
  rootOverlayStoreRuntime,
}: UseSearchRootScaffoldInstrumentationRuntimeArgs): SearchRootInstrumentationRuntime => {
  return useSearchRuntimeInstrumentationRuntime({
    getPerfNow: rootSessionPrimitivesLane.primitives.getPerfNow,
    mapQueryBudget: rootSessionCoreLane.mapQueryBudget,
    searchMode: rootDataPlaneRuntime.runtimeFlags.searchMode,
    isSearchLoading: rootDataPlaneRuntime.runtimeFlags.isSearchLoading,
    resultsRequestKey: rootDataPlaneRuntime.resultsArrivalState.resultsRequestKey,
    searchInteractionRef: rootSessionPrimitivesLane.primitives.searchInteractionRef,
    searchRuntimeBus: rootSessionCoreLane.searchRuntimeBus,
    resultsPresentationAuthority: rootSessionCoreLane.resultsPresentationAuthority,
    resultsPresentationSurfaceAuthority: rootSessionCoreLane.resultsPresentationSurfaceAuthority,
    searchSurfaceRedrawCoordinatorRef:
      rootSessionCoreLane.searchSurfaceRedrawCoordinatorRef as Parameters<
        typeof useSearchRuntimeInstrumentationRuntime
      >[0]['searchSurfaceRedrawCoordinatorRef'],
    searchSurfaceRedrawCommitSpanPressureByOperationRef:
      rootSessionPrimitivesLane.primitives.searchSurfaceRedrawCommitSpanPressureByOperationRef,
    isSearchRequestLoadingRef: rootDataPlaneRuntime.runtimeFlags.isSearchRequestLoadingRef,
    readRuntimeMemoryDiagnostics: rootSessionPrimitivesLane.primitives.readRuntimeMemoryDiagnostics,
    isSearchSessionActive: rootDataPlaneRuntime.runtimeFlags.isSearchSessionActive,
    isAutocompleteSuppressed: rootPrimitivesRuntime.searchState.isAutocompleteSuppressed,
    rootOverlay: rootOverlayStoreRuntime.rootOverlay,
    activeOverlayKey: rootOverlayStoreRuntime.activeOverlayKey,
    cameraIntentArbiter: rootSessionCoreLane.cameraIntentArbiter,
    viewportBoundsService: rootSessionCoreLane.viewportBoundsService,
    markMapMovedIfNeeded: rootSharedSheetRuntimeLane.markMapMovedIfNeeded,
    scheduleMapIdleEnter: rootSharedSheetRuntimeLane.scheduleMapIdleEnter,
    schedulePollBoundsUpdate: rootSharedSheetRuntimeLane.schedulePollBoundsUpdate,
    ensureInitialCameraReady: rootSessionCoreLane.mapBootstrapRuntime.ensureInitialCameraReady,
    isSearchOverlay: rootOverlayStoreRuntime.isSearchOverlay,
    resultsPage: rootDataPlaneRuntime.resultsArrivalState.resultsPage,
  });
};
