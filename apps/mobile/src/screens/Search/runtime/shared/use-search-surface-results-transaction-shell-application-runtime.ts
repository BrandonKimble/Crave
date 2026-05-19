import React from 'react';

import { resolveSearchSurfaceResultsBackdropTarget } from './results-presentation-shell-transaction-intent';
import type {
  ResultsSurfaceTransactionShellApplier,
  UseResultsSurfaceTransactionShellApplicationRuntimeArgs,
} from './search-surface-results-transaction-execution-runtime-contract';

export const useResultsSurfaceTransactionShellApplicationRuntime = ({
  cancelSearchSheetCloseTransition,
  routeSceneVisibilityPolicyRuntime,
  setBackdropTarget,
  setInputMode,
}: UseResultsSurfaceTransactionShellApplicationRuntimeArgs): ResultsSurfaceTransactionShellApplier => {
  return React.useCallback(
    (snapshot) => {
      cancelSearchSheetCloseTransition();
      routeSceneVisibilityPolicyRuntime.updateInputMode('idle');
      setInputMode('idle');
      setBackdropTarget(resolveSearchSurfaceResultsBackdropTarget(snapshot));
    },
    [
      cancelSearchSheetCloseTransition,
      routeSceneVisibilityPolicyRuntime,
      setBackdropTarget,
      setInputMode,
    ]
  );
};
