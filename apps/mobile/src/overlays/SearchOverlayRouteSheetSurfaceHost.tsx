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

type SearchOverlayRouteSheetSurfaceHostProps = {
  routeSheetHostRuntime: AppRouteSheetHostRuntime;
};

const SearchOverlayRouteSheetFrameSurfaceHost = React.memo(
  ({ routeSheetHostRuntime }: SearchOverlayRouteSheetSurfaceHostProps) => {
    useSearchNavSwitchCommitAttribution('SearchOverlayRouteSheetFrameSurfaceHost');
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    const frameSurface = (
      <SearchRouteSheetFrameHost
        routeSheetSurfaceFrameAuthority={routeSheetHostRuntime.routeSheetSurfaceFrameAuthority}
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
      getSnapshot: routeSheetHostRuntime.routeSheetSurfaceAuthority.getSnapshot,
      selector: React.useCallback((snapshot) => snapshot.shouldRenderSceneStackSurface, []),
      isEqual: Object.is,
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
  }
);
