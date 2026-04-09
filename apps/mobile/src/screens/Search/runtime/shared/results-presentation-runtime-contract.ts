import type {
  PreparedResultsPresentationSnapshot,
  ResultsPresentationCoverState,
} from './prepared-presentation-transaction';

export type ResultsPresentationLog = (label: string, data?: Record<string, unknown>) => void;

type ResultsPresentationExecutionBatchRef = {
  batchId: string;
  generationId: string;
};

type ResultsPresentationExecutionStage =
  | 'enter_pending_mount'
  | 'enter_mounted_hidden'
  | 'enter_executing'
  | 'exit_requested'
  | 'exit_executing'
  | 'settled'
  | 'idle';

type ResultsPresentationRenderPolicy = {
  surfaceMode: 'none' | 'initial_loading' | 'interaction_loading';
  contentVisibility: 'hidden' | 'frozen' | 'visible';
  isAwaitingEnterMount: boolean;
  isEntering: boolean;
  isClosing: boolean;
};

export type ResultsPresentationReadModel = ResultsPresentationRenderPolicy & {
  isPending: boolean;
  isSettled: boolean;
};

export type ResultsPresentationTransportState = {
  transactionId: string | null;
  snapshotKind: PreparedResultsPresentationSnapshot['kind'] | null;
  executionBatch: ResultsPresentationExecutionBatchRef | null;
  executionStage: ResultsPresentationExecutionStage;
  startToken: number | null;
  coverState: ResultsPresentationCoverState;
};

export const IDLE_RESULTS_PRESENTATION_READ_MODEL: ResultsPresentationReadModel = {
  surfaceMode: 'none',
  contentVisibility: 'hidden',
  isAwaitingEnterMount: false,
  isEntering: false,
  isClosing: false,
  isPending: false,
  isSettled: true,
};

export const IDLE_RESULTS_PRESENTATION_TRANSPORT_STATE: ResultsPresentationTransportState = {
  transactionId: null,
  snapshotKind: null,
  executionBatch: null,
  executionStage: 'idle',
  startToken: null,
  coverState: 'hidden',
};

export const isResultsPresentationExecutionStageSettled = (
  executionStage: ResultsPresentationTransportState['executionStage']
): boolean => executionStage === 'idle' || executionStage === 'settled';

export const areResultsPresentationReadModelsEqual = (
  left: ResultsPresentationReadModel,
  right: ResultsPresentationReadModel
): boolean =>
  left.surfaceMode === right.surfaceMode &&
  left.contentVisibility === right.contentVisibility &&
  left.isAwaitingEnterMount === right.isAwaitingEnterMount &&
  left.isEntering === right.isEntering &&
  left.isClosing === right.isClosing &&
  left.isPending === right.isPending &&
  left.isSettled === right.isSettled;
