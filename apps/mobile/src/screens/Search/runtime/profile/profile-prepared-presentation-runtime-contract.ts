import type { CameraSnapshot } from './profile-transition-state-contract';
import type { ProfileTransitionState } from './profile-transition-state-contract';
import type { PreparedProfileCommandExecutionRuntime } from './profile-prepared-presentation-command-executor';
import type { PreparedProfileStateExecutionRuntime } from './profile-prepared-presentation-state-executor';
import type {
  PreparedProfilePresentationCompletionEvent,
  PreparedProfilePresentationTransaction,
} from './profile-prepared-presentation-transaction-contract';

export type ExecutePreparedProfilePresentationTransaction = (
  transaction: PreparedProfilePresentationTransaction
) => void;

export type ProfilePreparedPresentationRuntime = {
  executePreparedProfileTransaction: (transaction: PreparedProfilePresentationTransaction) => void;
  handlePreparedProfileCompletionEvent: (event: PreparedProfilePresentationCompletionEvent) => void;
  openPreparedProfilePresentation: (
    restaurantId: string,
    targetCamera: CameraSnapshot | null | undefined,
    shouldForceSharedMiddleSnap: boolean,
    status: 'opening' | 'open'
  ) => void;
  closePreparedProfilePresentation: (restaurantId: string | null) => void;
  focusPreparedProfileCamera: (targetCamera: CameraSnapshot) => void;
};

export type CreateProfilePreparedPresentationRuntimeArgs = {
  runBatch: (fn: () => void) => void;
  commandExecutionRuntime: PreparedProfileCommandExecutionRuntime;
  stateExecutionRuntime: PreparedProfileStateExecutionRuntime;
  completionExecution: {
    getRequestSeq: () => number;
    setRequestSeq: (requestSeq: number) => void;
    cancelHydrationIntentOnOverlayDismiss: (nextRequestSeq: number) => void;
    getProfileTransitionState: () => ProfileTransitionState;
  };
  transactionExecution: {
    createTransactionId: () => string;
    getProfileTransitionState: CreateProfilePreparedPresentationRuntimeArgs['completionExecution']['getProfileTransitionState'];
    getProfileDismissBehavior: () => 'restore' | 'clear';
    getProfileShouldClearSearchOnDismiss: () => boolean;
    isSearchOverlay: boolean;
    getLastVisibleSheetSnap: () => 'expanded' | 'middle' | 'collapsed' | null;
  };
};
