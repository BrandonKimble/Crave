import React from 'react';

import { useSharedValue } from 'react-native-reanimated';

import { calculateSnapPoints, type SheetPosition } from '../../overlays/sheetUtils';
import type { AppRouteSharedSheetRuntimeOwner } from './app-route-shared-sheet-runtime-contract';

type UseAppRouteSharedSheetValuesRuntimeArgs = {
  screenHeight: number;
  searchBarTop: number;
  insetsTop: number;
  navBarTopForSnaps: number;
  overlayTabHeaderHeight: number;
  initialSharedSheetPosition: SheetPosition;
  initialSharedSheetVisible: boolean;
};

export type AppRouteSharedSheetValuesRuntime = Pick<
  AppRouteSharedSheetRuntimeOwner,
  'snapPoints' | 'sheetTranslateY' | 'sheetScrollOffset' | 'sheetMomentum'
> & {
  syncSnapPoints: (input: {
    screenHeight: number;
    searchBarTop: number;
    insetsTop: number;
    navBarTopForSnaps: number;
    overlayTabHeaderHeight: number;
  }) => void;
};

export const useAppRouteSharedSheetValuesRuntime = ({
  screenHeight,
  searchBarTop,
  insetsTop,
  navBarTopForSnaps,
  overlayTabHeaderHeight,
  initialSharedSheetPosition,
  initialSharedSheetVisible,
}: UseAppRouteSharedSheetValuesRuntimeArgs): AppRouteSharedSheetValuesRuntime => {
  const snapPointsRef = React.useRef(
    calculateSnapPoints(
      screenHeight,
      searchBarTop,
      insetsTop,
      navBarTopForSnaps,
      overlayTabHeaderHeight
    )
  );
  const snapPoints = snapPointsRef.current;

  const sheetTranslateY = useSharedValue(
    initialSharedSheetVisible
      ? snapPoints[initialSharedSheetPosition] ?? screenHeight
      : screenHeight
  );
  const sheetScrollOffset = useSharedValue(0);
  const sheetMomentum = useSharedValue(false);

  const syncSnapPoints: AppRouteSharedSheetValuesRuntime['syncSnapPoints'] =
    React.useCallback((input) => {
      const nextSnapPoints = calculateSnapPoints(
        input.screenHeight,
        input.searchBarTop,
        input.insetsTop,
        input.navBarTopForSnaps,
        input.overlayTabHeaderHeight
      );
      const currentSnapPoints = snapPointsRef.current;
      if (
        currentSnapPoints.expanded === nextSnapPoints.expanded &&
        currentSnapPoints.middle === nextSnapPoints.middle &&
        currentSnapPoints.collapsed === nextSnapPoints.collapsed &&
        currentSnapPoints.hidden === nextSnapPoints.hidden
      ) {
        return;
      }
      // F1376: mutate the IDENTITY-STABLE `snapPoints` object in place — its object
      // reference is never reassigned, so any `=== ` identity comparison on `snapPoints`
      // elsewhere is invariant across this update. Consumers must read its fields, never
      // compare the object itself.
      currentSnapPoints.expanded = nextSnapPoints.expanded;
      currentSnapPoints.middle = nextSnapPoints.middle;
      currentSnapPoints.collapsed = nextSnapPoints.collapsed;
      currentSnapPoints.hidden = nextSnapPoints.hidden;
    }, []);

  return React.useMemo(
    () => ({
      snapPoints,
      sheetTranslateY,
      sheetScrollOffset,
      sheetMomentum,
      syncSnapPoints,
    }),
    [sheetMomentum, sheetScrollOffset, sheetTranslateY, snapPoints, syncSnapPoints]
  );
};
