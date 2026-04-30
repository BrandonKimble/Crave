import React from 'react';

import { useSharedValue } from 'react-native-reanimated';

import { calculateSnapPoints, type SheetPosition } from '../../overlays/sheetUtils';
import type { AppRouteResultsSheetRuntimeOwner } from './app-route-results-sheet-runtime-contract';

type UseAppRouteResultsSheetSharedValuesRuntimeArgs = {
  screenHeight: number;
  searchBarTop: number;
  insetsTop: number;
  navBarTopForSnaps: number;
  overlayTabHeaderHeight: number;
  initialResultsSheetPosition: SheetPosition;
  initialResultsPanelVisible: boolean;
};

export type AppRouteResultsSheetSharedValuesRuntime = Pick<
  AppRouteResultsSheetRuntimeOwner,
  'snapPoints' | 'sheetTranslateY' | 'resultsScrollOffset' | 'resultsMomentum'
> & {
  setSheetTranslateYTo: (position: SheetPosition) => void;
  syncSnapPoints: (input: {
    screenHeight: number;
    searchBarTop: number;
    insetsTop: number;
    navBarTopForSnaps: number;
    overlayTabHeaderHeight: number;
  }) => void;
};

export const useAppRouteResultsSheetSharedValuesRuntime = ({
  screenHeight,
  searchBarTop,
  insetsTop,
  navBarTopForSnaps,
  overlayTabHeaderHeight,
  initialResultsSheetPosition,
  initialResultsPanelVisible,
}: UseAppRouteResultsSheetSharedValuesRuntimeArgs): AppRouteResultsSheetSharedValuesRuntime => {
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
    initialResultsPanelVisible
      ? snapPoints[initialResultsSheetPosition] ?? screenHeight
      : screenHeight
  );
  const resultsScrollOffset = useSharedValue(0);
  const resultsMomentum = useSharedValue(false);

  const syncSnapPoints: AppRouteResultsSheetSharedValuesRuntime['syncSnapPoints'] =
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
      currentSnapPoints.expanded = nextSnapPoints.expanded;
      currentSnapPoints.middle = nextSnapPoints.middle;
      currentSnapPoints.collapsed = nextSnapPoints.collapsed;
      currentSnapPoints.hidden = nextSnapPoints.hidden;
    }, []);

  const setSheetTranslateYTo = React.useCallback(
    (position: SheetPosition) => {
      sheetTranslateY.value = snapPointsRef.current[position] ?? screenHeight;
    },
    [screenHeight, sheetTranslateY]
  );

  return React.useMemo(
    () => ({
      snapPoints,
      sheetTranslateY,
      resultsScrollOffset,
      resultsMomentum,
      setSheetTranslateYTo,
      syncSnapPoints,
    }),
    [
      resultsMomentum,
      resultsScrollOffset,
      setSheetTranslateYTo,
      sheetTranslateY,
      snapPoints,
      syncSnapPoints,
    ]
  );
};
