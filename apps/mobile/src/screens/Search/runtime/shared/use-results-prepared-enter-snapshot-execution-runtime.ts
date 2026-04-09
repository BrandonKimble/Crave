import React from 'react';

import { resolvePreparedResultsSheetTargetSnap } from './results-presentation-shell-prepared-intent';
import type {
  ResultsPreparedEnterSnapshotExecutor,
  UseResultsPreparedEnterSnapshotExecutionRuntimeArgs,
} from './results-prepared-snapshot-execution-runtime-contract';

export const useResultsPreparedEnterSnapshotExecutionRuntime = ({
  resultsRuntimeOwner,
  animateSheetTo,
  prepareShortcutSheetTransition,
  setDisplayQueryOverride,
}: UseResultsPreparedEnterSnapshotExecutionRuntimeArgs): ResultsPreparedEnterSnapshotExecutor => {
  return React.useCallback(
    ({
      snapshot,
      displayQueryOverride,
      preserveSheetState = false,
      shouldPrepareShortcutSheetTransition = false,
    }) => {
      setDisplayQueryOverride(displayQueryOverride ?? '');
      const targetSnap = resolvePreparedResultsSheetTargetSnap(snapshot.kind, preserveSheetState);
      if (targetSnap != null) {
        if (shouldPrepareShortcutSheetTransition) {
          prepareShortcutSheetTransition?.();
        }
        animateSheetTo(targetSnap);
      }
      resultsRuntimeOwner.stagePreparedResultsSnapshot(snapshot);
      return snapshot.transactionId;
    },
    [animateSheetTo, prepareShortcutSheetTransition, resultsRuntimeOwner, setDisplayQueryOverride]
  );
};
