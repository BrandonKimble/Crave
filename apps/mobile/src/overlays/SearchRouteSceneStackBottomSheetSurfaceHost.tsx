import React from 'react';

import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { BottomSheetSceneStackHost } from './BottomSheetSceneStackHost';
import { SearchResultsHeaderChromeSurfaceHost } from './SearchResultsHeaderChromeAuthority';
import {
  type SearchRouteSceneStackBottomSheetRuntimeAssembly,
  useSearchRouteSceneStackBottomSheetRuntimeAssembly,
} from './useSearchRouteSceneStackBottomSheetRuntimeAssembly';
import type { AppRouteSceneDisplayTargetRegistry } from '../navigation/runtime/app-route-scene-display-target-registry';
import type {
  AppRouteSheetHostRuntimeConfigAuthority,
  AppRouteSheetHostSurfaceBodyAuthority,
  AppRouteSheetHostSurfaceBodySnapshot,
} from '../navigation/runtime/app-route-sheet-host-surface-runtime-contract';
import type { AppRouteSceneStackSurfaceAuthority } from '../navigation/runtime/app-route-scene-stack-surface-contract';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';
import { useSearchOverlayProfilerRender } from './SearchOverlayProfilerContext';
import {
  finishSearchNavSwitchRuntimeAttributionSpan,
  startSearchNavSwitchRuntimeAttributionSpan,
} from '../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import { useSearchNavSwitchCommitAttribution } from '../screens/Search/runtime/shared/use-search-nav-switch-commit-attribution';

type SearchRouteSceneStackBottomSheetSurfaceHostProps = {
  sceneStackSurfaceAuthority: AppRouteSceneStackSurfaceAuthority;
  routeSceneDisplayTargetRegistry: AppRouteSceneDisplayTargetRegistry;
  routeSheetRuntimeConfigAuthority: AppRouteSheetHostRuntimeConfigAuthority;
  routeSheetSurfaceBodyAuthority: AppRouteSheetHostSurfaceBodyAuthority;
};

type RenderableAppRouteSheetHostSurfaceBodySnapshot =
  AppRouteSheetHostSurfaceBodySnapshot & {
    chromeEntry: NonNullable<AppRouteSheetHostSurfaceBodySnapshot['chromeEntry']>;
    scrollSharedRuntimeEntry: NonNullable<
      AppRouteSheetHostSurfaceBodySnapshot['scrollSharedRuntimeEntry']
    >;
    scrollBodyDefaultsEntry: NonNullable<
      AppRouteSheetHostSurfaceBodySnapshot['scrollBodyDefaultsEntry']
    >;
    motionStateEntry: NonNullable<AppRouteSheetHostSurfaceBodySnapshot['motionStateEntry']>;
  };

const isRenderableSurfaceBodySnapshot = (
  snapshot: AppRouteSheetHostSurfaceBodySnapshot
): snapshot is RenderableAppRouteSheetHostSurfaceBodySnapshot =>
  snapshot.hasRenderableSheetSurface &&
  snapshot.chromeEntry != null &&
  snapshot.scrollSharedRuntimeEntry != null &&
  snapshot.scrollBodyDefaultsEntry != null &&
  snapshot.motionStateEntry != null;

const selectRenderableSurfaceBodySnapshot = (
  snapshot: AppRouteSheetHostSurfaceBodySnapshot
): RenderableAppRouteSheetHostSurfaceBodySnapshot | null =>
  isRenderableSurfaceBodySnapshot(snapshot) ? snapshot : null;

const areRenderableSurfaceBodySnapshotsEqual = (
  left: RenderableAppRouteSheetHostSurfaceBodySnapshot | null,
  right: RenderableAppRouteSheetHostSurfaceBodySnapshot | null
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.chromeEntry === right.chromeEntry &&
    left.scrollSharedRuntimeEntry === right.scrollSharedRuntimeEntry &&
    left.scrollBodyDefaultsEntry === right.scrollBodyDefaultsEntry &&
    left.motionStateEntry === right.motionStateEntry &&
    left.motionCallbacksEntry === right.motionCallbacksEntry);

const SearchRouteSceneStackBottomSheetInteractionGate = React.memo(
  ({
    touchBlockingAuthority,
    sheetViewStyle,
    children,
  }: React.PropsWithChildren<{
    touchBlockingAuthority: SearchRouteSceneStackBottomSheetRuntimeAssembly['touchBlockingAuthority'];
    sheetViewStyle: SearchRouteSceneStackBottomSheetRuntimeAssembly['sheetViewStyle'];
  }>) => {
    useSearchNavSwitchCommitAttribution('SearchRouteSceneStackBottomSheetInteractionGate');
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const touchBlockingEnabled = useRouteAuthoritySelector<boolean, boolean>({
      subscribe: React.useCallback(
        (listener: () => void) => touchBlockingAuthority.subscribe(listener),
        [touchBlockingAuthority]
      ),
      getSnapshot: touchBlockingAuthority.getSnapshot,
      selector: React.useCallback((snapshot: boolean) => snapshot, []),
      isEqual: Object.is,
      attributionOwner: 'SearchRouteSceneStackBottomSheetInteractionGate',
      attributionOperation: 'touchBlockingSelector',
    });

    const interactionGate = (
      <Animated.View
        pointerEvents={touchBlockingEnabled ? 'none' : 'auto'}
        style={sheetViewStyle}
      >
        {children}
      </Animated.View>
    );

    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'SearchRouteSceneStackBottomSheetInteractionGate',
      operation: 'render',
      startedAtMs: renderStartedAtMs,
    });

    return interactionGate;
  }
);

type SearchRouteSceneStackBottomSheetRuntimeSurfaceProps =
  Omit<SearchRouteSceneStackBottomSheetSurfaceHostProps, 'routeSheetSurfaceBodyAuthority'> & {
    surfaceBodySnapshot: RenderableAppRouteSheetHostSurfaceBodySnapshot;
  };

const SearchRouteSceneStackBottomSheetRuntimeSurface = React.memo(
  ({
    sceneStackSurfaceAuthority,
    routeSceneDisplayTargetRegistry,
    routeSheetRuntimeConfigAuthority,
    surfaceBodySnapshot,
  }: SearchRouteSceneStackBottomSheetRuntimeSurfaceProps) => {
    useSearchNavSwitchCommitAttribution('SearchRouteSceneStackBottomSheetRuntimeSurface');
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    const runtimeAssembly = useSearchRouteSceneStackBottomSheetRuntimeAssembly({
      surfaceBodySnapshot,
      routeSheetRuntimeConfigAuthority,
    });
    const fixedHeaderComponent = React.useMemo(
      () => (
        <SearchResultsHeaderChromeSurfaceHost
          routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
          onHeaderLayout={runtimeAssembly.onHeaderLayout}
        />
      ),
      [routeSceneDisplayTargetRegistry, runtimeAssembly.onHeaderLayout]
    );

    const sceneStackBottomSheetSurface = (
      <GestureDetector gesture={runtimeAssembly.sheetGesture}>
        <SearchRouteSceneStackBottomSheetInteractionGate
          touchBlockingAuthority={runtimeAssembly.touchBlockingAuthority}
          sheetViewStyle={runtimeAssembly.sheetViewStyle}
        >
          <BottomSheetSceneStackHost
            sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
            routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
            shadowShellStyle={runtimeAssembly.shadowShellStyle}
            surfaceStyle={runtimeAssembly.surfaceStyle}
            fixedHeaderComponent={fixedHeaderComponent}
            scrollHeaderComponent={null}
            onHeaderLayout={runtimeAssembly.onHeaderLayout}
            onScrollHeaderLayout={runtimeAssembly.onScrollHeaderLayout}
            scrollHeaderSyncStyle={runtimeAssembly.scrollHeaderSyncStyle}
            bodyRuntimeAuthority={runtimeAssembly.bodyRuntimeAuthority}
          />
        </SearchRouteSceneStackBottomSheetInteractionGate>
      </GestureDetector>
    );

    if (!onProfilerRender) {
      finishSearchNavSwitchRuntimeAttributionSpan({
        owner: 'SearchRouteSceneStackBottomSheetRuntimeSurface',
        operation: 'render',
        startedAtMs: renderStartedAtMs,
      });
      return sceneStackBottomSheetSurface;
    }

    const profiledSceneStackBottomSheetSurface = (
      <React.Profiler
        id="SearchRouteSceneStackBottomSheetRuntimeSurface"
        onRender={onProfilerRender}
      >
        {sceneStackBottomSheetSurface}
      </React.Profiler>
    );

    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'SearchRouteSceneStackBottomSheetRuntimeSurface',
      operation: 'render',
      startedAtMs: renderStartedAtMs,
    });

    return profiledSceneStackBottomSheetSurface;
  }
);

export const SearchRouteSceneStackBottomSheetSurfaceHost = React.memo(
  ({
    sceneStackSurfaceAuthority,
    routeSceneDisplayTargetRegistry,
    routeSheetRuntimeConfigAuthority,
    routeSheetSurfaceBodyAuthority,
  }: SearchRouteSceneStackBottomSheetSurfaceHostProps) => {
    useSearchNavSwitchCommitAttribution('SearchRouteSceneStackBottomSheetSurfaceHost');
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    const surfaceBodySnapshot = useRouteAuthoritySelector({
      subscribe: React.useCallback(
        (listener: () => void) => routeSheetSurfaceBodyAuthority.subscribe(listener),
        [routeSheetSurfaceBodyAuthority]
      ),
      getSnapshot: routeSheetSurfaceBodyAuthority.getSnapshot,
      selector: selectRenderableSurfaceBodySnapshot,
      isEqual: areRenderableSurfaceBodySnapshotsEqual,
      attributionOwner: 'SearchRouteSceneStackBottomSheetSurfaceHost',
      attributionOperation: 'sheetRuntimePresenceSelector',
    });

    if (surfaceBodySnapshot == null) {
      finishSearchNavSwitchRuntimeAttributionSpan({
        owner: 'SearchRouteSceneStackBottomSheetSurfaceHost',
        operation: 'renderEmpty',
        startedAtMs: renderStartedAtMs,
      });
      return null;
    }

    const sceneStackBottomSheetSurface = (
      <SearchRouteSceneStackBottomSheetRuntimeSurface
        sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
        routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
        routeSheetRuntimeConfigAuthority={routeSheetRuntimeConfigAuthority}
        surfaceBodySnapshot={surfaceBodySnapshot}
      />
    );

    if (!onProfilerRender) {
      finishSearchNavSwitchRuntimeAttributionSpan({
        owner: 'SearchRouteSceneStackBottomSheetSurfaceHost',
        operation: 'render',
        startedAtMs: renderStartedAtMs,
      });
      return sceneStackBottomSheetSurface;
    }

    const profiledSceneStackBottomSheetSurface = (
      <React.Profiler
        id="SearchRouteSceneStackBottomSheetSurfaceHost"
        onRender={onProfilerRender}
      >
        {sceneStackBottomSheetSurface}
      </React.Profiler>
    );

    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'SearchRouteSceneStackBottomSheetSurfaceHost',
      operation: 'render',
      startedAtMs: renderStartedAtMs,
    });

    return profiledSceneStackBottomSheetSurface;
  }
);
