import React from 'react';
import { useAnimatedStyle } from 'react-native-reanimated';

import { OVERLAY_TAB_HEADER_HEIGHT } from '../../overlays/overlaySheetStyles';
import { useBottomSheetRuntimeModel } from '../../overlays/useBottomSheetRuntime';
import type { OverlaySheetSnap } from '../../overlays/types';
import { SCREEN_HEIGHT } from '../../screens/Search/constants/search';
import { getSearchStartupGeometrySeed } from '../../screens/Search/runtime/shared/search-startup-geometry';
import { withSearchNavSwitchRuntimeAttribution } from '../../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import type {
  AppRouteSharedSheetRuntimeOwner,
  AppRouteSharedSheetVisualBinding,
} from './app-route-shared-sheet-runtime-contract';
import { DOCKED_POLLS_RESURRECT_SNAP } from './app-route-sheet-snap-session-runtime';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';
import type { AppRouteOverlaySessionSnapshot } from './app-route-overlay-session-contract';
import type { RouteOverlayRootSnapshot } from './route-overlay-display-snapshot-contract';
import type { RouteHostOverlayGeometryBinding } from './route-host-overlay-geometry-state-controller';
import { useAppRouteSharedSheetValuesRuntime } from './use-app-route-shared-sheet-values-runtime';
import { useSearchNavSwitchCommitAttribution } from '../../screens/Search/runtime/shared/use-search-nav-switch-commit-attribution';
import type { SheetPosition } from '../../overlays/sheetUtils';

const startupGeometrySeed = getSearchStartupGeometrySeed();

const selectRouteOverlayMotionState = (snapshot: RouteOverlayRootSnapshot) => ({
  isSearchOverlay: snapshot.isSearchOverlay,
});

const areRouteOverlayMotionStatesEqual = (
  left: ReturnType<typeof selectRouteOverlayMotionState>,
  right: ReturnType<typeof selectRouteOverlayMotionState>
): boolean => left.isSearchOverlay === right.isSearchOverlay;

const selectRouteSharedSheetOverlaySessionState = (snapshot: AppRouteOverlaySessionSnapshot) => ({
  shouldShowDockedPollsTarget: snapshot.shouldShowDockedPollsTarget,
});

const areRouteSharedSheetOverlaySessionStatesEqual = (
  left: ReturnType<typeof selectRouteSharedSheetOverlaySessionState>,
  right: ReturnType<typeof selectRouteSharedSheetOverlaySessionState>
): boolean => left.shouldShowDockedPollsTarget === right.shouldShowDockedPollsTarget;

const getRouteHostOverlayGeometryInput = (
  snapshot: RouteHostOverlayGeometryBinding
): {
  searchBarTop: number;
  navBarTopForSnaps: number;
} => ({
  searchBarTop: snapshot?.searchBarTop ?? startupGeometrySeed.searchBarTop,
  navBarTopForSnaps: snapshot?.navBarTopForSnaps ?? startupGeometrySeed.navBarTopForSnaps,
});

const resolveInitialSharedSheetPosition = ({
  shouldShowDockedPollsTarget,
  currentPollsSheetSnap,
}: {
  shouldShowDockedPollsTarget: boolean;
  currentPollsSheetSnap: OverlaySheetSnap;
}): SheetPosition => {
  if (!shouldShowDockedPollsTarget) {
    return 'hidden';
  }
  if (currentPollsSheetSnap !== 'hidden') {
    return currentPollsSheetSnap;
  }
  // Home seat 'hidden' = user-dismissed docked polls; re-presenting is the ONE sanctioned
  // resurrect product moment, always at the declared resurrect posture (two-posture law).
  return DOCKED_POLLS_RESURRECT_SNAP;
};

export const useAppRouteSharedSheetRuntime = ({
  insetsTop,
  routeSceneRuntime,
}: {
  insetsTop: number;
  routeSceneRuntime: AppRouteSceneRuntime;
}): AppRouteSharedSheetRuntimeOwner => {
  useSearchNavSwitchCommitAttribution('AppRouteSharedSheetRuntime');
  const initialRouteOverlayMotionState = React.useMemo(
    () => selectRouteOverlayMotionState(routeSceneRuntime.routeOverlayRootAuthority.getSnapshot()),
    [routeSceneRuntime.routeOverlayRootAuthority]
  );
  const initialRouteSharedSheetOverlaySessionState = React.useMemo(
    () =>
      selectRouteSharedSheetOverlaySessionState(
        routeSceneRuntime.routeOverlaySessionAuthority.getSnapshot()
      ),
    [routeSceneRuntime.routeOverlaySessionAuthority]
  );
  const initialRouteHostOverlayGeometry = React.useMemo(
    () =>
      getRouteHostOverlayGeometryInput(
        routeSceneRuntime.routeHostOverlayGeometryAuthority.getSnapshot()
      ),
    [routeSceneRuntime.routeHostOverlayGeometryAuthority]
  );
  const initialSharedSheetPosition = resolveInitialSharedSheetPosition({
    shouldShowDockedPollsTarget:
      initialRouteSharedSheetOverlaySessionState.shouldShowDockedPollsTarget,
    currentPollsSheetSnap:
      routeSceneRuntime.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('polls'),
  });
  const initialSharedSheetVisible = initialSharedSheetPosition !== 'hidden';

  const sharedSheetValuesRuntime = useAppRouteSharedSheetValuesRuntime({
    screenHeight: SCREEN_HEIGHT,
    searchBarTop: initialRouteHostOverlayGeometry.searchBarTop,
    insetsTop,
    navBarTopForSnaps: initialRouteHostOverlayGeometry.navBarTopForSnaps,
    overlayTabHeaderHeight: OVERLAY_TAB_HEADER_HEIGHT,
    initialSharedSheetPosition,
    initialSharedSheetVisible,
  });
  const sharedSheetRuntimeModel = useBottomSheetRuntimeModel({
    presentationStateOverride: {
      sheetY: sharedSheetValuesRuntime.sheetTranslateY,
      scrollOffset: sharedSheetValuesRuntime.sheetScrollOffset,
      momentumFlag: sharedSheetValuesRuntime.sheetMomentum,
    },
  });
  const sharedSheetContainerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sharedSheetValuesRuntime.sheetTranslateY.value }],
  }));
  const getPollsSheetSnap = React.useCallback(
    () => routeSceneRuntime.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('polls'),
    [routeSceneRuntime.routeSheetSnapSessionActions]
  );
  const sharedSheetPresentationRuntime = routeSceneRuntime.routeSharedSheetPresentationRuntime;

  React.useLayoutEffect(() => {
    let lastRouteOverlayMotionState = initialRouteOverlayMotionState;
    let lastRouteSharedSheetOverlaySessionState = initialRouteSharedSheetOverlaySessionState;

    const syncSharedSheetInput = () => {
      withSearchNavSwitchRuntimeAttribution(
        'AppRouteSharedSheetRuntime',
        'syncPresentationInput',
        () => {
          const routeOverlayMotionState = selectRouteOverlayMotionState(
            routeSceneRuntime.routeOverlayRootAuthority.getSnapshot()
          );
          if (
            !areRouteOverlayMotionStatesEqual(lastRouteOverlayMotionState, routeOverlayMotionState)
          ) {
            lastRouteOverlayMotionState = routeOverlayMotionState;
          }

          const routeSharedSheetOverlaySessionState = selectRouteSharedSheetOverlaySessionState(
            routeSceneRuntime.routeOverlaySessionAuthority.getSnapshot()
          );
          if (
            !areRouteSharedSheetOverlaySessionStatesEqual(
              lastRouteSharedSheetOverlaySessionState,
              routeSharedSheetOverlaySessionState
            )
          ) {
            lastRouteSharedSheetOverlaySessionState = routeSharedSheetOverlaySessionState;
          }

          const routeHostOverlayGeometry = getRouteHostOverlayGeometryInput(
            routeSceneRuntime.routeHostOverlayGeometryAuthority.getSnapshot()
          );
          sharedSheetValuesRuntime.syncSnapPoints({
            screenHeight: SCREEN_HEIGHT,
            searchBarTop: routeHostOverlayGeometry.searchBarTop,
            insetsTop,
            navBarTopForSnaps: routeHostOverlayGeometry.navBarTopForSnaps,
            overlayTabHeaderHeight: OVERLAY_TAB_HEADER_HEIGHT,
          });

          const nextInitialSharedSheetPosition = resolveInitialSharedSheetPosition({
            shouldShowDockedPollsTarget:
              routeSharedSheetOverlaySessionState.shouldShowDockedPollsTarget,
            currentPollsSheetSnap:
              routeSceneRuntime.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('polls'),
          });

          sharedSheetPresentationRuntime.syncInput({
            isSearchOverlay: routeOverlayMotionState.isSearchOverlay,
            shouldShowDockedPollsTarget:
              routeSharedSheetOverlaySessionState.shouldShowDockedPollsTarget,
            getPollsSheetSnap,
            navBarTopForSnaps: routeHostOverlayGeometry.navBarTopForSnaps,
            initialSharedSheetPosition: nextInitialSharedSheetPosition,
            initialSharedSheetVisible: nextInitialSharedSheetPosition !== 'hidden',
            clearSheetCommand: sharedSheetRuntimeModel.snapController.clearCommand,
          });
        }
      );
    };

    syncSharedSheetInput();
    const unregisterRouteOverlayRootTarget =
      routeSceneRuntime.routeOverlayRootAuthority.registerTarget({
        attributionLabel: 'sharedSheetInput',
        syncRootSnapshot: (snapshot) => {
          const routeOverlayMotionState = selectRouteOverlayMotionState(snapshot);
          if (
            areRouteOverlayMotionStatesEqual(lastRouteOverlayMotionState, routeOverlayMotionState)
          ) {
            return;
          }
          syncSharedSheetInput();
        },
      });
    const unsubscribeRouteOverlaySession = routeSceneRuntime.routeOverlaySessionAuthority.subscribe(
      () => {
        const routeSharedSheetOverlaySessionState = selectRouteSharedSheetOverlaySessionState(
          routeSceneRuntime.routeOverlaySessionAuthority.getSnapshot()
        );
        if (
          areRouteSharedSheetOverlaySessionStatesEqual(
            lastRouteSharedSheetOverlaySessionState,
            routeSharedSheetOverlaySessionState
          )
        ) {
          return;
        }
        syncSharedSheetInput();
      }
    );
    const unsubscribeRouteHostOverlayGeometry =
      routeSceneRuntime.routeHostOverlayGeometryAuthority.subscribe(syncSharedSheetInput);
    const unsubscribeRouteSheetSnapSession =
      routeSceneRuntime.routeSheetSnapSessionAuthority.subscribe(syncSharedSheetInput);

    return () => {
      unregisterRouteOverlayRootTarget();
      unsubscribeRouteOverlaySession();
      unsubscribeRouteHostOverlayGeometry();
      unsubscribeRouteSheetSnapSession();
    };
  }, [
    getPollsSheetSnap,
    initialRouteOverlayMotionState,
    initialRouteSharedSheetOverlaySessionState,
    initialSharedSheetVisible,
    initialSharedSheetPosition,
    insetsTop,
    sharedSheetRuntimeModel.snapController.clearCommand,
    sharedSheetValuesRuntime.syncSnapPoints,
    sharedSheetPresentationRuntime,
    routeSceneRuntime.routeHostOverlayGeometryAuthority,
    routeSceneRuntime.routeOverlayRootAuthority,
    routeSceneRuntime.routeOverlaySessionAuthority,
    routeSceneRuntime.routeSheetSnapSessionActions,
    routeSceneRuntime.routeSheetSnapSessionAuthority,
  ]);

  return React.useMemo(
    () => ({
      get snapPoints() {
        return sharedSheetValuesRuntime.snapPoints;
      },
      get panelVisible() {
        return sharedSheetPresentationRuntime.getSnapshot().panelVisible;
      },
      get sheetState() {
        return sharedSheetPresentationRuntime.getSnapshot().sheetState;
      },
      sheetTranslateY: sharedSheetValuesRuntime.sheetTranslateY,
      sheetScrollOffset: sharedSheetValuesRuntime.sheetScrollOffset,
      sheetMomentum: sharedSheetValuesRuntime.sheetMomentum,
      sharedSheetRuntimeModel,
      get shouldRenderMountedSharedSheet() {
        return sharedSheetPresentationRuntime.getSnapshot().shouldRenderMountedSharedSheet;
      },
      shouldRenderMountedSharedSheetRef:
        sharedSheetPresentationRuntime.shouldRenderMountedSharedSheetRef,
      sharedSheetContainerAnimatedStyle,
      markSharedSheetHidden: sharedSheetPresentationRuntime.markSharedSheetHidden,
      prepareSharedSheetForSearchPresentation:
        sharedSheetPresentationRuntime.prepareSharedSheetForSearchPresentation,
    }),
    [
      sharedSheetContainerAnimatedStyle,
      sharedSheetRuntimeModel,
      sharedSheetValuesRuntime,
      sharedSheetPresentationRuntime,
    ]
  );
};

export const getAppRouteSharedSheetVisualBinding = (
  owner: AppRouteSharedSheetRuntimeOwner
): AppRouteSharedSheetVisualBinding => ({
  snapPoints: owner.snapPoints,
  sheetTranslateY: owner.sheetTranslateY,
  sheetScrollOffset: owner.sheetScrollOffset,
  sheetMomentum: owner.sheetMomentum,
  getCurrentSheetSnap: () => owner.sheetState,
});
