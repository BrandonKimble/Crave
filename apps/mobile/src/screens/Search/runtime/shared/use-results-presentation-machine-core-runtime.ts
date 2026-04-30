import React from 'react';

import { type ResultsPresentationLog } from './results-presentation-runtime-contract';
import {
  createResultsPresentationRuntimeMachine,
  type ResultsPresentationRuntimeMachine,
} from './results-presentation-runtime-machine';
import { type SearchRuntimeBus } from './search-runtime-bus';
import type { ToggleInteractionLifecycleEvent } from './results-toggle-interaction-contract';
import type { PreparedResultsPresentationSnapshot } from './prepared-presentation-transaction';

type UseResultsPresentationMachineCoreRuntimeArgs = {
  searchRuntimeBus: SearchRuntimeBus;
  log: ResultsPresentationLog;
  notifyIntentCompleteRef: React.MutableRefObject<((intentId: string) => void) | null>;
};

export const useResultsPresentationMachineCoreRuntime = ({
  searchRuntimeBus,
  log,
  notifyIntentCompleteRef,
}: UseResultsPresentationMachineCoreRuntimeArgs) => {
  const runtimeMachineRef = React.useRef<ResultsPresentationRuntimeMachine | null>(null);

  if (!runtimeMachineRef.current) {
    runtimeMachineRef.current = createResultsPresentationRuntimeMachine({
      publish: ({ resultsPresentation, resultsPresentationTransport }) => {
        searchRuntimeBus.publish({
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

  const commitPreparedResultsSnapshot = React.useCallback(
    (snapshot: PreparedResultsPresentationSnapshot) => {
      runtimeMachineRef.current!.commitPreparedResultsSnapshot(snapshot);
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
      commitPreparedResultsSnapshot,
      cancelPresentationIntent,
      handleRuntimePresentationIntentAbort,
    }),
    [
      cancelPresentationIntent,
      commitPreparedResultsSnapshot,
      handleRuntimePresentationIntentAbort,
      handleToggleInteractionLifecycle,
    ]
  );
};
