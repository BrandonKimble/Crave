import React from 'react';
import type { ProfilerOnRenderCallback } from 'react';
import { PixelRatio, type LayoutChangeEvent } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import type { OverlayKey } from '../navigation/runtime/app-overlay-route-types';
import type { AppRouteSceneDisplayTargetRegistry } from '../navigation/runtime/app-route-scene-display-target-registry';
import type { RouteSceneSwitchTransitionActions } from '../navigation/runtime/app-route-scene-switch-controller';
import type {
  AppRouteSheetSnapSessionActions,
  AppRouteSheetSnapSessionAuthority,
} from '../navigation/runtime/app-route-sheet-snap-session-runtime';
import { useRouteAuthoritySelector } from '../navigation/runtime/use-route-authority-selector';
import SearchBottomNav from '../screens/Search/components/SearchBottomNav';
import { SEARCH_BOTTOM_NAV_ICON_RENDERERS } from '../screens/Search/components/search-bottom-nav-icons';
import type { SearchBottomNavVisualInputs } from '../screens/Search/runtime/shared/search-bottom-nav-visual-input-contract';
import type { SearchOverlayHostGateSnapshot } from '../screens/Search/runtime/shared/search-overlay-host-gate-snapshot-contract';
import type { SearchOverlayShellHostSnapshot } from '../screens/Search/runtime/shared/search-overlay-shell-host-snapshot-contract';
import type {
  SearchOverlayGateHostAuthority,
  SearchOverlayShellHostAuthority,
} from '../screens/Search/runtime/shared/search-root-host-authority-contract';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../perf/perf-scenario-runtime-store';
import {
  assertSearchStartupGeometryValue,
  getSearchStartupGeometrySeed,
  resolveSearchBottomInset,
} from '../screens/Search/runtime/shared/search-startup-geometry';

const SEARCH_BOTTOM_NAV_ITEMS = [
  { key: 'search', label: 'Search' },
  { key: 'bookmarks', label: 'Favorites' },
  { key: 'profile', label: 'Profile' },
] as const;

type NavSilhouetteShellSnapshot = {
  isFocused: boolean;
  bottomNavVisualInputs: SearchBottomNavVisualInputs;
};

type NavSilhouetteProfilerSnapshot = {
  onProfilerRender: ProfilerOnRenderCallback | null;
};

const useStartupBottomNavVisualInputs = (): NonNullable<SearchBottomNavVisualInputs> => {
  const navOpacity = useSharedValue(1);
  const navTranslateY = useSharedValue(0);
  const startupGeometrySeed = React.useMemo(() => getSearchStartupGeometrySeed(), []);
  const handleBottomNavLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const layout = event.nativeEvent.layout;
      assertSearchStartupGeometryValue(
        'startupBottomNav.top',
        startupGeometrySeed.bottomNavTop,
        PixelRatio.roundToNearestPixel(layout.y)
      );
      assertSearchStartupGeometryValue(
        'startupBottomNav.height',
        startupGeometrySeed.bottomNavHeight,
        PixelRatio.roundToNearestPixel(layout.height)
      );
    },
    [startupGeometrySeed.bottomNavHeight, startupGeometrySeed.bottomNavTop]
  );

  return React.useMemo(
    () => ({
      bottomInset: resolveSearchBottomInset(startupGeometrySeed.insetsBottom),
      bottomNavMotionRuntime: {
        navOpacity,
        navTranslateY,
      },
      handleBottomNavLayout,
      shouldHideBottomNav: false,
    }),
    [handleBottomNavLayout, navOpacity, navTranslateY, startupGeometrySeed.insetsBottom]
  );
};

const areShellSnapshotsEqual = (
  left: NavSilhouetteShellSnapshot,
  right: NavSilhouetteShellSnapshot
): boolean =>
  left.isFocused === right.isFocused && left.bottomNavVisualInputs === right.bottomNavVisualInputs;

const areProfilerSnapshotsEqual = (
  left: NavSilhouetteProfilerSnapshot,
  right: NavSilhouetteProfilerSnapshot
): boolean => left.onProfilerRender === right.onProfilerRender;

export type NavSilhouetteHostProps = {
  overlayGateHostAuthority: SearchOverlayGateHostAuthority;
  overlayShellHostAuthority: SearchOverlayShellHostAuthority;
  routeSceneDisplayTargetRegistry: AppRouteSceneDisplayTargetRegistry;
  routeOverlayTransitionActions: RouteSceneSwitchTransitionActions;
  routeSheetSnapSessionAuthority: AppRouteSheetSnapSessionAuthority;
  routeSheetSnapSessionActions: Pick<
    AppRouteSheetSnapSessionActions,
    'getRouteSceneSwitchSceneSnap'
  >;
};

const areNavSilhouetteHostPropsEqual = (
  previousProps: NavSilhouetteHostProps,
  nextProps: NavSilhouetteHostProps
): boolean =>
  previousProps.overlayGateHostAuthority === nextProps.overlayGateHostAuthority &&
  previousProps.overlayShellHostAuthority === nextProps.overlayShellHostAuthority &&
  previousProps.routeSceneDisplayTargetRegistry.activeTabIndexValue ===
    nextProps.routeSceneDisplayTargetRegistry.activeTabIndexValue &&
  previousProps.routeOverlayTransitionActions.requestOverlaySwitch ===
    nextProps.routeOverlayTransitionActions.requestOverlaySwitch &&
  previousProps.routeSheetSnapSessionAuthority === nextProps.routeSheetSnapSessionAuthority &&
  previousProps.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap ===
    nextProps.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap;

export const NavSilhouetteHost = React.memo(function NavSilhouetteHost({
  overlayGateHostAuthority,
  overlayShellHostAuthority,
  routeSceneDisplayTargetRegistry,
  routeOverlayTransitionActions,
  routeSheetSnapSessionAuthority,
  routeSheetSnapSessionActions,
}: NavSilhouetteHostProps) {
  const { isFocused, bottomNavVisualInputs } = useRouteAuthoritySelector<
    SearchOverlayShellHostSnapshot,
    NavSilhouetteShellSnapshot
  >({
    subscribe: React.useCallback(
      (listener: () => void) => overlayShellHostAuthority.subscribe(listener),
      [overlayShellHostAuthority]
    ),
    getSnapshot: overlayShellHostAuthority.getSnapshot,
    selector: React.useCallback(
      (snapshot: SearchOverlayShellHostSnapshot) => ({
        isFocused: snapshot.isFocused,
        bottomNavVisualInputs: snapshot.bottomNavVisualInputs,
      }),
      []
    ),
    isEqual: areShellSnapshotsEqual,
  });
  const { onProfilerRender } = useRouteAuthoritySelector<
    SearchOverlayHostGateSnapshot,
    NavSilhouetteProfilerSnapshot
  >({
    subscribe: React.useCallback(
      (listener: () => void) => overlayGateHostAuthority.subscribe(listener),
      [overlayGateHostAuthority]
    ),
    getSnapshot: overlayGateHostAuthority.getSnapshot,
    selector: React.useCallback(
      (snapshot: SearchOverlayHostGateSnapshot) => ({
        onProfilerRender: snapshot.onProfilerRender,
      }),
      []
    ),
    isEqual: areProfilerSnapshotsEqual,
  });
  const handleOverlaySelect = React.useCallback(
    (targetSceneKey: OverlayKey) => {
      const snapSessionSnapshot = routeSheetSnapSessionAuthority.getSnapshot();
      const isPollsSheetPhysicallyHidden =
        routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('polls') === 'hidden';
      const shouldRestoreDockedPolls =
        targetSceneKey === 'search' &&
        (snapSessionSnapshot.isDockedPollsDismissed || isPollsSheetPhysicallyHidden);
      if (shouldRestoreDockedPolls) {
        const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
        if (isPerfScenarioAttributionActive(scenarioConfig)) {
          logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
            event: 'persistent_polls_restore_nav_contract',
            navTarget: targetSceneKey,
            restoreRequested: true,
            targetSnap: 'collapsed',
            dismissedBeforePress: snapSessionSnapshot.isDockedPollsDismissed,
            physicalHiddenBeforePress: isPollsSheetPhysicallyHidden,
          });
        }
      }
      routeOverlayTransitionActions.requestOverlaySwitch({
        targetSceneKey,
        sheetTransitionKind: 'topLevelSwitch',
        sheetOpenerSource: 'navTab',
        dockedPollsRestoreSnap: shouldRestoreDockedPolls ? 'collapsed' : null,
      });
    },
    [routeOverlayTransitionActions, routeSheetSnapSessionActions, routeSheetSnapSessionAuthority]
  );
  const handleProfilePress = React.useCallback(() => {
    handleOverlaySelect('profile');
  }, [handleOverlaySelect]);
  const startupBottomNavVisualInputs = useStartupBottomNavVisualInputs();
  const resolvedBottomNavVisualInputs =
    bottomNavVisualInputs ?? startupBottomNavVisualInputs;

  if (!isFocused) {
    return null;
  }

  const content = (
    <SearchBottomNav
      {...resolvedBottomNavVisualInputs}
      navItems={SEARCH_BOTTOM_NAV_ITEMS}
      activeTabIndexValue={routeSceneDisplayTargetRegistry.activeTabIndexValue}
      navIconRenderers={SEARCH_BOTTOM_NAV_ICON_RENDERERS}
      handleProfilePress={handleProfilePress}
      handleOverlaySelect={handleOverlaySelect}
    />
  );

  return onProfilerRender ? (
    <React.Profiler id="NavSilhouetteHost" onRender={onProfilerRender}>
      {content}
    </React.Profiler>
  ) : (
    content
  );
},
areNavSilhouetteHostPropsEqual);
