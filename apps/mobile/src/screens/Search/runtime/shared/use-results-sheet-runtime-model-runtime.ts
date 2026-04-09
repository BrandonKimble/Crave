import React from 'react';

import { useBottomSheetRuntimeModel } from '../../../../overlays/useBottomSheetRuntime';
import type { ResultsSheetRuntimeOwner } from './results-sheet-runtime-contract';
import type { ResultsSheetSharedValuesRuntime } from './use-results-sheet-shared-values-runtime';

type UseResultsSheetRuntimeModelRuntimeArgs = {
  sharedValuesRuntime: Pick<
    ResultsSheetSharedValuesRuntime,
    'sheetTranslateY' | 'resultsScrollOffset' | 'resultsMomentum'
  >;
};

export type ResultsSheetRuntimeModelRuntime = Pick<
  ResultsSheetRuntimeOwner,
  'resultsSheetRuntimeModel'
>;

export const useResultsSheetRuntimeModelRuntime = ({
  sharedValuesRuntime,
}: UseResultsSheetRuntimeModelRuntimeArgs): ResultsSheetRuntimeModelRuntime => {
  const resultsSheetRuntimeModel = useBottomSheetRuntimeModel({
    presentationStateOverride: {
      sheetY: sharedValuesRuntime.sheetTranslateY,
      scrollOffset: sharedValuesRuntime.resultsScrollOffset,
      momentumFlag: sharedValuesRuntime.resultsMomentum,
    },
  });

  return React.useMemo(
    () => ({
      resultsSheetRuntimeModel,
    }),
    [resultsSheetRuntimeModel]
  );
};
