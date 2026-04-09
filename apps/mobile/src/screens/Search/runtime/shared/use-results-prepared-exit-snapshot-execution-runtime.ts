import React from 'react';

import type {
  ResultsPreparedExitSnapshotExecutor,
  UseResultsPreparedExitSnapshotExecutionRuntimeArgs,
} from './results-prepared-snapshot-execution-runtime-contract';

export const useResultsPreparedExitSnapshotExecutionRuntime = ({
  resultsRuntimeOwner,
  animateSheetTo,
  setDisplayQueryOverride,
  beginCloseTransition,
}: UseResultsPreparedExitSnapshotExecutionRuntimeArgs): ResultsPreparedExitSnapshotExecutor => {
  return React.useCallback(
    (snapshot) => {
      setDisplayQueryOverride('');
      resultsRuntimeOwner.commitPreparedResultsSnapshot(snapshot);
      beginCloseTransition(snapshot.transactionId);
      animateSheetTo('collapsed');
      return snapshot.transactionId;
    },
    [animateSheetTo, beginCloseTransition, resultsRuntimeOwner, setDisplayQueryOverride]
  );
};
