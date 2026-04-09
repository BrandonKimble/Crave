import React from 'react';

import { useSharedValue } from 'react-native-reanimated';

import { calculateSnapPoints, type SheetPosition } from '../../../../overlays/sheetUtils';
import type { ResultsSheetRuntimeOwner } from './results-sheet-runtime-contract';

type UseResultsSheetSharedValuesRuntimeArgs = {
  screenHeight: number;
  searchBarTop: number;
  insetsTop: number;
  navBarTopForSnaps: number;
  overlayTabHeaderHeight: number;
  initialResultsSheetPosition: SheetPosition;
  initialResultsPanelVisible: boolean;
};

export type ResultsSheetSharedValuesRuntime = Pick<
  ResultsSheetRuntimeOwner,
  'snapPoints' | 'sheetTranslateY' | 'resultsScrollOffset' | 'resultsMomentum'
> & {
  setSheetTranslateYTo: (position: SheetPosition) => void;
};

export const useResultsSheetSharedValuesRuntime = ({
  screenHeight,
  searchBarTop,
  insetsTop,
  navBarTopForSnaps,
  overlayTabHeaderHeight,
  initialResultsSheetPosition,
  initialResultsPanelVisible,
}: UseResultsSheetSharedValuesRuntimeArgs): ResultsSheetSharedValuesRuntime => {
  const snapPoints = React.useMemo(
    () =>
      calculateSnapPoints(
        screenHeight,
        searchBarTop,
        insetsTop,
        navBarTopForSnaps,
        overlayTabHeaderHeight
      ),
    [insetsTop, navBarTopForSnaps, overlayTabHeaderHeight, screenHeight, searchBarTop]
  );

  const sheetTranslateY = useSharedValue(
    initialResultsPanelVisible
      ? snapPoints[initialResultsSheetPosition] ?? screenHeight
      : screenHeight
  );
  const resultsScrollOffset = useSharedValue(0);
  const resultsMomentum = useSharedValue(false);

  const setSheetTranslateYTo = React.useCallback(
    (position: SheetPosition) => {
      sheetTranslateY.value = snapPoints[position] ?? screenHeight;
    },
    [screenHeight, sheetTranslateY, snapPoints]
  );

  return React.useMemo(
    () => ({
      snapPoints,
      sheetTranslateY,
      resultsScrollOffset,
      resultsMomentum,
      setSheetTranslateYTo,
    }),
    [resultsMomentum, resultsScrollOffset, setSheetTranslateYTo, sheetTranslateY, snapPoints]
  );
};
