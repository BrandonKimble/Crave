import type {
  ResultsPresentationEnterMutationKind,
  SearchSurfaceResultsEnterTransaction,
  SearchSurfaceResultsTransaction,
} from './search-surface-results-transaction';
import type { ScheduleToggleCommit } from './results-toggle-interaction-contract';

export type ExecutionBatchPayload = {
  requestKey: string;
  frameGenerationId: string | null;
  executionBatchId: string | null;
};

export type MarkerEnterStartedPayload = ExecutionBatchPayload & {
  pinCount?: number;
  dotCount?: number;
  labelCount?: number;
  startedAtMs: number;
};

export type MarkerEnterSettledPayload = ExecutionBatchPayload & {
  markerEnterCommitId?: number | null;
  pinCount?: number;
  dotCount?: number;
  labelCount?: number;
  settledAtMs: number;
};

export type ResultsPresentationRuntimeOwner = {
  searchSurfaceResultsTransactionKey: string | null;
  pendingTogglePresentationIntentId: string | null;
  scheduleToggleCommit: ScheduleToggleCommit;
  notifyFrostReady: (intentId: string) => void;
  cancelToggleInteraction: () => void;
  beginSearchThisAreaPresentationPending: () => void;
  stageSearchSurfaceResultsTransaction: (snapshot: SearchSurfaceResultsEnterTransaction) => void;
  commitSearchSurfaceResultsTransaction: (snapshot: SearchSurfaceResultsTransaction) => void;
  clearStagedSearchSurfaceResultsTransaction: (transactionId?: string) => void;
  handlePageOneResultsCommitted: (payload?: {
    surfaceTransactionMutationKind?: Extract<
      ResultsPresentationEnterMutationKind,
      'search_this_area'
    >;
    expectedResultsDataKey?: string | null;
    dataReadyFrom?: 'network' | 'cache' | 'in_flight';
    searchInputKey?: string | null;
  }) => void;
  cancelPresentationIntent: (intentId?: string) => void;
  handlePresentationIntentAbort: () => void;
  handleExecutionBatchMountedHidden: (payload: ExecutionBatchPayload) => void;
  handleMarkerEnterStarted: (payload: MarkerEnterStartedPayload) => void;
  handleMarkerEnterSettled: (payload: MarkerEnterSettledPayload) => void;
  handleMarkerExitStarted: (payload: {
    requestKey: string;
    pinCount?: number;
    dotCount?: number;
    labelCount?: number;
    startedAtMs: number;
  }) => void;
  handleMarkerExitSettled: (payload: {
    requestKey: string;
    pinCount?: number;
    dotCount?: number;
    labelCount?: number;
    settledAtMs: number;
  }) => void;
};
