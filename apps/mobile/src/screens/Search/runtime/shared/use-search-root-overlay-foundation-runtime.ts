import React from 'react';

import type { RouteOverlayVisibilityAuthority } from './route-authority-contract';
import type { SearchRootOverlayFoundationRuntime } from './search-root-overlay-foundation-runtime-contract';
import { useAppRouteSharedSheetRuntimeOwner } from '../../../../navigation/runtime/AppRouteSharedSheetRuntimeProvider';
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
import type { PresentationFrame } from '../../../../navigation/runtime/app-route-presentation-frame-contract';
import type { SearchChromeScalarSurfaceRuntime } from '../native/search-chrome-scalar-surface-runtime';

// Thin adapter over the committed PresentationFrame (page-switch-master-plan.md §9.2 site 5):
// the docked-polls decision is read from the frame's laneKind — the old parallel
// `isSearchOverlay && isPersistentPollLane` re-derivation off the polls-visibility snapshot is
// the same formula (laneKind==='docked-polls' already requires the search root), now sourced
// from the one writer. Consumers of the session-snapshot shape are unchanged.
const selectRouteOverlaySessionSnapshot = (
  frame: PresentationFrame
): AppRouteOverlaySessionSnapshot => {
  const isDockedPollsLane = frame.laneKind === 'docked-polls';
  return {
    shouldShowDockedPollsTarget: isDockedPollsLane,
    shouldShowDockedPolls: isDockedPollsLane,
    shouldShowPollsSheet: isDockedPollsLane,
  };
};

const createRouteOverlaySessionSnapshotRef = (
  routeSceneSwitchRuntime: AppRouteSceneRuntime['routeSceneSwitchRuntime']
): React.MutableRefObject<AppRouteOverlaySessionSnapshot> => {
  const ref = {} as React.MutableRefObject<AppRouteOverlaySessionSnapshot>;
  Object.defineProperty(ref, 'current', {
    configurable: false,
    enumerable: true,
    get: () => selectRouteOverlaySessionSnapshot(routeSceneSwitchRuntime.getPresentationFrame()),
    set: () => {},
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
    searchChromeScalarSurfaceRuntime?: SearchChromeScalarSurfaceRuntime;
  };

export const useSearchRootOverlayFoundationRuntime = ({
  insets,
  startupPollBounds,
  sessionCoreLane,
  routeSceneRuntime,
  routeOverlayIdentityAuthority,
  routeOverlayVisibilityAuthority,
  stateFoundationLane,
  searchChromeScalarSurfaceRuntime,
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
    searchChromeScalarSurfacePrimitiveSourceRuntime:
      searchChromeScalarSurfaceRuntime?.primitiveSourceRuntime,
  });
  const appRouteSharedSheetRuntimeOwner = useAppRouteSharedSheetRuntimeOwner();
  const rootOverlayStoreRuntime = useSearchRootOverlayStoreRuntime({
    routeOverlayIdentityAuthority,
  });
  const rootInstrumentationRuntime = useSearchRootScaffoldInstrumentationRuntime({
    rootPrimitivesRuntime,
    rootSessionCoreLane: sessionCoreLane,
    rootSessionPrimitivesLane: sessionPrimitivesLane,
    rootSharedSheetRuntimeLane,
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
    rootSharedSheetRuntimeLane,
    appRouteSharedSheetRuntimeOwner,
    rootInstrumentationRuntime,
    rootOverlayStoreRuntime,
  };
};
