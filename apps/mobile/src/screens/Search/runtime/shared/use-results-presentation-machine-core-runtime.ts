import React from 'react';

import { type ResultsPresentationLog } from './results-presentation-runtime-contract';
import {
  createResultsPresentationRuntimeMachine,
  type ResultsPresentationRuntimeMachine,
} from './results-presentation-runtime-machine';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { ToggleInteractionLifecycleEvent } from './results-toggle-interaction-contract';
import type { SearchSurfaceResultsTransaction } from './search-surface-results-transaction';

type UseResultsPresentationMachineCoreRuntimeArgs = {
  resultsPresentationAuthority: ResultsPresentationAuthority;
  log: ResultsPresentationLog;
  notifyIntentCompleteRef: React.MutableRefObject<((intentId: string) => void) | null>;
};

export const useResultsPresentationMachineCoreRuntime = ({
  resultsPresentationAuthority,
  log,
  notifyIntentCompleteRef,
}: UseResultsPresentationMachineCoreRuntimeArgs) => {
  const runtimeMachineRef = React.useRef<ResultsPresentationRuntimeMachine | null>(null);

  if (!runtimeMachineRef.current) {
    runtimeMachineRef.current = createResultsPresentationRuntimeMachine({
      publish: ({ resultsPresentation, resultsPresentationTransport }) => {
        resultsPresentationAuthority.publishRuntimeState({
          resultsPresentation,
          resultsPresentationTransport,
        });
      },
      log,
      onIntentComplete: (intentId) => {
        notifyIntentCompleteRef.current?.(intentId);
      },
    });
  }

  const handleToggleInteractionLifecycle = React.useCallback(
    (event: ToggleInteractionLifecycleEvent) => {
      runtimeMachineRef.current?.handleToggleInteractionLifecycle(event);
    },
    []
  );

  const commitSearchSurfaceResultsTransaction = React.useCallback(
    (snapshot: SearchSurfaceResultsTransaction) => {
      runtimeMachineRef.current!.commitSearchSurfaceResultsTransaction(snapshot);
    },
    []
  );

  const cancelPresentationIntent = React.useCallback((intentId?: string) => {
    runtimeMachineRef.current?.cancelPresentationIntent(intentId);
  }, []);

  const handleRuntimePresentationIntentAbort = React.useCallback(() => {
    runtimeMachineRef.current?.handlePresentationIntentAbort();
  }, []);

  return React.useMemo(
    () => ({
      runtimeMachineRef,
      handleToggleInteractionLifecycle,
      commitSearchSurfaceResultsTransaction,
      cancelPresentationIntent,
      handleRuntimePresentationIntentAbort,
    }),
    [
      cancelPresentationIntent,
      commitSearchSurfaceResultsTransaction,
      handleRuntimePresentationIntentAbort,
      handleToggleInteractionLifecycle,
    ]
  );
};
