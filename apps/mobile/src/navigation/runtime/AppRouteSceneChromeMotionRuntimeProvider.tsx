import React from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import { useTrackSheetTopY } from '../../tracksheet/use-track-sheet-top-y';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolveExpandedMiddleSnaps, resolveExpandedTop } from '../../overlays/sheetUtils';
import { SCREEN_HEIGHT } from '../../screens/Search/constants/search';
import type { SearchRouteSheetMotionStateSnapshot } from '../../screens/Search/runtime/shared/search-route-sheet-motion-state-snapshot-contract';
import { withSearchNavSwitchRuntimeAttribution } from '../../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import { getSearchStartupGeometrySeed } from '../../screens/Search/runtime/shared/search-startup-geometry';
import type {} from './route-overlay-display-snapshot-contract';
import type { AppRouteSceneChromeMotionRuntime } from './app-route-scene-chrome-motion-runtime-contract';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';
import { useAppRouteSheetHostOwner } from './AppRouteSheetHostRuntimeProvider';
import type { AppRouteSheetHostSurfaceBodySnapshot } from './app-route-sheet-host-surface-runtime-contract';
import type {} from './app-route-scene-policy-contract';
import type { AppRouteSaveSheetState } from './app-route-overlay-command-controller';
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

// F948: `selectRouteChromeOverlayState` and `selectRouteChromePolicyState` are deleted
// with the dead parameters they existed to compute — the chrome response zone is a pure
// function of the search bar's top edge and the save-list mode, and nothing else.

const selectSaveSheetVisible = (saveSheetState: AppRouteSaveSheetState): boolean =>
  saveSheetState.visible;

// F964: ONE SNAP-GEOMETRY FORMULA. This used to recompute the sheet's expanded/middle
// pair here — the same four expressions with the same four literals as
// `calculateSnapPoints`, with neither file importing the other, so tuning the sheet
// would have silently drifted its own chrome. The chrome derives from the sheet's
// resolver now.
const buildExpandedMiddleChromeSnaps = (
  searchBarTop: number,
  insetTop: number
): RouteOverlayChromeSnapConfig => {
  const { expanded, middle } = resolveExpandedMiddleSnaps(SCREEN_HEIGHT, searchBarTop, insetTop);
  return { expanded, middle };
};

/** The SAVE-LIST overlay is a genuine MODE (a different surface), not a scene, and it
 *  carries its own pair. The two literals below are the shipped values with no recorded
 *  derivation — named here for the same reason as the sheet's (see sheetUtils.ts), and
 *  deliberately NOT reconciled with the sheet's 96/0.4: making them equal is a design
 *  decision about how the save sheet sits, not a refactor. */
const SAVE_MIDDLE_MIN_GAP_BELOW_EXPANDED_PX = 140;
const SAVE_MIDDLE_SCREEN_FRACTION = 0.5;

const buildSaveChromeSnaps = (
  searchBarTop: number,
  insetTop: number
): RouteOverlayChromeSnapConfig => {
  const expanded = resolveExpandedTop(searchBarTop, insetTop);
  const middle = Math.max(
    expanded + SAVE_MIDDLE_MIN_GAP_BELOW_EXPANDED_PX,
    SCREEN_HEIGHT * SAVE_MIDDLE_SCREEN_FRACTION
  );
  return { expanded, middle };
};

// F948: `routeChromeOverlayState`, `chromeSurfaceTarget` and `snapPoints` USED TO BE
// PARAMETERS HERE and none of the three was read in the body — the function returns
// `buildSaveChromeSnaps` or `buildExpandedMiddleChromeSnaps`, both of which take only
// searchBarTop/insetTop. They were not free: computing them cost three live authority
// subscriptions, and `activeRouteChromeSnaps` — a value that changes on EVERY sheet
// motion-state entry change — existed ONLY to feed the discarded `snapPoints`. Because
// it sat in `resolveChromeSnapTargets`' dep chain, and that callback is a dependency of
// the layout-effect that registers FOUR authority subscriptions, all four tore down and
// re-registered on every sheet movement. Deleting three dead parameters collapses the
// dep to `insets.top` and makes those subscriptions mount-once.
const resolveRouteChromeTransitionConfig = ({
  searchBarTop,
  insetsTop,
  showSaveListOverlay,
}: {
  searchBarTop: number;
  insetsTop: number;
  showSaveListOverlay: boolean;
}): RouteOverlayChromeSnapConfig => {
  if (showSaveListOverlay) {
    return buildSaveChromeSnaps(searchBarTop, insetsTop);
  }
  // ONE RULER (2026-08-01). The search chrome is a pure function of the
  // sheet's ACTUAL top edge — but this resolver used to hand it a DIFFERENT
  // interpolation range per scene (geometric anchors for the docked scene, the
  // scene's own snap points otherwise). A tab switch therefore changed the
  // RULER at commit while the sheet had not moved a pixel: the same position
  // re-mapped to a new progress and the chrome jumped, settled back, and only
  // then animated for real as the sheet actually flew. That is the owner's
  // "shrinks, expands, then shrinks again" — two clocks for one visual, with
  // the mapping function as the second clock.
  //
  // The response zone is now ALWAYS the geometric one, anchored to the search
  // bar the chrome actually is. It is scene-independent, so no switch can
  // remap it and the chrome can only ever move because the SHEET moved.
  // (The save-list overlay stays: it is a genuine MODE — a different surface
  // — not a scene switch.)
  return buildExpandedMiddleChromeSnaps(searchBarTop, insetsTop);
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
  const initialChromeTransitionConfig = resolveRouteChromeTransitionConfig({
    searchBarTop: getSearchBarTop(
      routeSceneRuntime.routeHostOverlayGeometryAuthority.getSnapshot()
    ),
    insetsTop: insets.top,
    showSaveListOverlay: selectSaveSheetVisible(
      routeSceneRuntime.routeOverlayCommandAuthority.getSnapshot()
    ),
  });
  const chromeExpandedSnap = useSharedValue(initialChromeTransitionConfig.expanded);
  const chromeMiddleSnap = useSharedValue(initialChromeTransitionConfig.middle);

  const resolveChromeSnapTargets = React.useCallback(
    (): RouteOverlayChromeSnapConfig =>
      resolveRouteChromeTransitionConfig({
        searchBarTop: getSearchBarTop(
          routeSceneRuntime.routeHostOverlayGeometryAuthority.getSnapshot()
        ),
        insetsTop: insets.top,
        showSaveListOverlay: selectSaveSheetVisible(
          routeSceneRuntime.routeOverlayCommandAuthority.getSnapshot()
        ),
      }),
    // F948: with the three dead parameters gone this no longer depends on
    // `activeRouteChromeSnaps` (which changed on every sheet motion) — so the
    // layout-effect below, which lists this callback in its deps, registers its four
    // authority subscriptions ONCE instead of on every sheet movement.
    [
      insets.top,
      routeSceneRuntime.routeHostOverlayGeometryAuthority,
      routeSceneRuntime.routeOverlayCommandAuthority,
    ]
  );

  React.useLayoutEffect(() => {
    const syncChromeSnapTargets = () => {
      withSearchNavSwitchRuntimeAttribution(
        'AppRouteSceneChromeMotionRuntimeProvider',
        'syncChromeSnapTargets',
        () => {
          const nextChromeTransitionConfig = resolveChromeSnapTargets();
          chromeExpandedSnap.value = nextChromeTransitionConfig.expanded;
          chromeMiddleSnap.value = nextChromeTransitionConfig.middle;
        }
      );
    };

    const chromeSnapSharedValueTargets: RouteOverlayChromeSnapSharedValueTargets = {
      chromeExpandedSnap,
      chromeMiddleSnap,
      resolveSnaps: () => resolveChromeSnapTargets(),
    };
    const unregisterRouteOverlayChromeMode =
      routeSceneRuntime.routeOverlayChromeModeAuthority.registerSharedValues(
        chromeSnapSharedValueTargets
      );
    // F1377: routeScenePolicyAuthority was subscribed here without appearing anywhere in
    // resolveChromeSnapTargets' read set (searchBarTop from routeHostOverlayGeometryAuthority,
    // showSaveListOverlay from routeOverlayCommandAuthority) — every policy publication
    // re-wrote both shared values with byte-identical results. Deleted; the two authorities
    // actually read remain subscribed below.
    const unsubscribeRouteHostOverlayGeometry =
      routeSceneRuntime.routeHostOverlayGeometryAuthority.subscribe(syncChromeSnapTargets);
    const unsubscribeRouteOverlayCommand =
      routeSceneRuntime.routeOverlayCommandAuthority.subscribe(syncChromeSnapTargets);

    return () => {
      unregisterRouteOverlayChromeMode();
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
  ]);

  // The track's published sheetTopY — the SAME object the motion-state entry
  // carries. Reading it here (not via the entry) keeps the chrome chain live
  // even on entry-null frames (no renderable surface), and makes a frozen
  // dead-mirror fallback unrepresentable: both branches are one SV. The old
  // routeOwnedBootstrapSheetTranslateY rival is deleted with the bridge.
  const trackSheetTopY = useTrackSheetTopY();
  const runtime = useAppRouteSceneChromeTransitionRuntime({
    expandedSnap: chromeExpandedSnap,
    middleSnap: chromeMiddleSnap,
    trackSheetTopY:
      activeRouteSheetMotionStateEntry?.sheetYValue ?? (trackSheetTopY as SharedValue<number>),
  });

  useAppRouteSceneChromeMotionTargetRuntime({
    overlayChromeVisibilityProgress: runtime.overlayChromeVisibilityProgress,
    routeChromeMotionProgress: runtime.routeChromeMotionProgress,
  });

  return (
    <AppRouteSceneChromeMotionRuntimeContext.Provider value={runtime}>
      {children}
    </AppRouteSceneChromeMotionRuntimeContext.Provider>
  );
};
