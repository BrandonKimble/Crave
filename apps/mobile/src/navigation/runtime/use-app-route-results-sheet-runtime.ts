import React from 'react';
import { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated';

import { OVERLAY_TAB_HEADER_HEIGHT } from '../../overlays/overlaySheetStyles';
import { useBottomSheetRuntimeModel } from '../../overlays/useBottomSheetRuntime';
import type { OverlaySheetSnap } from '../../overlays/types';
import { SCREEN_HEIGHT } from '../../screens/Search/constants/search';
import { getSearchStartupGeometrySeed } from '../../screens/Search/runtime/shared/search-startup-geometry';
import { withSearchNavSwitchRuntimeAttribution } from '../../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import type {
  AppRouteResultsSheetRuntimeOwner,
  AppRouteResultsSheetVisualBinding,
} from './app-route-results-sheet-runtime-contract';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';
import type { AppRouteOverlaySessionSnapshot } from './app-route-overlay-session-contract';
import type { RouteOverlayRootSnapshot } from './route-overlay-display-snapshot-contract';
import type { RouteHostOverlayGeometryBinding } from './route-host-overlay-geometry-state-controller';
import { useAppRouteResultsSheetSharedValuesRuntime } from './use-app-route-results-sheet-shared-values-runtime';
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

const selectRouteResultsSheetSessionState = (snapshot: { isDockedPollsDismissed: boolean }) => ({
  isDockedPollsDismissed: snapshot.isDockedPollsDismissed,
});

const areRouteResultsSheetSessionStatesEqual = (
  left: ReturnType<typeof selectRouteResultsSheetSessionState>,
  right: ReturnType<typeof selectRouteResultsSheetSessionState>
): boolean => left.isDockedPollsDismissed === right.isDockedPollsDismissed;

const selectRouteResultsSheetOverlaySessionState = (snapshot: AppRouteOverlaySessionSnapshot) => ({
  shouldShowDockedPollsTarget: snapshot.shouldShowDockedPollsTarget,
});

const areRouteResultsSheetOverlaySessionStatesEqual = (
  left: ReturnType<typeof selectRouteResultsSheetOverlaySessionState>,
  right: ReturnType<typeof selectRouteResultsSheetOverlaySessionState>
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

const resolveInitialResultsSheetPosition = ({
  shouldShowDockedPollsTarget,
  currentPollsSheetSnap,
  hasUserSharedSnap,
  sharedSnap,
}: {
  shouldShowDockedPollsTarget: boolean;
  currentPollsSheetSnap: OverlaySheetSnap;
  hasUserSharedSnap: boolean;
  sharedSnap: Exclude<OverlaySheetSnap, 'hidden'>;
}): SheetPosition => {
  if (!shouldShowDockedPollsTarget) {
    return 'hidden';
  }
  if (currentPollsSheetSnap !== 'hidden') {
    return currentPollsSheetSnap;
  }
  return hasUserSharedSnap ? sharedSnap : 'collapsed';
};

export const useAppRouteResultsSheetRuntime = ({
  insetsTop,
  routeSceneRuntime,
}: {
  insetsTop: number;
  routeSceneRuntime: AppRouteSceneRuntime;
}): AppRouteResultsSheetRuntimeOwner => {
  useSearchNavSwitchCommitAttribution('AppRouteResultsSheetRuntime');
  const initialRouteOverlayMotionState = React.useMemo(
    () => selectRouteOverlayMotionState(routeSceneRuntime.routeOverlayRootAuthority.getSnapshot()),
    [routeSceneRuntime.routeOverlayRootAuthority]
  );
  const initialRouteResultsSheetOverlaySessionState = React.useMemo(
    () =>
      selectRouteResultsSheetOverlaySessionState(
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
  const initialSheetSnapSessionSnapshot =
    routeSceneRuntime.routeSheetSnapSessionAuthority.getSnapshot();
  const initialResultsSheetPosition = resolveInitialResultsSheetPosition({
    shouldShowDockedPollsTarget:
      initialRouteResultsSheetOverlaySessionState.shouldShowDockedPollsTarget,
    currentPollsSheetSnap:
      routeSceneRuntime.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('polls'),
    hasUserSharedSnap: initialSheetSnapSessionSnapshot.hasUserSharedSnap,
    sharedSnap: initialSheetSnapSessionSnapshot.sharedSnap,
  });
  const initialResultsPanelVisible = initialResultsSheetPosition !== 'hidden';

  const resultsSheetSharedValuesRuntime = useAppRouteResultsSheetSharedValuesRuntime({
    screenHeight: SCREEN_HEIGHT,
    searchBarTop: initialRouteHostOverlayGeometry.searchBarTop,
    insetsTop,
    navBarTopForSnaps: initialRouteHostOverlayGeometry.navBarTopForSnaps,
    overlayTabHeaderHeight: OVERLAY_TAB_HEADER_HEIGHT,
    initialResultsSheetPosition,
    initialResultsPanelVisible,
  });
  const resultsSheetRuntimeModel = useBottomSheetRuntimeModel({
    presentationStateOverride: {
      sheetY: resultsSheetSharedValuesRuntime.sheetTranslateY,
      scrollOffset: resultsSheetSharedValuesRuntime.resultsScrollOffset,
      momentumFlag: resultsSheetSharedValuesRuntime.resultsMomentum,
    },
  });
  const headerDividerAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: interpolate(
        resultsSheetSharedValuesRuntime.resultsScrollOffset.value,
        [0, 24],
        [0, 1],
        Extrapolation.CLAMP
      ),
    }),
    [resultsSheetSharedValuesRuntime.resultsScrollOffset]
  );
  const resultsContainerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: resultsSheetSharedValuesRuntime.sheetTranslateY.value }],
  }));
  const getPollsSheetSnap = React.useCallback(
    () => routeSceneRuntime.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('polls'),
    [routeSceneRuntime.routeSheetSnapSessionActions]
  );
  const resultsSheetVisibilityRuntime = routeSceneRuntime.routeResultsSheetVisibilityRuntime;

  React.useLayoutEffect(() => {
    let lastRouteOverlayMotionState = initialRouteOverlayMotionState;
    let lastRouteResultsSheetOverlaySessionState = initialRouteResultsSheetOverlaySessionState;
    let lastRouteResultsSheetSessionState = selectRouteResultsSheetSessionState(
      routeSceneRuntime.routeSheetSnapSessionAuthority.getSnapshot()
    );

    const syncResultsSheetInput = () => {
      withSearchNavSwitchRuntimeAttribution(
        'AppRouteResultsSheetRuntime',
        'syncVisibilityInput',
        () => {
          const routeOverlayMotionState = selectRouteOverlayMotionState(
            routeSceneRuntime.routeOverlayRootAuthority.getSnapshot()
          );
          if (
            !areRouteOverlayMotionStatesEqual(lastRouteOverlayMotionState, routeOverlayMotionState)
          ) {
            lastRouteOverlayMotionState = routeOverlayMotionState;
          }

          const routeResultsSheetOverlaySessionState = selectRouteResultsSheetOverlaySessionState(
            routeSceneRuntime.routeOverlaySessionAuthority.getSnapshot()
          );
          if (
            !areRouteResultsSheetOverlaySessionStatesEqual(
              lastRouteResultsSheetOverlaySessionState,
              routeResultsSheetOverlaySessionState
            )
          ) {
            lastRouteResultsSheetOverlaySessionState = routeResultsSheetOverlaySessionState;
          }

          const routeResultsSheetSessionState = selectRouteResultsSheetSessionState(
            routeSceneRuntime.routeSheetSnapSessionAuthority.getSnapshot()
          );
          if (
            !areRouteResultsSheetSessionStatesEqual(
              lastRouteResultsSheetSessionState,
              routeResultsSheetSessionState
            )
          ) {
            lastRouteResultsSheetSessionState = routeResultsSheetSessionState;
          }

          const routeHostOverlayGeometry = getRouteHostOverlayGeometryInput(
            routeSceneRuntime.routeHostOverlayGeometryAuthority.getSnapshot()
          );
          resultsSheetSharedValuesRuntime.syncSnapPoints({
            screenHeight: SCREEN_HEIGHT,
            searchBarTop: routeHostOverlayGeometry.searchBarTop,
            insetsTop,
            navBarTopForSnaps: routeHostOverlayGeometry.navBarTopForSnaps,
            overlayTabHeaderHeight: OVERLAY_TAB_HEADER_HEIGHT,
          });

          const overlaySheetPositionState =
            routeSceneRuntime.routeSheetSnapSessionAuthority.getSnapshot();
          const nextInitialResultsSheetPosition = resolveInitialResultsSheetPosition({
            shouldShowDockedPollsTarget:
              routeResultsSheetOverlaySessionState.shouldShowDockedPollsTarget,
            currentPollsSheetSnap:
              routeSceneRuntime.routeSheetSnapSessionActions.getRouteSceneSwitchSceneSnap('polls'),
            hasUserSharedSnap: overlaySheetPositionState.hasUserSharedSnap,
            sharedSnap: overlaySheetPositionState.sharedSnap,
          });

          resultsSheetVisibilityRuntime.syncInput({
            isSearchOverlay: routeOverlayMotionState.isSearchOverlay,
            shouldShowDockedPollsTarget:
              routeResultsSheetOverlaySessionState.shouldShowDockedPollsTarget,
            getPollsSheetSnap,
            isDockedPollsDismissed: routeResultsSheetSessionState.isDockedPollsDismissed,
            hasUserSharedSnap: overlaySheetPositionState.hasUserSharedSnap,
            sharedSnap: overlaySheetPositionState.sharedSnap,
            navBarTopForSnaps: routeHostOverlayGeometry.navBarTopForSnaps,
            initialResultsSheetPosition: nextInitialResultsSheetPosition,
            initialResultsPanelVisible: nextInitialResultsSheetPosition !== 'hidden',
            clearSheetCommand: resultsSheetRuntimeModel.snapController.clearCommand,
            setSheetTranslateYTo: resultsSheetSharedValuesRuntime.setSheetTranslateYTo,
          });
        }
      );
    };

    syncResultsSheetInput();
    const unregisterRouteOverlayRootTarget =
      routeSceneRuntime.routeOverlayRootAuthority.registerTarget({
        attributionLabel: 'resultsSheetInput',
        syncRootSnapshot: (snapshot) => {
          const routeOverlayMotionState = selectRouteOverlayMotionState(snapshot);
          if (
            areRouteOverlayMotionStatesEqual(lastRouteOverlayMotionState, routeOverlayMotionState)
          ) {
            return;
          }
          syncResultsSheetInput();
        },
      });
    const unsubscribeRouteOverlaySession = routeSceneRuntime.routeOverlaySessionAuthority.subscribe(
      () => {
        const routeResultsSheetOverlaySessionState = selectRouteResultsSheetOverlaySessionState(
          routeSceneRuntime.routeOverlaySessionAuthority.getSnapshot()
        );
        if (
          areRouteResultsSheetOverlaySessionStatesEqual(
            lastRouteResultsSheetOverlaySessionState,
            routeResultsSheetOverlaySessionState
          )
        ) {
          return;
        }
        syncResultsSheetInput();
      }
    );
    const unsubscribeRouteHostOverlayGeometry =
      routeSceneRuntime.routeHostOverlayGeometryAuthority.subscribe(syncResultsSheetInput);
    const unsubscribeRouteSheetSnapSession =
      routeSceneRuntime.routeSheetSnapSessionAuthority.subscribe(syncResultsSheetInput);

    return () => {
      unregisterRouteOverlayRootTarget();
      unsubscribeRouteOverlaySession();
      unsubscribeRouteHostOverlayGeometry();
      unsubscribeRouteSheetSnapSession();
    };
  }, [
    getPollsSheetSnap,
    initialRouteOverlayMotionState,
    initialRouteResultsSheetOverlaySessionState,
    initialResultsPanelVisible,
    initialResultsSheetPosition,
    insetsTop,
    resultsSheetRuntimeModel.snapController.clearCommand,
    resultsSheetSharedValuesRuntime.setSheetTranslateYTo,
    resultsSheetSharedValuesRuntime.syncSnapPoints,
    resultsSheetVisibilityRuntime,
    routeSceneRuntime.routeHostOverlayGeometryAuthority,
    routeSceneRuntime.routeOverlayRootAuthority,
    routeSceneRuntime.routeOverlaySessionAuthority,
    routeSceneRuntime.routeSheetSnapSessionActions,
    routeSceneRuntime.routeSheetSnapSessionAuthority,
  ]);

  return React.useMemo(
    () => ({
      get snapPoints() {
        return resultsSheetSharedValuesRuntime.snapPoints;
      },
      get panelVisible() {
        return resultsSheetVisibilityRuntime.getSnapshot().panelVisible;
      },
      get sheetState() {
        return resultsSheetVisibilityRuntime.getSnapshot().sheetState;
      },
      sheetTranslateY: resultsSheetSharedValuesRuntime.sheetTranslateY,
      resultsScrollOffset: resultsSheetSharedValuesRuntime.resultsScrollOffset,
      resultsMomentum: resultsSheetSharedValuesRuntime.resultsMomentum,
      resultsSheetRuntimeModel,
      get shouldRenderResultsSheet() {
        return resultsSheetVisibilityRuntime.getSnapshot().shouldRenderResultsSheet;
      },
      shouldRenderResultsSheetRef: resultsSheetVisibilityRuntime.shouldRenderResultsSheetRef,
      headerDividerAnimatedStyle,
      resultsContainerAnimatedStyle,
      resetResultsSheetToHidden: resultsSheetVisibilityRuntime.resetResultsSheetToHidden,
      prepareShortcutSheetTransition: resultsSheetVisibilityRuntime.prepareShortcutSheetTransition,
      handleSheetSnapChange: resultsSheetVisibilityRuntime.handleSheetSnapChange,
    }),
    [
      headerDividerAnimatedStyle,
      resultsContainerAnimatedStyle,
      resultsSheetRuntimeModel,
      resultsSheetSharedValuesRuntime,
      resultsSheetVisibilityRuntime,
    ]
  );
};

export const getAppRouteResultsSheetVisualBinding = (
  owner: AppRouteResultsSheetRuntimeOwner
): AppRouteResultsSheetVisualBinding => ({
  snapPoints: owner.snapPoints,
  sheetTranslateY: owner.sheetTranslateY,
  resultsScrollOffset: owner.resultsScrollOffset,
  resultsMomentum: owner.resultsMomentum,
  handleSheetSnapChange: owner.handleSheetSnapChange,
  getCurrentSheetSnap: () => owner.sheetState,
});
