import React from 'react';

import { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated';

import type { ResultsSheetRuntimeOwner } from './results-sheet-runtime-contract';
import type { ResultsSheetSharedValuesRuntime } from './use-results-sheet-shared-values-runtime';

type UseResultsSheetAnimatedStylesRuntimeArgs = {
  sharedValuesRuntime: Pick<
    ResultsSheetSharedValuesRuntime,
    'sheetTranslateY' | 'resultsScrollOffset'
  >;
};

export type ResultsSheetAnimatedStylesRuntime = Pick<
  ResultsSheetRuntimeOwner,
  'headerDividerAnimatedStyle' | 'resultsContainerAnimatedStyle'
>;

export const useResultsSheetAnimatedStylesRuntime = ({
  sharedValuesRuntime,
}: UseResultsSheetAnimatedStylesRuntimeArgs): ResultsSheetAnimatedStylesRuntime => {
  const headerDividerAnimatedStyle = useAnimatedStyle(
    () => ({
      opacity: interpolate(
        sharedValuesRuntime.resultsScrollOffset.value,
        [0, 24],
        [0, 1],
        Extrapolation.CLAMP
      ),
    }),
    [sharedValuesRuntime.resultsScrollOffset]
  );

  const resultsContainerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sharedValuesRuntime.sheetTranslateY.value }],
  }));

  return React.useMemo(
    () => ({
      headerDividerAnimatedStyle,
      resultsContainerAnimatedStyle,
    }),
    [headerDividerAnimatedStyle, resultsContainerAnimatedStyle]
  );
};
