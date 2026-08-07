import React from 'react';

import type { RouteOverlayVisibilityAuthority } from './route-authority-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import { useAppRouteSharedSheetRuntimeOwner } from '../../../../navigation/runtime/AppRouteSharedSheetRuntimeProvider';
import type { AppRouteOverlaySessionSnapshot } from '../../../../navigation/runtime/app-route-overlay-session-contract';
import type { AppRouteOverlayCommandSnapshot } from '../../../../navigation/runtime/app-route-overlay-command-controller';
import type { SearchRootStateFoundationLane } from './search-root-foundation-runtime';
import type { SearchRootSessionCoreLane } from './search-root-session-runtime-contract';
import { useSearchRootMapRuntimeLane } from './use-search-root-map-runtime-lane';
import { useSearchRootOverlaySessionSurfaceRuntime } from './use-search-root-overlay-session-surface-runtime';
import { useSearchRootOverlayStoreRuntime } from './use-search-root-overlay-store-runtime';
import { useSearchRuntimeInstrumentationRuntime } from './use-search-runtime-instrumentation-runtime';
import type {
  SearchRootBootstrapEnvironment,
  SearchRootEnvironment,
} from './search-root-environment-contract';
import type { AppRouteSceneRuntime } from '../../../../navigation/runtime/app-route-scene-runtime';
import type { PresentationFrame } from '../../../../navigation/runtime/app-route-presentation-frame-contract';

// Thin adapter over the committed PresentationFrame (page-switch-master-plan.md §9.2 site 5):
// the docked decision is read from the frame's laneKind — the old parallel
// `isSearchOverlay && isDockedLane` re-derivation off the polls-visibility snapshot is
// the same formula (laneKind==='docked' already requires the search root), now sourced
// from the one writer. Consumers of the session-snapshot shape are unchanged.
const selectRouteOverlaySessionSnapshot = (
  frame: PresentationFrame
): AppRouteOverlaySessionSnapshot => {
  const isDockedSceneLane = frame.laneKind === 'docked';
  return {
    shouldShowDockedSceneTarget: isDockedSceneLane,
  };
};

// F1322: typed React.RefObject (readonly `current`), not MutableRefObject — the
// getter is the one writer (derived live off the committed PresentationFrame);
// there is no setter to lie about. A consumer that tries `.current = …` now
// gets a compile error instead of a silent no-op.
const createRouteOverlaySessionSnapshotRef = (
  routeSceneSwitchRuntime: AppRouteSceneRuntime['routeSceneSwitchRuntime']
): React.RefObject<AppRouteOverlaySessionSnapshot> => {
  const ref = {} as { current: AppRouteOverlaySessionSnapshot };
  Object.defineProperty(ref, 'current', {
    configurable: false,
    enumerable: true,
    get: () => selectRouteOverlaySessionSnapshot(routeSceneSwitchRuntime.getPresentationFrame()),
  });
  return ref;
};

type UseSearchRootOverlayFoundationRuntimeArgs = Pick<SearchRootEnvironment, 'insets'> &
  Pick<SearchRootBootstrapEnvironment, 'startupPollBounds'> & {
    sessionCoreLane: SearchRootSessionCoreLane;
    routeSceneRuntime: AppRouteSceneRuntime;
    routeOverlayIdentityAuthority: AppRouteSceneRuntime['routeOverlayIdentityAuthority'];
    routeOverlayVisibilityAuthority: RouteOverlayVisibilityAuthority;
    stateFoundationLane: SearchRootStateFoundationLane;
  };

export const useSearchRootOverlayFoundationRuntime = ({
  insets,
  startupPollBounds,
  sessionCoreLane,
  routeSceneRuntime,
  routeOverlayIdentityAuthority,
  routeOverlayVisibilityAuthority,
  stateFoundationLane,
}: UseSearchRootOverlayFoundationRuntimeArgs): SearchRootOverlayFoundationRuntime => {
  const { rootPrimitivesRuntime, rootDataPlaneRuntime, sessionPrimitivesLane } =
    stateFoundationLane;
  const routeOverlaySessionSnapshotRef = React.useMemo(
    () => createRouteOverlaySessionSnapshotRef(routeSceneRuntime.routeSceneSwitchRuntime),
    [routeSceneRuntime.routeSceneSwitchRuntime]
  );
  const routeOverlayCommandSnapshotRef = React.useRef<AppRouteOverlayCommandSnapshot>(
    routeSceneRuntime.routeOverlayCommandAuthority.getSnapshot()
  );
  React.useEffect(
    () =>
      routeSceneRuntime.routeOverlayCommandAuthority.subscribe(() => {
        routeOverlayCommandSnapshotRef.current =
          routeSceneRuntime.routeOverlayCommandAuthority.getSnapshot();
      }),
    [routeSceneRuntime.routeOverlayCommandAuthority]
  );
  const rootOverlaySessionSurfaceRuntime = useSearchRootOverlaySessionSurfaceRuntime({
    insetsTop: insets.top,
    insetsBottom: insets.bottom,
    routeOverlayVisibilityAuthority,
  });
  const rootSharedSheetRuntimeLane = useSearchRootMapRuntimeLane({
    startupPollBounds,
    rootPrimitivesRuntime,
    rootSessionCoreLane: sessionCoreLane,
    rootSessionPrimitivesLane: sessionPrimitivesLane,
  });
  const appRouteSharedSheetRuntimeOwner = useAppRouteSharedSheetRuntimeOwner();
  const rootOverlayStoreRuntime = useSearchRootOverlayStoreRuntime({
    routeOverlayIdentityAuthority,
  });
  const rootInstrumentationRuntime = useSearchRuntimeInstrumentationRuntime({
    getPerfNow: sessionPrimitivesLane.primitives.getPerfNow,
    searchMode: rootDataPlaneRuntime.runtimeFlags.searchMode,
    isSearchLoading: rootDataPlaneRuntime.runtimeFlags.isSearchLoading,
    resultsRequestKey: rootDataPlaneRuntime.resultsArrivalState.resultsRequestKey,
    searchInteractionRef: sessionPrimitivesLane.primitives.searchInteractionRef,
    searchRuntimeBus: sessionCoreLane.searchRuntimeBus,
    resultsPresentationAuthority: sessionCoreLane.resultsPresentationAuthority,
    resultsPresentationSurfaceAuthority: sessionCoreLane.resultsPresentationSurfaceAuthority,
    isSearchRequestLoadingRef: rootDataPlaneRuntime.runtimeFlags.isSearchRequestLoadingRef,
    readRuntimeMemoryDiagnostics: sessionPrimitivesLane.primitives.readRuntimeMemoryDiagnostics,
    isSearchSessionActive: rootDataPlaneRuntime.runtimeFlags.isSearchSessionActive,
    isAutocompleteSuppressed: rootPrimitivesRuntime.searchState.isAutocompleteSuppressed,
    rootOverlay: rootOverlayStoreRuntime.rootOverlay,
    activeOverlayKey: rootOverlayStoreRuntime.activeOverlayKey,
    cameraIntentArbiter: sessionCoreLane.cameraIntentArbiter,
    viewportBoundsService: sessionCoreLane.viewportBoundsService,
    markMapMovedIfNeeded: rootSharedSheetRuntimeLane.markMapMovedIfNeeded,
    scheduleMapIdleEnter: rootSharedSheetRuntimeLane.scheduleMapIdleEnter,
    ensureInitialCameraReady: sessionCoreLane.mapBootstrapRuntime.ensureInitialCameraReady,
    isSearchOverlay: rootOverlayStoreRuntime.isSearchOverlay,
    resultsPage: rootDataPlaneRuntime.resultsArrivalState.resultsPage,
  });
  // Memoised like every sibling assembly hook in this wave (F1348): this aggregate is
  // threaded into ~20 consumers, some of which take the whole object rather than a field
  // path — an unmemoised return handed a fresh identity to every one of them on every
  // render. `routeOverlaySessionSnapshot` (a materialized snapshot from the live getter on
  // `routeOverlaySessionSnapshotRef`) was dropped: no consumer read it — every call site
  // already reads the ref directly, which is the correct way to observe a value that can
  // change between this hook's renders.
  return React.useMemo(
    () => ({
      routeSceneRuntime,
      routeOverlaySessionSnapshotRef,
      routeOverlaySessionActions: routeSceneRuntime.routeOverlaySessionActions,
      routeOverlayCommandSnapshotRef,
      routeOverlayCommandActions: routeSceneRuntime.routeOverlayCommandActions,
      routeOverlayRouteCommandRuntime: routeSceneRuntime.routeOverlayRouteCommandRuntime,
      routeOverlayTransitionActions: routeSceneRuntime.routeOverlayTransitionActions,
      routeSheetSnapSessionActions: routeSceneRuntime.routeSheetSnapSessionActions,
      routeSearchCommandActions: routeSceneRuntime.routeSearchCommandActions,
      rootOverlaySessionSurfaceRuntime,
      rootSharedSheetRuntimeLane,
      appRouteSharedSheetRuntimeOwner,
      rootInstrumentationRuntime,
      rootOverlayStoreRuntime,
    }),
    [
      routeSceneRuntime,
      routeOverlaySessionSnapshotRef,
      routeOverlayCommandSnapshotRef,
      rootOverlaySessionSurfaceRuntime,
      rootSharedSheetRuntimeLane,
      appRouteSharedSheetRuntimeOwner,
      rootInstrumentationRuntime,
      rootOverlayStoreRuntime,
    ]
  );
};
