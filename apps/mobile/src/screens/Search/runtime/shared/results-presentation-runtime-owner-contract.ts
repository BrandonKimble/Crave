import type { PreparedResultsPresentationSnapshot } from './prepared-presentation-transaction';
import type { ScheduleToggleCommit } from './results-toggle-interaction-contract';

export type ExecutionBatchPayload = {
  requestKey: string;
  frameGenerationId: string | null;
  executionBatchId: string | null;
};

export type MarkerEnterSettledPayload = ExecutionBatchPayload & {
  markerEnterCommitId: number | null;
  settledAtMs: number;
};

export type ResultsPresentationRuntimeOwner = {
  preparedResultsSnapshotKey: string | null;
  pendingTogglePresentationIntentId: string | null;
  scheduleToggleCommit: ScheduleToggleCommit;
  notifyFrostReady: (intentId: string) => void;
  cancelToggleInteraction: () => void;
  stagePreparedResultsSnapshot: (snapshot: PreparedResultsPresentationSnapshot) => void;
  commitPreparedResultsSnapshot: (snapshot: PreparedResultsPresentationSnapshot) => void;
  clearStagedPreparedResultsSnapshot: (transactionId?: string) => void;
  handlePageOneResultsCommitted: () => void;
  cancelPresentationIntent: (intentId?: string) => void;
  handlePresentationIntentAbort: () => void;
  handleExecutionBatchMountedHidden: (payload: ExecutionBatchPayload) => void;
  handleMarkerEnterStarted: (payload: ExecutionBatchPayload) => void;
  handleMarkerEnterSettled: (payload: MarkerEnterSettledPayload) => void;
  handleMarkerExitStarted: (payload: { requestKey: string; startedAtMs: number }) => void;
  handleMarkerExitSettled: (payload: { requestKey: string; settledAtMs: number }) => void;
};
