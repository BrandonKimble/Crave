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
import { DOCKED_POLLS_RESURRECT_SNAP } from '../navigation/runtime/app-route-sheet-snap-session-runtime';
import { extendActiveRootFromNavReTap } from '../navigation/runtime/app-search-route-command-runtime';
import { useAppRouteSceneRuntime } from '../navigation/runtime/AppRouteSceneRuntimeProvider';
import { APP_ROOT_NAV_ITEMS } from '../navigation/runtime/app-route-root-nav-items';
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

// The tab set lives in the pure app-route-root-nav-items module so the two-posture-law
// exhaustiveness sweep can enumerate it (root-snap-law.md §Leg 3).
const SEARCH_BOTTOM_NAV_ITEMS = APP_ROOT_NAV_ITEMS;

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
  // Leg 6 (§4 nav re-tap): the named-intent path needs the command runtime's promote verb and
  // the FULL snap-session actions (seat write) — both live on the scene runtime context.
  const { routeOverlayRouteCommandRuntime, routeSheetSnapSessionActions: fullSnapSessionActions } =
    useAppRouteSceneRuntime();
  const handleOverlaySelect = React.useCallback(
    (targetSceneKey: OverlayKey) => {
      const snapSessionSnapshot = routeSheetSnapSessionAuthority.getSnapshot();
      const isPollsSheetPhysicallyHidden =
        routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('polls') === 'hidden';
      const shouldRestoreDockedPolls =
        targetSceneKey === 'search' &&
        (snapSessionSnapshot.isDockedPollsDismissed || isPollsSheetPhysicallyHidden);
      // ─── NAV RE-TAP (wave-2 charter §4, leg 6): tapping the ACTIVE tab at its root is the
      // named product intent extendActiveRootFromNavReTap — the sheet pulls to FULLY EXTENDED
      // and the side's seat remembers it ('named' writer, snap-law category (c)). Extend-only:
      // promoteAtLeast('expanded') is inert at expanded, so a third tap does NOTHING (drag is
      // the only way down). The docked-polls RESURRECT lane takes precedence for that press
      // (a dismissed/hidden feed re-presents at its declared posture, the existing flow below).
      const routeState = routeOverlayRouteCommandRuntime.getRouteState();
      const isActiveRootReTap =
        !shouldRestoreDockedPolls &&
        routeState.overlayRouteStackLength === 1 &&
        routeState.activeOverlayRoute.key === targetSceneKey;
      if (isActiveRootReTap) {
        extendActiveRootFromNavReTap({
          targetSceneKey,
          promoteActiveSheet: routeOverlayRouteCommandRuntime.promoteActiveSheet,
          routeSheetSnapSessionActions: fullSnapSessionActions,
        });
        return;
      }
      if (shouldRestoreDockedPolls) {
        const scenarioConfig = usePerfScenarioRuntimeStore.getState().activeConfig;
        if (isPerfScenarioAttributionActive(scenarioConfig)) {
          logPerfScenarioAttributionEvent('VisualReadiness', scenarioConfig, {
            event: 'persistent_polls_restore_nav_contract',
            navTarget: targetSceneKey,
            restoreRequested: true,
            targetSnap: DOCKED_POLLS_RESURRECT_SNAP,
            dismissedBeforePress: snapSessionSnapshot.isDockedPollsDismissed,
            physicalHiddenBeforePress: isPollsSheetPhysicallyHidden,
          });
        }
      }
      routeOverlayTransitionActions.requestOverlaySwitch({
        targetSceneKey,
        sheetTransitionKind: 'topLevelSwitch',
        sheetOpenerSource: 'navTab',
        // Two-posture law: the sheet MOTION is the descriptor table's derived 'postureSeat'
        // rule (no sheetMotion here). The restore intent re-presents a dismissed docked lane
        // at the ONE declared resurrect posture — which is also the home seat's fallback for
        // a hidden seat, so intent and motion agree by construction.
        dockedPollsRestoreSnap: shouldRestoreDockedPolls ? DOCKED_POLLS_RESURRECT_SNAP : null,
      });
    },
    [
      routeOverlayTransitionActions,
      routeSheetSnapSessionActions,
      routeSheetSnapSessionAuthority,
      routeOverlayRouteCommandRuntime,
      fullSnapSessionActions,
    ]
  );
  const handleProfilePress = React.useCallback(() => {
    handleOverlaySelect('profile');
  }, [handleOverlaySelect]);
  const startupBottomNavVisualInputs = useStartupBottomNavVisualInputs();
  const resolvedBottomNavVisualInputs = bottomNavVisualInputs ?? startupBottomNavVisualInputs;

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
}, areNavSilhouetteHostPropsEqual);
