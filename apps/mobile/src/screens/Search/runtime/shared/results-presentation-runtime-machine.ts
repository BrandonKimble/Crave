import type {
  SearchSurfaceResultsEnterTransaction,
  SearchSurfaceResultsExitTransaction,
} from './search-surface-results-transaction';
import type {
  ResultsPresentationLog,
  ResultsPresentationTransportState,
} from './results-presentation-runtime-contract';
import { createResultsPresentationRuntimeMachineExecutionRuntime } from './results-presentation-runtime-machine-execution-runtime';
import { createResultsPresentationRuntimeMachineIntentRuntime } from './results-presentation-runtime-machine-intent-runtime';
import { createResultsPresentationRuntimeMachineOwnerRuntime } from './results-presentation-runtime-machine-owner-runtime';
import { type ResultsPresentationRuntimeState } from './results-presentation-runtime-machine-state';
import type { ToggleInteractionLifecycleEvent } from './results-toggle-interaction-contract';

type ResultsPresentationRuntimeMachineOptions = {
  publish: (payload: ResultsPresentationRuntimeState) => void;
  log?: ResultsPresentationLog;
  onIntentComplete?: (intentId: string) => void;
  now?: () => number;
};

export type ResultsPresentationRuntimeMachine = {
  applyStagingCoverState: (nextCoverState: 'initial_loading' | 'interaction_loading') => void;
  handleToggleInteractionLifecycle: (event: ToggleInteractionLifecycleEvent) => void;
  handlePresentationIntentAbort: () => void;
  commitSearchSurfaceResultsEnterPresentation: (
    snapshot: SearchSurfaceResultsEnterTransaction
  ) => void;
  commitSearchSurfaceResultsExitTransaction: (
    snapshot: SearchSurfaceResultsExitTransaction
  ) => void;
  cancelPresentationIntent: (intentId?: string) => void;
  markEnterBatchMountedHidden: (
    intentId: string,
    executionBatch: NonNullable<ResultsPresentationTransportState['executionBatch']>
  ) => boolean;
  markEnterStarted: (
    intentId: string,
    executionBatch: ResultsPresentationTransportState['executionBatch']
  ) => boolean;
  markEnterNativeStartRequested: (
    intentId: string,
    executionBatch: ResultsPresentationTransportState['executionBatch']
  ) => boolean;
  markEnterBatchSettled: (
    intentId: string,
    executionBatch: ResultsPresentationTransportState['executionBatch']
  ) => boolean;
  markExitStarted: (payload: { requestKey: string; startedAtMs: number }) => boolean;
  markExitSettled: (payload: { requestKey: string; settledAtMs: number }) => boolean;
};

export const createResultsPresentationRuntimeMachine = (
  options: ResultsPresentationRuntimeMachineOptions
): ResultsPresentationRuntimeMachine => {
  const now = options.now ?? (() => globalThis.performance?.now?.() ?? Date.now());
  const ownerRuntime = createResultsPresentationRuntimeMachineOwnerRuntime({
    publish: options.publish,
    log: options.log,
  });
  const intentRuntime = createResultsPresentationRuntimeMachineIntentRuntime({
    ownerRuntime,
  });
  const executionRuntime = createResultsPresentationRuntimeMachineExecutionRuntime({
    ownerRuntime,
    now,
    onIntentComplete: options.onIntentComplete,
  });

  return {
    ...intentRuntime,
    ...executionRuntime,
  };
};
