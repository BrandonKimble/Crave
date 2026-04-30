import React from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolveExpandedTop } from '../../overlays/sheetUtils';
import { SCREEN_HEIGHT } from '../../screens/Search/constants/search';
import { withSearchNavSwitchRuntimeAttribution } from '../../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import { getSearchStartupGeometrySeed } from '../../screens/Search/runtime/shared/search-startup-geometry';
import type {
  RouteOverlayChromeModeSnapshot,
  RouteOverlayChromeMode,
} from './route-overlay-display-snapshot-contract';
import type { AppRouteSceneChromeMotionRuntime } from './app-route-scene-chrome-motion-runtime-contract';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';
import { useAppRouteResultsSheetVisualBindingOwner } from './AppRouteResultsSheetRuntimeProvider';
import type {
  AppRouteChromeSurfaceTarget,
  RouteScenePolicySnapshot,
} from './app-route-scene-policy-contract';
import type { AppRouteOverlayCommandSnapshot } from './app-route-overlay-command-controller';
import type { RouteHostOverlayGeometryBinding } from './route-host-overlay-geometry-state-controller';
import type {
  RouteOverlayChromeSnapConfig,
  RouteOverlayChromeSnapSharedValueTargets,
} from './route-overlay-chrome-snap-targets';
import { useAppRouteSceneChromeMotionTargetRuntime } from './use-app-route-scene-chrome-motion-target-runtime';
import { useAppRouteSceneChromeTransitionRuntime } from './use-app-route-scene-chrome-transition-runtime';
import { useSearchNavSwitchCommitAttribution } from '../../screens/Search/runtime/shared/use-search-nav-switch-commit-attribution';
import type { AppRouteResultsSheetRuntimeOwner } from './app-route-results-sheet-runtime-contract';

const startupGeometrySeed = getSearchStartupGeometrySeed();

const AppRouteSceneChromeMotionRuntimeContext =
  React.createContext<AppRouteSceneChromeMotionRuntime | null>(null);

type RouteChromeOverlayState = {
  routeChromeOverlayMode: RouteOverlayChromeMode;
};

const selectRouteChromeOverlayState = (
  snapshot: RouteOverlayChromeModeSnapshot
): RouteChromeOverlayState => ({
  routeChromeOverlayMode: snapshot.routeChromeOverlayMode,
});

const selectRouteChromePolicyState = (snapshot: RouteScenePolicySnapshot) => ({
  chromeSurfaceTarget: snapshot.chromeSurfaceTarget,
});

const selectSaveSheetVisible = (snapshot: AppRouteOverlayCommandSnapshot): boolean =>
  snapshot.saveSheetState.visible;

const buildExpandedMiddleChromeSnaps = (searchBarTop: number, insetTop: number) => {
  const expanded = resolveExpandedTop(searchBarTop, insetTop);
  const rawMiddle = SCREEN_HEIGHT * 0.4;
  const middle = Math.max(expanded + 96, rawMiddle);
  const hidden = SCREEN_HEIGHT + 80;
  const clampedMiddle = Math.min(middle, hidden - 120);
  return { expanded, middle: clampedMiddle };
};

const buildSaveChromeSnaps = (searchBarTop: number, insetTop: number) => {
  const expanded = resolveExpandedTop(searchBarTop, insetTop);
  const middle = Math.max(expanded + 140, SCREEN_HEIGHT * 0.5);
  return { expanded, middle };
};

const resolveRouteChromeTransitionConfig = ({
  searchBarTop,
  insetsTop,
  showSaveListOverlay,
  routeChromeOverlayState,
  chromeSurfaceTarget,
  snapPoints,
}: {
  searchBarTop: number;
  insetsTop: number;
  showSaveListOverlay: boolean;
  routeChromeOverlayState: RouteChromeOverlayState;
  chromeSurfaceTarget: AppRouteChromeSurfaceTarget;
  snapPoints: AppRouteResultsSheetRuntimeOwner['snapPoints'];
}): RouteOverlayChromeSnapConfig => {
  if (showSaveListOverlay) {
    return buildSaveChromeSnaps(searchBarTop, insetsTop);
  }
  if (routeChromeOverlayState.routeChromeOverlayMode === 'expandedMiddle') {
    return buildExpandedMiddleChromeSnaps(searchBarTop, insetsTop);
  }
  const shouldUsePollsChrome =
    routeChromeOverlayState.routeChromeOverlayMode === 'search' && chromeSurfaceTarget === 'polls';
  if (shouldUsePollsChrome) {
    return buildExpandedMiddleChromeSnaps(searchBarTop, insetsTop);
  }
  return {
    expanded: snapPoints.expanded,
    middle: snapPoints.middle,
  };
};

const getSearchBarTop = (routeHostOverlayGeometry: RouteHostOverlayGeometryBinding): number =>
  routeHostOverlayGeometry?.searchBarTop ?? startupGeometrySeed.searchBarTop;

export const useAppRouteSceneChromeMotionRuntimeOwner = (): AppRouteSceneChromeMotionRuntime => {
  const runtime = React.useContext(AppRouteSceneChromeMotionRuntimeContext);
  if (runtime == null) {
    throw new Error(
      'useAppRouteSceneChromeMotionRuntimeOwner must be used within AppRouteSceneChromeMotionRuntimeProvider'
    );
  }
  return runtime;
};

export const AppRouteSceneChromeMotionRuntimeProvider = ({
  children,
  routeSceneRuntime,
}: React.PropsWithChildren<{
  routeSceneRuntime: AppRouteSceneRuntime;
}>) => {
  useSearchNavSwitchCommitAttribution('AppRouteSceneChromeMotionRuntimeProvider');
  const insets = useSafeAreaInsets();
  const resultsSheetVisualBinding = useAppRouteResultsSheetVisualBindingOwner();
  const initialChromeTransitionConfig = resolveRouteChromeTransitionConfig({
    searchBarTop: getSearchBarTop(
      routeSceneRuntime.routeHostOverlayGeometryAuthority.getSnapshot()
    ),
    insetsTop: insets.top,
    showSaveListOverlay: selectSaveSheetVisible(
      routeSceneRuntime.routeOverlayCommandAuthority.getSnapshot()
    ),
    routeChromeOverlayState: selectRouteChromeOverlayState(
      routeSceneRuntime.routeOverlayChromeModeAuthority.getSnapshot()
    ),
    chromeSurfaceTarget: selectRouteChromePolicyState(
      routeSceneRuntime.routeScenePolicyAuthority.getSnapshot()
    ).chromeSurfaceTarget,
    snapPoints: resultsSheetVisualBinding.snapPoints,
  });
  const chromeExpandedSnap = useSharedValue(initialChromeTransitionConfig.expanded);
  const chromeMiddleSnap = useSharedValue(initialChromeTransitionConfig.middle);

  const resolveChromeSnapTargets = React.useCallback(
    (routeChromeOverlayState: RouteChromeOverlayState): RouteOverlayChromeSnapConfig =>
      resolveRouteChromeTransitionConfig({
        searchBarTop: getSearchBarTop(
          routeSceneRuntime.routeHostOverlayGeometryAuthority.getSnapshot()
        ),
        insetsTop: insets.top,
        showSaveListOverlay: selectSaveSheetVisible(
          routeSceneRuntime.routeOverlayCommandAuthority.getSnapshot()
        ),
        routeChromeOverlayState,
        chromeSurfaceTarget: selectRouteChromePolicyState(
          routeSceneRuntime.routeScenePolicyAuthority.getSnapshot()
        ).chromeSurfaceTarget,
        snapPoints: resultsSheetVisualBinding.snapPoints,
      }),
    [
      insets.top,
      resultsSheetVisualBinding.snapPoints,
      routeSceneRuntime.routeHostOverlayGeometryAuthority,
      routeSceneRuntime.routeOverlayCommandAuthority,
      routeSceneRuntime.routeScenePolicyAuthority,
    ]
  );

  React.useLayoutEffect(() => {
    const syncChromeSnapTargets = () => {
      withSearchNavSwitchRuntimeAttribution(
        'AppRouteSceneChromeMotionRuntimeProvider',
        'syncChromeSnapTargets',
        () => {
          const nextChromeTransitionConfig = resolveChromeSnapTargets(
            selectRouteChromeOverlayState(
              routeSceneRuntime.routeOverlayChromeModeAuthority.getSnapshot()
            )
          );
          chromeExpandedSnap.value = nextChromeTransitionConfig.expanded;
          chromeMiddleSnap.value = nextChromeTransitionConfig.middle;
        }
      );
    };

    const chromeSnapSharedValueTargets: RouteOverlayChromeSnapSharedValueTargets = {
      chromeExpandedSnap,
      chromeMiddleSnap,
      resolveSnaps: (snapshot) => resolveChromeSnapTargets(selectRouteChromeOverlayState(snapshot)),
    };
    const unregisterRouteOverlayChromeMode =
      routeSceneRuntime.routeOverlayChromeModeAuthority.registerSharedValues(
        chromeSnapSharedValueTargets
      );
    const unsubscribeRouteScenePolicy =
      routeSceneRuntime.routeScenePolicyAuthority.subscribe(syncChromeSnapTargets);
    const unsubscribeRouteHostOverlayGeometry =
      routeSceneRuntime.routeHostOverlayGeometryAuthority.subscribe(syncChromeSnapTargets);
    const unsubscribeRouteOverlayCommand =
      routeSceneRuntime.routeOverlayCommandAuthority.subscribe(syncChromeSnapTargets);

    return () => {
      unregisterRouteOverlayChromeMode();
      unsubscribeRouteScenePolicy();
      unsubscribeRouteHostOverlayGeometry();
      unsubscribeRouteOverlayCommand();
    };
  }, [
    chromeExpandedSnap,
    chromeMiddleSnap,
    resolveChromeSnapTargets,
    routeSceneRuntime.routeHostOverlayGeometryAuthority,
    routeSceneRuntime.routeOverlayCommandAuthority,
    routeSceneRuntime.routeOverlayChromeModeAuthority,
    routeSceneRuntime.routeScenePolicyAuthority,
  ]);

  const runtime = useAppRouteSceneChromeTransitionRuntime({
    expandedSnap: chromeExpandedSnap,
    middleSnap: chromeMiddleSnap,
    sheetTranslateY: resultsSheetVisualBinding.sheetTranslateY,
  });

  useAppRouteSceneChromeMotionTargetRuntime({
    overlayChromeTransitionProgress: runtime.overlayChromeTransitionProgress,
    overlayBackdropDimProgress: runtime.overlayBackdropDimProgress,
    routeChromeMotionProgress: runtime.routeChromeMotionProgress,
  });

  return (
    <AppRouteSceneChromeMotionRuntimeContext.Provider value={runtime}>
      {children}
    </AppRouteSceneChromeMotionRuntimeContext.Provider>
  );
};
