import React from 'react';

import { resolvePreparedResultsBackdropTarget } from './results-presentation-shell-prepared-intent';
import type {
  ResultsPreparedSnapshotShellApplier,
  UseResultsPreparedSnapshotShellApplicationRuntimeArgs,
} from './results-prepared-snapshot-execution-runtime-contract';

export const useResultsPreparedSnapshotShellApplicationRuntime = ({
  cancelSearchSheetCloseTransition,
  setBackdropTarget,
  setInputMode,
}: UseResultsPreparedSnapshotShellApplicationRuntimeArgs): ResultsPreparedSnapshotShellApplier => {
  return React.useCallback(
    (snapshot) => {
      cancelSearchSheetCloseTransition();
      setInputMode('idle');
      setBackdropTarget(resolvePreparedResultsBackdropTarget(snapshot));
    },
    [cancelSearchSheetCloseTransition, setBackdropTarget, setInputMode]
  );
};
