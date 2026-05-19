import React from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolveExpandedTop } from '../../overlays/sheetUtils';
import { SCREEN_HEIGHT } from '../../screens/Search/constants/search';
import type { SearchRouteSheetMotionStateSnapshot } from '../../screens/Search/runtime/shared/search-route-sheet-motion-state-snapshot-contract';
import { withSearchNavSwitchRuntimeAttribution } from '../../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import { getSearchStartupGeometrySeed } from '../../screens/Search/runtime/shared/search-startup-geometry';
import type {
  RouteOverlayChromeModeSnapshot,
  RouteOverlayChromeMode,
} from './route-overlay-display-snapshot-contract';
import type { AppRouteSceneChromeMotionRuntime } from './app-route-scene-chrome-motion-runtime-contract';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';
import { useAppRouteSheetHostOwner } from './AppRouteSheetHostRuntimeProvider';
import type { AppRouteSheetHostSurfaceBodySnapshot } from './app-route-sheet-host-surface-runtime-contract';
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
import { useRouteAuthoritySelector } from './use-route-authority-selector';

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
  snapPoints: RouteOverlayChromeSnapConfig;
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

const areRouteSheetMotionStateEntriesEqual = (
  left: SearchRouteSheetMotionStateSnapshot['stateEntry'],
  right: SearchRouteSheetMotionStateSnapshot['stateEntry']
): boolean =>
  left?.visible === right?.visible &&
  left?.snapPoints === right?.snapPoints &&
  left?.initialSnapPoint === right?.initialSnapPoint &&
  left?.currentSnapPoint === right?.currentSnapPoint &&
  left?.sheetYValue === right?.sheetYValue &&
  left?.motionCommandValue === right?.motionCommandValue;

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
  const routeSheetHostOwner = useAppRouteSheetHostOwner();
  const routeSheetMotionStateEntry = useRouteAuthoritySelector<
    SearchRouteSheetMotionStateSnapshot,
    SearchRouteSheetMotionStateSnapshot['stateEntry']
  >({
    subscribe: routeSheetHostOwner.routeSheetMotionRuntimeAuthority.subscribe,
    subscribeSelector: routeSheetHostOwner.routeSheetMotionRuntimeAuthority.subscribeSelector,
    getSnapshot: routeSheetHostOwner.routeSheetMotionRuntimeAuthority.getSnapshot,
    selector: React.useCallback((snapshot) => snapshot.stateEntry, []),
    isEqual: areRouteSheetMotionStateEntriesEqual,
    attributionOwner: 'AppRouteSceneChromeMotionRuntimeProvider',
    attributionOperation: 'routeSheetMotionSelector',
  });
  const mountedRouteSheetMotionStateEntry = useRouteAuthoritySelector<
    AppRouteSheetHostSurfaceBodySnapshot,
    AppRouteSheetHostSurfaceBodySnapshot['motionStateEntry']
  >({
    subscribe: routeSheetHostOwner.routeSheetSurfaceBodyAuthority.subscribe,
    subscribeSelector: routeSheetHostOwner.routeSheetSurfaceBodyAuthority.subscribeSelector,
    getSnapshot: routeSheetHostOwner.routeSheetSurfaceBodyAuthority.getSnapshot,
    selector: React.useCallback((snapshot) => snapshot.motionStateEntry, []),
    isEqual: areRouteSheetMotionStateEntriesEqual,
    attributionOwner: 'AppRouteSceneChromeMotionRuntimeProvider',
    attributionOperation: 'mountedRouteSheetMotionSelector',
  });
  const activeRouteSheetMotionStateEntry =
    mountedRouteSheetMotionStateEntry ?? routeSheetMotionStateEntry;
  const routeOwnedBootstrapChromeSnaps = React.useMemo(
    () =>
      buildExpandedMiddleChromeSnaps(
        getSearchBarTop(routeSceneRuntime.routeHostOverlayGeometryAuthority.getSnapshot()),
        insets.top
      ),
    [insets.top, routeSceneRuntime.routeHostOverlayGeometryAuthority]
  );
  const activeRouteChromeSnaps =
    activeRouteSheetMotionStateEntry?.snapPoints ?? routeOwnedBootstrapChromeSnaps;
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
    snapPoints: activeRouteChromeSnaps,
  });
  const routeOwnedBootstrapSheetTranslateY = useSharedValue(initialChromeTransitionConfig.middle);
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
        snapPoints: activeRouteChromeSnaps,
      }),
    [
      activeRouteChromeSnaps,
      insets.top,
      routeSceneRuntime.routeHostOverlayGeometryAuthority,
      routeSceneRuntime.routeOverlayCommandAuthority,
      routeSceneRuntime.routeScenePolicyAuthority,
    ]
  );

  React.useLayoutEffect(() => {
    if (activeRouteSheetMotionStateEntry != null) {
      return;
    }
    routeOwnedBootstrapSheetTranslateY.value = initialChromeTransitionConfig.middle;
  }, [
    activeRouteSheetMotionStateEntry,
    initialChromeTransitionConfig.middle,
    routeOwnedBootstrapSheetTranslateY,
  ]);

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
    sheetTranslateY:
      activeRouteSheetMotionStateEntry?.sheetYValue ?? routeOwnedBootstrapSheetTranslateY,
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
