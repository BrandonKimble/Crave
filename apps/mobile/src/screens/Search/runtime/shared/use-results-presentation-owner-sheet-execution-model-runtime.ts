import React from 'react';

import type { ResultsSheetExecutionModel } from './results-presentation-owner-contract';
import type { ResultsSheetRuntimeOwner } from './results-sheet-runtime-contract';

type UseResultsPresentationOwnerSheetExecutionModelRuntimeArgs = {
  resultsSheetRuntime: Pick<
    ResultsSheetRuntimeOwner,
    'resultsSheetRuntimeModel' | 'shouldRenderResultsSheetRef' | 'resetResultsSheetToHidden'
  >;
};

export const useResultsPresentationOwnerSheetExecutionModelRuntime = ({
  resultsSheetRuntime,
}: UseResultsPresentationOwnerSheetExecutionModelRuntimeArgs): ResultsSheetExecutionModel => {
  const requestResultsSheetSnap = React.useCallback(
    (
      snap: Parameters<ResultsSheetExecutionModel['requestResultsSheetSnap']>[0],
      requestToken: Parameters<ResultsSheetExecutionModel['requestResultsSheetSnap']>[1]
    ) => {
      resultsSheetRuntime.resultsSheetRuntimeModel.snapController.requestSnap(
        snap,
        undefined,
        requestToken
      );
    },
    [resultsSheetRuntime]
  );

  const hideResultsSheet = React.useCallback(
    (requestToken: Parameters<ResultsSheetExecutionModel['hideResultsSheet']>[0]) => {
      if (!resultsSheetRuntime.shouldRenderResultsSheetRef.current) {
        resultsSheetRuntime.resetResultsSheetToHidden();
        return;
      }

      resultsSheetRuntime.resultsSheetRuntimeModel.snapController.requestSnap(
        'hidden',
        undefined,
        requestToken
      );
    },
    [resultsSheetRuntime]
  );

  return React.useMemo(
    () => ({
      requestResultsSheetSnap,
      hideResultsSheet,
    }),
    [hideResultsSheet, requestResultsSheetSnap]
  );
};
