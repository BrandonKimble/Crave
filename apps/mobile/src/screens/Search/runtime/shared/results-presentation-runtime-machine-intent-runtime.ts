import type {
  SearchSurfaceResultsEnterTransaction,
  SearchSurfaceResultsExitTransaction,
  SearchSurfaceResultsTransaction,
} from './search-surface-results-transaction';
import { resolveNamedAppliedResultsPresentationCoverStateTransportAttempt } from './results-presentation-runtime-machine-cover-state-transport';
import {
  resolveAbortedResultsPresentationTransportAttempt,
  resolveCancelledResultsPresentationTransportAttempt,
  resolveCommittedResultsPresentationTransportAttempt,
  resolveToggleInteractionLifecycleTransportAttempt,
} from './results-presentation-runtime-machine-intent-lifecycle-transport';
import type { ResultsPresentationRuntimeMachineOwnerRuntime } from './results-presentation-runtime-machine-owner-runtime';
import type { ToggleInteractionLifecycleEvent } from './results-toggle-interaction-contract';

export const createResultsPresentationRuntimeMachineIntentRuntime = ({
  ownerRuntime,
}: {
  ownerRuntime: ResultsPresentationRuntimeMachineOwnerRuntime;
}) => {
  const commitSearchSurfaceResultsTransportSnapshot = (
    snapshot: SearchSurfaceResultsTransaction,
    label: string
  ) => {
    ownerRuntime.applyAttempt((draft) => {
      if (
        draft.transactionId === snapshot.transactionId &&
        draft.snapshotKind === snapshot.kind &&
        draft.executionStage !== 'idle' &&
        draft.executionStage !== 'settled'
      ) {
        return {
          nextState: null,
          appliedLog: null,
        };
      }
      return resolveCommittedResultsPresentationTransportAttempt(snapshot, label);
    });
  };

  return {
    applyStagingCoverState(nextCoverState: 'initial_loading' | 'interaction_loading') {
      ownerRuntime.applyAttempt((draft) =>
        resolveNamedAppliedResultsPresentationCoverStateTransportAttempt(
          draft,
          nextCoverState,
          'applyStagingCoverState'
        )
      );
    },
    handleToggleInteractionLifecycle(event: ToggleInteractionLifecycleEvent) {
      ownerRuntime.applyAttempt((draft) =>
        resolveToggleInteractionLifecycleTransportAttempt(draft, event)
      );
    },
    handlePresentationIntentAbort() {
      ownerRuntime.applyAttempt((draft) => resolveAbortedResultsPresentationTransportAttempt(draft));
    },
    commitSearchSurfaceResultsEnterPresentation(snapshot: SearchSurfaceResultsEnterTransaction) {
      commitSearchSurfaceResultsTransportSnapshot(
        snapshot,
        'commitSearchSurfaceResultsEnterPresentation'
      );
    },
    commitSearchSurfaceResultsExitTransaction(snapshot: SearchSurfaceResultsExitTransaction) {
      commitSearchSurfaceResultsTransportSnapshot(
        snapshot,
        'commitSearchSurfaceResultsExitTransaction'
      );
    },
    cancelPresentationIntent(intentId?: string) {
      ownerRuntime.applyAttempt((draft) =>
        resolveCancelledResultsPresentationTransportAttempt(draft, intentId)
      );
    },
  };
};
