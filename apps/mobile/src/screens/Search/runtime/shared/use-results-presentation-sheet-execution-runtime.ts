import React from 'react';

import { createResultsSheetExecutionModelValue } from '../controller/results-presentation-owner-runtime';
import type { ResultsPresentationOwner } from './results-presentation-owner-contract';
import type { AppRouteResultsSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-results-sheet-runtime-contract';

type UseResultsPresentationSheetExecutionRuntimeArgs = {
  resultsSheetRuntime: Pick<
    AppRouteResultsSheetRuntimeOwner,
    | 'shouldRenderResultsSheetRef'
    | 'resetResultsSheetToHidden'
    | 'animateSheetTo'
  >;
};

export const useResultsPresentationSheetExecutionRuntime = ({
  resultsSheetRuntime,
}: UseResultsPresentationSheetExecutionRuntimeArgs) => {
  const {
    animateSheetTo,
    resetResultsSheetToHidden,
    shouldRenderResultsSheetRef,
  } = resultsSheetRuntime;
  const requestResultsSheetSnap = React.useCallback(
    (
      snap: Parameters<ResultsPresentationOwner['resultsSheetExecutionModel']['requestResultsSheetSnap']>[0],
      requestToken: Parameters<ResultsPresentationOwner['resultsSheetExecutionModel']['requestResultsSheetSnap']>[1]
    ) => {
      animateSheetTo(snap, 0, requestToken);
    },
    [animateSheetTo]
  );

  const hideResultsSheet = React.useCallback(
    (
      requestToken: Parameters<ResultsPresentationOwner['resultsSheetExecutionModel']['hideResultsSheet']>[0]
    ) => {
      if (!shouldRenderResultsSheetRef.current) {
        resetResultsSheetToHidden();
        return;
      }

      animateSheetTo('hidden', 0, requestToken);
    },
    [animateSheetTo, resetResultsSheetToHidden, shouldRenderResultsSheetRef]
  );

  return React.useMemo(
    () =>
      createResultsSheetExecutionModelValue({
        requestResultsSheetSnap,
        hideResultsSheet,
      }),
    [hideResultsSheet, requestResultsSheetSnap]
  );
};
