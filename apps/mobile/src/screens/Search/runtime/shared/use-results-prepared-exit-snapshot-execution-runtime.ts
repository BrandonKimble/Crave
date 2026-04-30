import React from 'react';

import type {
  ResultsPreparedExitSnapshotExecutor,
  UseResultsPreparedExitSnapshotExecutionRuntimeArgs,
} from './results-prepared-snapshot-execution-runtime-contract';

export const useResultsPreparedExitSnapshotExecutionRuntime = ({
  resultsRuntimeOwner,
  animateSheetTo,
  getCurrentSheetSnap,
  setDisplayQueryOverride,
  beginCloseTransition,
  markSearchSheetCloseSheetSettled,
}: UseResultsPreparedExitSnapshotExecutionRuntimeArgs): ResultsPreparedExitSnapshotExecutor => {
  return React.useCallback(
    (snapshot) => {
      setDisplayQueryOverride('');
      resultsRuntimeOwner.commitPreparedResultsSnapshot(snapshot);
      beginCloseTransition(snapshot.transactionId);
      const currentSheetSnap = getCurrentSheetSnap?.();
      if (currentSheetSnap === 'collapsed' || currentSheetSnap === 'hidden') {
        markSearchSheetCloseSheetSettled?.('collapsed');
      }
      animateSheetTo('collapsed');
      return snapshot.transactionId;
    },
    [
      animateSheetTo,
      beginCloseTransition,
      getCurrentSheetSnap,
      markSearchSheetCloseSheetSettled,
      resultsRuntimeOwner,
      setDisplayQueryOverride,
    ]
  );
};
