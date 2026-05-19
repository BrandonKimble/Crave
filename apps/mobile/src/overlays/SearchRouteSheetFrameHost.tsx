import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Reanimated, { useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated';

import {
  APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE,
  type AppRouteNavSilhouetteSheetExclusionModeValue,
} from '../navigation/runtime/app-route-nav-silhouette-authority';
import type {
  RouteHostVisualRuntime,
  RouteHostVisualRuntimeAuthority,
} from '../navigation/runtime/route-host-visual-runtime-state-controller';
import { OVERLAY_STACK_ZINDEX } from './overlaySheetStyles';
import { useSearchOverlayProfilerRender } from './SearchOverlayProfilerContext';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';
import {
  finishSearchNavSwitchRuntimeAttributionSpan,
  startSearchNavSwitchRuntimeAttributionSpan,
} from '../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import { useSearchNavSwitchCommitAttribution } from '../screens/Search/runtime/shared/use-search-nav-switch-commit-attribution';
import { getSearchStartupGeometrySeed } from '../screens/Search/runtime/shared/search-startup-geometry';
import { AnimatedSearchRouteSheetNavExclusionMaskNativeView } from './SearchRouteSheetNavExclusionMaskNativeView';

type SheetMaskRuntime = {
  exclusionModeValue: { value: AppRouteNavSilhouetteSheetExclusionModeValue };
  navBarHeight: number;
  navBarTop: number;
  bottomNavHiddenTranslateY: number;
  navTranslateY: { value: number };
};

const isPersistentNavBodyExclusionMode = (
  modeValue: AppRouteNavSilhouetteSheetExclusionModeValue
): boolean => {
  'worklet';
  return (
    modeValue === APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.dockedPersistentPoll ||
    modeValue === APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.staticPersistent
  );
};

const shouldHostSheetMaskForNavSilhouette = ({
  navBarHeight,
}: {
  navBarHeight: number;
}): boolean => {
  'worklet';
  return Math.max(0, navBarHeight) > 0;
};

const shouldEnableSheetMaskForNavSilhouette = ({
  modeValue,
  navBarHeight,
  navTranslateY,
}: {
  modeValue: AppRouteNavSilhouetteSheetExclusionModeValue;
  navBarHeight: number;
  navTranslateY: number;
}): boolean => {
  'worklet';
  if (!shouldHostSheetMaskForNavSilhouette({ navBarHeight })) {
    return false;
  }
  if (modeValue === APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.none) {
    return false;
  }
  return (
    isPersistentNavBodyExclusionMode(modeValue) ||
    Math.max(0, navBarHeight - Math.max(0, navTranslateY)) > 0.25
  );
};

const resolveNativeSheetMaskBoundaryTranslateY = ({
  modeValue,
  navTranslateY,
}: {
  modeValue: AppRouteNavSilhouetteSheetExclusionModeValue;
  navTranslateY: number;
}): number => {
  'worklet';
  if (isPersistentNavBodyExclusionMode(modeValue)) {
    return 0;
  }
  return Math.max(0, navTranslateY);
};

const areSheetMaskRuntimesEqual = (
  left: SheetMaskRuntime | null,
  right: SheetMaskRuntime | null
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.exclusionModeValue === right.exclusionModeValue &&
    left.navBarHeight === right.navBarHeight &&
    left.navBarTop === right.navBarTop &&
    left.bottomNavHiddenTranslateY === right.bottomNavHiddenTranslateY &&
    left.navTranslateY === right.navTranslateY);

const SearchRouteSheetNativeMaskHost = React.memo(
  ({
    sheetMaskRuntime,
    viewportWidth,
    viewportHeight,
    children,
  }: {
    sheetMaskRuntime: SheetMaskRuntime;
    viewportWidth: number;
    viewportHeight: number;
    children: React.ReactNode;
  }) => {
    const nativeMaskAnimatedProps = useAnimatedProps(() => {
      const modeValue = sheetMaskRuntime.exclusionModeValue.value;
      const boundaryTranslateY = resolveNativeSheetMaskBoundaryTranslateY({
        modeValue,
        navTranslateY: sheetMaskRuntime.navTranslateY.value,
      });
      const shouldMaskSheet = shouldEnableSheetMaskForNavSilhouette({
        modeValue,
        navBarHeight: sheetMaskRuntime.navBarHeight,
        navTranslateY: boundaryTranslateY,
      });
      return {
        maskEnabled: shouldMaskSheet,
        navBodyBoundaryTranslateY: boundaryTranslateY,
      };
    }, [sheetMaskRuntime]);

    const hardClipAnimatedStyle = useAnimatedStyle(() => {
      const modeValue = sheetMaskRuntime.exclusionModeValue.value;
      const shouldHardClipSheet = isPersistentNavBodyExclusionMode(modeValue);
      return {
        height: shouldHardClipSheet
          ? Math.max(0, sheetMaskRuntime.navBarTop)
          : Math.max(0, viewportHeight),
      };
    }, [sheetMaskRuntime, viewportHeight]);

    const initialModeValue = sheetMaskRuntime.exclusionModeValue.value;
    const initialBoundaryTranslateY = resolveNativeSheetMaskBoundaryTranslateY({
      modeValue: initialModeValue,
      navTranslateY: sheetMaskRuntime.navTranslateY.value,
    });
    const initialMaskEnabled = shouldEnableSheetMaskForNavSilhouette({
      modeValue: initialModeValue,
      navBarHeight: sheetMaskRuntime.navBarHeight,
      navTranslateY: initialBoundaryTranslateY,
    });
    const clippedChildren = (
      <Reanimated.View
        pointerEvents="box-none"
        style={[styles.persistentSheetHardClip, hardClipAnimatedStyle]}
      >
        {children}
      </Reanimated.View>
    );

    return (
      <AnimatedSearchRouteSheetNavExclusionMaskNativeView
        pointerEvents="box-none"
        animatedProps={nativeMaskAnimatedProps as never}
        maskEnabled={initialMaskEnabled}
        navBodyBoundaryTranslateY={initialBoundaryTranslateY}
        navBodyBoundaryVisibleY={sheetMaskRuntime.navBarTop}
        navBodyBoundaryHiddenY={
          sheetMaskRuntime.navBarTop + Math.max(0, sheetMaskRuntime.bottomNavHiddenTranslateY)
        }
        maskOriginY={0}
        style={[styles.sheetMask, { width: viewportWidth, height: viewportHeight }]}
      >
        {clippedChildren}
      </AnimatedSearchRouteSheetNavExclusionMaskNativeView>
    );
  }
);

export const SearchRouteSheetFrameHost = React.memo(
  ({
    routeHostVisualRuntimeAuthority,
    children,
  }: {
    routeHostVisualRuntimeAuthority: RouteHostVisualRuntimeAuthority;
    children: React.ReactNode;
  }) => {
    useSearchNavSwitchCommitAttribution('SearchRouteSheetFrameHost');
    const renderStartedAtMs = startSearchNavSwitchRuntimeAttributionSpan();
    const onProfilerRender = useSearchOverlayProfilerRender();
    const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
    const startupSheetMaskRuntime = React.useMemo<SheetMaskRuntime>(() => {
      const startupGeometrySeed = getSearchStartupGeometrySeed();
      return {
        exclusionModeValue: {
          value: APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.dockedPersistentPoll,
        },
        navBarHeight: startupGeometrySeed.bottomNavHeight,
        navBarTop: startupGeometrySeed.navBarTopForSnaps,
        bottomNavHiddenTranslateY: startupGeometrySeed.bottomNavHiddenTranslateY,
        navTranslateY: { value: 0 },
      };
    }, []);
    const sheetMaskRuntime = useRouteAuthoritySelector<RouteHostVisualRuntime, SheetMaskRuntime>({
      subscribe: React.useCallback(
        (listener: () => void) => routeHostVisualRuntimeAuthority.subscribe(listener),
        [routeHostVisualRuntimeAuthority]
      ),
      subscribeSelector: routeHostVisualRuntimeAuthority.subscribeSelector,
      getSnapshot: routeHostVisualRuntimeAuthority.getSnapshot,
      selector: React.useCallback(
        (runtime) =>
          runtime == null
            ? startupSheetMaskRuntime
            : {
                exclusionModeValue: runtime.navSilhouetteSheetExclusionModeValue,
                navBarHeight:
                  runtime.navBarHeight > 0
                    ? runtime.navBarHeight
                    : startupSheetMaskRuntime.navBarHeight,
                navBarTop:
                  runtime.navBarTop > 0 ? runtime.navBarTop : startupSheetMaskRuntime.navBarTop,
                bottomNavHiddenTranslateY:
                  runtime.bottomNavHiddenTranslateY > 0
                    ? runtime.bottomNavHiddenTranslateY
                    : startupSheetMaskRuntime.bottomNavHiddenTranslateY,
                navTranslateY: runtime.navTranslateY,
              },
        [startupSheetMaskRuntime]
      ),
      isEqual: areSheetMaskRuntimesEqual,
      attributionOwner: 'SearchRouteSheetFrameHost',
      attributionOperation: 'navSilhouetteSheetMaskSelector',
    });
    const frameHost = (
      <SearchRouteSheetNativeMaskHost
        sheetMaskRuntime={sheetMaskRuntime}
        viewportWidth={viewportWidth}
        viewportHeight={viewportHeight}
      >
        {children}
      </SearchRouteSheetNativeMaskHost>
    );

    const profiledFrameHost = onProfilerRender ? (
      <React.Profiler id="SearchRouteSheetFrameHost" onRender={onProfilerRender}>
        {frameHost}
      </React.Profiler>
    ) : (
      frameHost
    );

    finishSearchNavSwitchRuntimeAttributionSpan({
      owner: 'SearchRouteSheetFrameHost',
      operation: 'render',
      startedAtMs: renderStartedAtMs,
    });

    return profiledFrameHost;
  }
);

const styles = StyleSheet.create({
  sheetMask: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: OVERLAY_STACK_ZINDEX,
  },
  persistentSheetHardClip: {
    position: 'relative',
    overflow: 'hidden',
  },
});
