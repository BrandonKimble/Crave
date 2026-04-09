import type { SearchRootMapArgs } from './search-root-render-runtime-contract';
import type { SearchMapRuntime } from './use-search-map-runtime';
import type { SearchRootActionLanes } from './search-root-action-runtime-contract';
import type { SearchRootPrimitivesRuntime } from './use-search-root-primitives-runtime';
import type { SearchRootProfileActionRuntime } from './use-search-root-profile-action-runtime';
import type { SearchRootRequestLaneRuntime } from './use-search-root-request-lane-runtime';
import type { SearchRootScaffoldRuntime } from './use-search-root-scaffold-runtime';
import type { SearchRootSessionRuntime } from './use-search-root-session-runtime-contract';

export type UseSearchRootMapRenderStatePublicationArgsRuntimeArgs = {
  accessToken: SearchRootMapArgs['accessToken'];
  startupLocationSnapshot: SearchRootMapArgs['userLocationSnapshot'];
  userLocation: SearchRootMapArgs['userLocation'];
  rootSessionRuntime: SearchRootSessionRuntime;
  rootPrimitivesRuntime: SearchRootPrimitivesRuntime;
  restaurantSelectionModel: SearchRootProfileActionRuntime['restaurantSelectionModel'];
} & Pick<SearchRootActionLanes, 'sessionActionRuntime'>;

export type SearchRootMapRenderStatePublicationArgsRuntime = {
  rootRenderArgs: {
    mapArgs: Omit<
      SearchRootMapArgs,
      | 'mapGestureActiveRef'
      | 'mapMotionPressureController'
      | 'shouldLogSearchComputes'
      | 'getPerfNow'
      | 'logSearchCompute'
      | 'mapQueryBudget'
      | 'pendingMarkerOpenAnimationFrameRef'
      | 'onRuntimeMechanismEvent'
      | 'onPress'
      | 'onTouchStart'
      | 'onTouchEnd'
      | 'onNativeViewportChanged'
      | 'onMapIdle'
      | 'onCameraAnimationComplete'
      | 'onMapLoaded'
      | 'onExecutionBatchMountedHidden'
      | 'onMarkerEnterStarted'
      | 'onMarkerEnterSettled'
      | 'onMarkerExitStarted'
      | 'onMarkerExitSettled'
      | 'onProfilerRender'
    >;
  };
};

export type UseSearchRootMapRenderHandlersPublicationArgsRuntimeArgs = {
  rootSessionRuntime: SearchRootSessionRuntime;
  rootScaffoldRuntime: SearchRootScaffoldRuntime;
  requestLaneRuntime: SearchRootRequestLaneRuntime;
  mapRuntime: SearchMapRuntime;
  pendingMarkerOpenAnimationFrameRef: SearchRootMapArgs['pendingMarkerOpenAnimationFrameRef'];
};

export type SearchRootMapRenderHandlersPublicationArgsRuntime = {
  rootRenderArgs: {
    mapArgs: Pick<
      SearchRootMapArgs,
      | 'mapGestureActiveRef'
      | 'mapMotionPressureController'
      | 'shouldLogSearchComputes'
      | 'getPerfNow'
      | 'logSearchCompute'
      | 'mapQueryBudget'
      | 'pendingMarkerOpenAnimationFrameRef'
      | 'onRuntimeMechanismEvent'
      | 'onPress'
      | 'onTouchStart'
      | 'onTouchEnd'
      | 'onNativeViewportChanged'
      | 'onMapIdle'
      | 'onCameraAnimationComplete'
      | 'onMapLoaded'
      | 'onExecutionBatchMountedHidden'
      | 'onMarkerEnterStarted'
      | 'onMarkerEnterSettled'
      | 'onMarkerExitStarted'
      | 'onMarkerExitSettled'
      | 'onProfilerRender'
    >;
  };
};
