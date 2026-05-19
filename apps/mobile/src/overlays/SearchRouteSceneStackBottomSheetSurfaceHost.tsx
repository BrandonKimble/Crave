import React from 'react';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { BottomSheetSceneStackHost } from './BottomSheetSceneStackHost';
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
import { areAppRouteSheetHostSurfaceBodySnapshotsEqual } from '../navigation/runtime/app-route-sheet-host-surface-runtime-contract';
import type { AppRouteSceneStackSurfaceAuthority } from '../navigation/runtime/app-route-scene-stack-surface-contract';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';
import { useSearchOverlayProfilerRender } from './SearchOverlayProfilerContext';
import {
  finishSearchNavSwitchRuntimeAttributionSpan,
  startSearchNavSwitchRuntimeAttributionSpan,
} from '../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import { useSearchNavSwitchCommitAttribution } from '../screens/Search/runtime/shared/use-search-nav-switch-commit-attribution';
import { logPerfScenarioStackAttribution } from '../perf/perf-scenario-attribution';

type SearchRouteSceneStackBottomSheetSurfaceHostProps = {
  sceneStackSurfaceAuthority: AppRouteSceneStackSurfaceAuthority;
  routeSceneDisplayTargetRegistry: AppRouteSceneDisplayTargetRegistry;
  routeSheetRuntimeConfigAuthority: AppRouteSheetHostRuntimeConfigAuthority;
  routeSheetSurfaceBodyAuthority: AppRouteSheetHostSurfaceBodyAuthority;
};

type RenderableAppRouteSheetHostSurfaceBodySnapshot = AppRouteSheetHostSurfaceBodySnapshot & {
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
): boolean => {
  if (left === right) {
    return true;
  }
  if (left == null || right == null) {
    logPerfScenarioStackAttribution({
      owner: 'sheet_surface_body_snapshot_selector_diff',
      path: 'field:renderablePresence',
      details: {
        leftPresent: left != null,
        rightPresent: right != null,
      },
    });
    return false;
  }

  if (areAppRouteSheetHostSurfaceBodySnapshotsEqual(left, right)) {
    return true;
  }

  const changedFields: string[] = [];
  if (left.chromeEntry !== right.chromeEntry) {
    changedFields.push('chromeEntry');
  }
  if (left.scrollSharedRuntimeEntry !== right.scrollSharedRuntimeEntry) {
    changedFields.push('scrollSharedRuntimeEntry');
  }
  if (left.scrollBodyDefaultsEntry !== right.scrollBodyDefaultsEntry) {
    changedFields.push('scrollBodyDefaultsEntry');
  }
  if (left.motionStateEntry !== right.motionStateEntry) {
    changedFields.push('motionStateEntry');
  }
  if (left.motionCallbacksEntry !== right.motionCallbacksEntry) {
    changedFields.push('motionCallbacksEntry');
  }

  if (changedFields.length === 0) {
    return true;
  }

  logPerfScenarioStackAttribution({
    owner: 'sheet_surface_body_snapshot_selector_diff',
    path: `fields:${changedFields.join('|')}`,
    details: {
      activeSceneKey: right.activeSceneKey,
      hasRenderableSheetSurface: right.hasRenderableSheetSurface,
      visible: right.motionStateEntry.visible,
      initialSnapPoint: right.motionStateEntry.initialSnapPoint,
    },
  });
  return false;
};

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
    const touchBlockingEnabled = touchBlockingAuthority.getSnapshot();

    const interactionGate = (
      <Animated.View
        pointerEvents={touchBlockingEnabled ? 'none' : 'box-none'}
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

type SearchRouteSceneStackBottomSheetRuntimeSurfaceProps = Omit<
  SearchRouteSceneStackBottomSheetSurfaceHostProps,
  'routeSheetSurfaceBodyAuthority'
> & {
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

    const sceneStackBottomSheetSurface = (
      <SearchRouteSceneStackBottomSheetInteractionGate
        touchBlockingAuthority={runtimeAssembly.touchBlockingAuthority}
        sheetViewStyle={runtimeAssembly.sheetViewStyle}
      >
        <GestureDetector gesture={runtimeAssembly.sheetGesture}>
          <BottomSheetSceneStackHost
            sceneStackSurfaceAuthority={sceneStackSurfaceAuthority}
            routeSceneDisplayTargetRegistry={routeSceneDisplayTargetRegistry}
            shadowShellStyle={runtimeAssembly.shadowShellStyle}
            surfaceStyle={runtimeAssembly.surfaceStyle}
            scrollHeaderComponent={null}
            onHeaderLayout={runtimeAssembly.onHeaderLayout}
            onScrollHeaderLayout={runtimeAssembly.onScrollHeaderLayout}
            scrollHeaderSyncStyle={runtimeAssembly.scrollHeaderSyncStyle}
            displayedSceneKey={surfaceBodySnapshot.displayedSceneKey}
            bodyRuntimeAuthority={runtimeAssembly.bodyRuntimeAuthority}
            sheetYValue={runtimeAssembly.sheetYValue}
          />
        </GestureDetector>
      </SearchRouteSceneStackBottomSheetInteractionGate>
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
    const surfaceBodySnapshot = useRouteAuthoritySelector<
      AppRouteSheetHostSurfaceBodySnapshot,
      RenderableAppRouteSheetHostSurfaceBodySnapshot | null
    >({
      subscribe: React.useCallback(
        (listener: () => void) => routeSheetSurfaceBodyAuthority.subscribe(listener),
        [routeSheetSurfaceBodyAuthority]
      ),
      subscribeSelector: routeSheetSurfaceBodyAuthority.subscribeSelector,
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
      <React.Profiler id="SearchRouteSceneStackBottomSheetSurfaceHost" onRender={onProfilerRender}>
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
