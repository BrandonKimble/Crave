import React from 'react';

import type {
  RouteOverlayPollsVisibilityAuthority,
  RouteOverlayVisibilityAuthority,
} from './route-authority-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import { useAppRouteResultsSheetRuntimeOwner } from '../../../../navigation/runtime/AppRouteResultsSheetRuntimeProvider';
import type { AppRouteOverlaySessionSnapshot } from '../../../../navigation/runtime/app-route-overlay-session-contract';
import type { AppRouteOverlayCommandSnapshot } from '../../../../navigation/runtime/app-route-overlay-command-controller';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';
import type { SearchRootSessionCoreLane } from './use-search-root-session-runtime-contract';
import { useSearchRootMapRuntimeLane } from './use-search-root-map-runtime-lane';
import { useSearchRootOverlaySessionSurfaceRuntime } from './use-search-root-overlay-session-surface-runtime';
import { useSearchRootOverlayStoreRuntime } from './use-search-root-overlay-store-runtime';
import { useSearchRootScaffoldInstrumentationRuntime } from './use-search-root-scaffold-instrumentation-runtime';
import type {
  SearchRootBootstrapEnvironment,
  SearchRootEnvironment,
} from './search-root-environment-contract';
import type { AppRouteSceneRuntime } from '../../../../navigation/runtime/app-route-scene-runtime';
import type { RouteOverlayPollsVisibilitySnapshot } from '../../../../navigation/runtime/route-overlay-display-snapshot-contract';
import type { SearchChromeScalarSurfaceRuntime } from '../native/search-chrome-scalar-surface-runtime';

const selectRouteOverlaySessionSnapshot = ({
  isSearchOverlay,
  isPersistentPollLane,
}: RouteOverlayPollsVisibilitySnapshot): AppRouteOverlaySessionSnapshot => ({
  isSearchOriginRestorePending: false,
  shouldShowDockedPollsTarget: isSearchOverlay && isPersistentPollLane,
  shouldShowDockedPolls: isSearchOverlay && isPersistentPollLane,
  shouldShowPollsSheet: isSearchOverlay && isPersistentPollLane,
});

const createRouteOverlaySessionSnapshotRef = (
  routeOverlayPollsVisibilityAuthority: RouteOverlayPollsVisibilityAuthority
): React.MutableRefObject<AppRouteOverlaySessionSnapshot> => {
  const ref = {} as React.MutableRefObject<AppRouteOverlaySessionSnapshot>;
  Object.defineProperty(ref, 'current', {
    configurable: false,
    enumerable: true,
    get: () =>
      selectRouteOverlaySessionSnapshot(routeOverlayPollsVisibilityAuthority.getSnapshot()),
    set: () => {},
  });
  return ref;
};

type UseSearchRootOverlayFoundationRuntimeArgs = Pick<SearchRootEnvironment, 'insets'> &
  Pick<SearchRootBootstrapEnvironment, 'startupPollBounds'> & {
    sessionCoreLane: SearchRootSessionCoreLane;
    routeSceneRuntime: AppRouteSceneRuntime;
    routeOverlayIdentityAuthority: AppRouteSceneRuntime['routeOverlayIdentityAuthority'];
    routeOverlayPollsVisibilityAuthority: RouteOverlayPollsVisibilityAuthority;
    routeOverlayVisibilityAuthority: RouteOverlayVisibilityAuthority;
    stateFoundationLane: SearchRootStateFoundationLane;
    searchChromeScalarSurfaceRuntime?: SearchChromeScalarSurfaceRuntime;
  };

export const useSearchRootOverlayFoundationRuntime = ({
  insets,
  startupPollBounds,
  sessionCoreLane,
  routeSceneRuntime,
  routeOverlayIdentityAuthority,
  routeOverlayPollsVisibilityAuthority,
  routeOverlayVisibilityAuthority,
  stateFoundationLane,
  searchChromeScalarSurfaceRuntime,
}: UseSearchRootOverlayFoundationRuntimeArgs): SearchRootOverlayFoundationRuntime => {
  const { rootPrimitivesRuntime, rootDataPlaneRuntime, sessionPrimitivesLane } =
    stateFoundationLane;
  const routeOverlaySessionSnapshotRef = React.useMemo(
    () => createRouteOverlaySessionSnapshotRef(routeOverlayPollsVisibilityAuthority),
    [routeOverlayPollsVisibilityAuthority]
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
  const rootResultsSheetRuntimeLane = useSearchRootMapRuntimeLane({
    startupPollBounds,
    rootPrimitivesRuntime,
    rootSessionCoreLane: sessionCoreLane,
    rootSessionPrimitivesLane: sessionPrimitivesLane,
    shouldShowPollsSheetRef: routeOverlaySessionSnapshotRef,
    searchChromeScalarSurfacePrimitiveSourceRuntime:
      searchChromeScalarSurfaceRuntime?.primitiveSourceRuntime,
  });
  const appRouteResultsSheetRuntimeOwner = useAppRouteResultsSheetRuntimeOwner();
  const rootOverlayStoreRuntime = useSearchRootOverlayStoreRuntime({
    routeOverlayIdentityAuthority,
  });
  const rootInstrumentationRuntime = useSearchRootScaffoldInstrumentationRuntime({
    rootPrimitivesRuntime,
    rootSessionCoreLane: sessionCoreLane,
    rootSessionPrimitivesLane: sessionPrimitivesLane,
    rootResultsSheetRuntimeLane,
    rootDataPlaneRuntime,
    rootOverlayStoreRuntime,
  });
  return {
    routeSceneRuntime,
    routeOverlaySessionSnapshot: routeOverlaySessionSnapshotRef.current,
    routeOverlaySessionSnapshotRef,
    routeOverlaySessionActions: routeSceneRuntime.routeOverlaySessionActions,
    routeOverlayCommandSnapshotRef,
    routeOverlayCommandActions: routeSceneRuntime.routeOverlayCommandActions,
    routeOverlayRouteCommandRuntime: routeSceneRuntime.routeOverlayRouteCommandRuntime,
    routeOverlayTransitionActions: routeSceneRuntime.routeOverlayTransitionActions,
    routeSheetSnapSessionActions: routeSceneRuntime.routeSheetSnapSessionActions,
    routeSearchCommandActions: routeSceneRuntime.routeSearchCommandActions,
    rootOverlaySessionSurfaceRuntime,
    rootResultsSheetRuntimeLane,
    appRouteResultsSheetRuntimeOwner,
    rootInstrumentationRuntime,
    rootOverlayStoreRuntime,
  };
};
