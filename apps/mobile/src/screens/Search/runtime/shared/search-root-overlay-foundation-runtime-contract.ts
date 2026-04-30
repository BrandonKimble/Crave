import type React from 'react';

import type { AppRouteResultsSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-results-sheet-runtime-contract';
import type {
  AppRouteOverlaySessionActions,
  AppRouteOverlaySessionSnapshot,
} from '../../../../navigation/runtime/app-route-overlay-session-contract';
import type {
  AppRouteOverlayCommandActions,
  AppRouteOverlayCommandSnapshot,
} from '../../../../navigation/runtime/app-route-overlay-command-controller';
import type { AppRouteSceneRuntime } from '../../../../navigation/runtime/app-route-scene-runtime';
import type {
  SearchRootInstrumentationRuntime,
  SearchOverlayStoreRuntime,
  SearchRootOverlaySessionSurfaceRuntime,
  SearchRootResultsSheetRuntimeLane,
} from './search-root-scaffold-runtime-contract';

export type SearchRootOverlayFoundationRuntime = {
  routeSceneRuntime: AppRouteSceneRuntime;
  routeOverlaySessionSnapshot: AppRouteOverlaySessionSnapshot;
  routeOverlaySessionSnapshotRef: React.MutableRefObject<AppRouteOverlaySessionSnapshot>;
  routeOverlaySessionActions: AppRouteOverlaySessionActions;
  routeOverlayCommandSnapshotRef: React.MutableRefObject<AppRouteOverlayCommandSnapshot>;
  routeOverlayCommandActions: AppRouteOverlayCommandActions;
  routeOverlayRouteCommandRuntime: AppRouteSceneRuntime['routeOverlayRouteCommandRuntime'];
  routeOverlayTransitionActions: AppRouteSceneRuntime['routeOverlayTransitionActions'];
  routeSheetSnapSessionActions: AppRouteSceneRuntime['routeSheetSnapSessionActions'];
  routeSearchCommandActions: AppRouteSceneRuntime['routeSearchCommandActions'];
  rootOverlaySessionSurfaceRuntime: SearchRootOverlaySessionSurfaceRuntime;
  rootResultsSheetRuntimeLane: SearchRootResultsSheetRuntimeLane;
  appRouteResultsSheetRuntimeOwner: AppRouteResultsSheetRuntimeOwner;
  rootInstrumentationRuntime: SearchRootInstrumentationRuntime;
  rootOverlayStoreRuntime: SearchOverlayStoreRuntime;
};
