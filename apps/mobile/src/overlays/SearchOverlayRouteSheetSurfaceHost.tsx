import React from 'react';

import type { AppRouteSheetHostRuntime } from '../navigation/runtime/app-route-sheet-host-runtime-contract';
import type { AppRouteSheetHostSurfaceSnapshot } from '../navigation/runtime/app-route-sheet-host-surface-runtime-contract';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';
import type { SearchInteractionState } from '../screens/Search/context/SearchInteractionContext';
import { SearchInteractionProvider } from '../screens/Search/context/SearchInteractionContext';
import { SearchRouteSheetFrameHost } from './SearchRouteSheetFrameHost';
import { SearchRouteSceneStackBottomSheetSurfaceHost } from './SearchRouteSceneStackBottomSheetSurfaceHost';
import { useSearchOverlayProfilerRender } from './SearchOverlayProfilerContext';
import {
  finishSearchNavSwitchRuntimeAttributionSpan,
  startSearchNavSwitchRuntimeAttributionSpan,
} from '../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import { useSearchNavSwitchCommitAttribution } from '../screens/Search/runtime/shared/use-search-nav-switch-commit-attribution';
import { logPerfScenarioStackAttribution } from '../perf/perf-scenario-attribution';

type SearchOverlayRouteSheetSurfaceHostProps = {
  routeSheetHostRuntime: AppRouteSheetHostRuntime;
};

const areRouteSheetSurfaceSelectionsEqual = (left: boolean, right: boolean): boolean => {
  if (left === right) {
    return true;
  }
  logPerfScenarioStackAttribution({
    owner: 'search_overlay_route_sheet_surface_selector_diff',
    path: 'field:shouldRenderSceneStackSurface',
    details: {
      left,
      right,
    },
  });
  return false;
};

const markRouteSheetHostRuntimePropDiff = (
  owner: string,
  field: string,
  left: unknown,
  right: unknown
): void => {
  if (Object.is(left, right)) {
    return;
  }
  logPerfScenarioStackAttribution({
    owner,
    path: `field:${field}`,
  });
};

const markRouteSheetHostRuntimePropDiffs = (
  owner: string,
  left: AppRouteSheetHostRuntime,
  right: AppRouteSheetHostRuntime
): void => {
  markRouteSheetHostRuntimePropDiff(owner, 'routeSheetHostRuntimeRef', left, right);
  markRouteSheetHostRuntimePropDiff(
    owner,
    'searchInteractionRef',
    left.searchInteractionRef,
    right.searchInteractionRef
  );
  markRouteSheetHostRuntimePropDiff(
    owner,
    'routeSheetSurfaceAuthority',
    left.routeSheetSurfaceAuthority,
    right.routeSheetSurfaceAuthority
  );
  markRouteSheetHostRuntimePropDiff(
    owner,
    'routeSheetSurfaceBodyAuthority',
    left.routeSheetSurfaceBodyAuthority,
    right.routeSheetSurfaceBodyAuthority
  );
  markRouteSheetHostRuntimePropDiff(
    owner,
    'routeSheetMotionRuntimeAuthority',
    left.routeSheetMotionRuntimeAuthority,
    right.routeSheetMotionRuntimeAuthority
  );
  markRouteSheetHostRuntimePropDiff(
    owner,
    'routeSheetSurfaceFrameAuthority',
    left.routeSheetSurfaceFrameAuthority,
    right.routeSheetSurfaceFrameAuthority
  );
  markRouteSheetHostRuntimePropDiff(
    owner,
    'routeSheetRuntimeConfigAuthority',
    left.routeSheetRuntimeConfigAuthority,
    right.routeSheetRuntimeConfigAuthority
  );
  markRouteSheetHostRuntimePropDiff(
    owner,
    'sceneStackSurfaceAuthority',
    left.sceneStackSurfaceAuthority,
    right.sceneStackSurfaceAuthority
  );
	  markRouteSheetHostRuntimePropDiff(
	    owner,
	    'routeSceneDisplayTargetRegistry',
	    left.routeSceneDisplayTargetRegistry,
	    right.routeSceneDisplayTargetRegistry
	  );
	  markRouteSheetHostRuntimePropDiff(
	    owner,
	    'routeHostVisualRuntimeAuthority',
	    left.routeHostVisualRuntimeAuthority,
	    right.routeHostVisualRuntimeAuthority
	  );
	};

const SearchOverlayRouteSheetFrameSurfaceHost = React.memo(
  ({ routeSheetHostRuntime }: SearchOverlayRouteSheetSurfaceHostProps) => {
    useSearchNavSwitchCommitAttribution('SearchOverlayRouteSheetFrameSurfaceHost');
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    const frameSurface = (
      <SearchRouteSheetFrameHost
        routeHostVisualRuntimeAuthority={routeSheetHostRuntime.routeHostVisualRuntimeAuthority}
      >
        <SearchRouteSceneStackBottomSheetSurfaceHost
          sceneStackSurfaceAuthority={routeSheetHostRuntime.sceneStackSurfaceAuthority}
          routeSceneDisplayTargetRegistry={routeSheetHostRuntime.routeSceneDisplayTargetRegistry}
          routeSheetSurfaceBodyAuthority={routeSheetHostRuntime.routeSheetSurfaceBodyAuthority}
          routeSheetRuntimeConfigAuthority={
            routeSheetHostRuntime.routeSheetRuntimeConfigAuthority
          }
        />
      </SearchRouteSheetFrameHost>
    );

    const profiledFrameSurface = onProfilerRender ? (
      <React.Profiler
        id="SearchOverlayRouteSheetFrameSurfaceHost"
        onRender={onProfilerRender}
      >
        {frameSurface}
      </React.Profiler>
    ) : (
      frameSurface
    );

    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'SearchOverlayRouteSheetFrameSurfaceHost',
      operation: 'render',
      startedAtMs: renderStartedAtMs,
    });

    return profiledFrameSurface;
  },
  (previousProps, nextProps) => {
    markRouteSheetHostRuntimePropDiffs(
      'search_overlay_route_sheet_frame_surface_host_props_diff',
      previousProps.routeSheetHostRuntime,
      nextProps.routeSheetHostRuntime
    );
    return previousProps.routeSheetHostRuntime === nextProps.routeSheetHostRuntime;
  }
);

export const SearchOverlayRouteSheetSurfaceHost = React.memo(
  ({ routeSheetHostRuntime }: SearchOverlayRouteSheetSurfaceHostProps) => {
    useSearchNavSwitchCommitAttribution('SearchOverlayRouteSheetSurfaceHost');
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    const searchInteractionProviderValue = React.useMemo<SearchInteractionState>(
      () => ({
        interactionRef: routeSheetHostRuntime.searchInteractionRef,
      }),
      [routeSheetHostRuntime.searchInteractionRef]
    );
    const surfaceSnapshot = useRouteAuthoritySelector<
      AppRouteSheetHostSurfaceSnapshot,
      boolean
    >({
      subscribe: React.useCallback(
        (listener: () => void) =>
          routeSheetHostRuntime.routeSheetSurfaceAuthority.subscribe(listener),
        [routeSheetHostRuntime.routeSheetSurfaceAuthority]
      ),
      subscribeSelector: routeSheetHostRuntime.routeSheetSurfaceAuthority.subscribeSelector,
      getSnapshot: routeSheetHostRuntime.routeSheetSurfaceAuthority.getSnapshot,
      selector: React.useCallback((snapshot) => snapshot.shouldRenderSceneStackSurface, []),
      isEqual: areRouteSheetSurfaceSelectionsEqual,
      attributionOwner: 'SearchOverlayRouteSheetSurfaceHost',
      attributionOperation: 'surfaceSelector',
    });
    const shouldRenderSceneStackSurface = surfaceSnapshot;

    const sheetSurface = shouldRenderSceneStackSurface ? (
      <SearchInteractionProvider value={searchInteractionProviderValue}>
        <SearchOverlayRouteSheetFrameSurfaceHost routeSheetHostRuntime={routeSheetHostRuntime} />
      </SearchInteractionProvider>
    ) : null;

    if (!shouldRenderSceneStackSurface) {
      finishSearchNavSwitchRuntimeAttributionSpan({
        owner: 'SearchOverlayRouteSheetSurfaceHost',
        operation: 'renderEmpty',
        startedAtMs: renderStartedAtMs,
      });
      return sheetSurface;
    }

    if (!onProfilerRender) {
      finishSearchNavSwitchRuntimeAttributionSpan({
        owner: 'SearchOverlayRouteSheetSurfaceHost',
        operation: 'render',
        startedAtMs: renderStartedAtMs,
      });
      return sheetSurface;
    }

    const profiledSheetSurface = (
      <React.Profiler id="SearchOverlayRouteSheetSurfaceHost" onRender={onProfilerRender}>
        {sheetSurface}
      </React.Profiler>
    );

    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'SearchOverlayRouteSheetSurfaceHost',
      operation: 'render',
      startedAtMs: renderStartedAtMs,
    });

    return profiledSheetSurface;
  },
  (previousProps, nextProps) => {
    markRouteSheetHostRuntimePropDiffs(
      'search_overlay_route_sheet_surface_host_props_diff',
      previousProps.routeSheetHostRuntime,
      nextProps.routeSheetHostRuntime
    );
    return previousProps.routeSheetHostRuntime === nextProps.routeSheetHostRuntime;
  }
);
