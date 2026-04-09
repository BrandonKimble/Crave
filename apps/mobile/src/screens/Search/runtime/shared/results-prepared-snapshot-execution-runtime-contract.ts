import type {
  PreparedResultsEnterPresentationSnapshot,
  PreparedResultsExitPresentationSnapshot,
  PreparedResultsPresentationSnapshot,
} from './prepared-presentation-transaction';
import type { ResultsPreparedSnapshotExecutionBoundary } from './results-presentation-execution-intent-runtime-contract';

export type UseResultsPreparedSnapshotExecutionRuntimeArgs =
  ResultsPreparedSnapshotExecutionBoundary;

export type UseResultsPreparedSnapshotShellApplicationRuntimeArgs = Pick<
  UseResultsPreparedSnapshotExecutionRuntimeArgs,
  'cancelSearchSheetCloseTransition' | 'setBackdropTarget' | 'setInputMode'
>;

export type UseResultsPreparedEnterSnapshotExecutionRuntimeArgs = Pick<
  UseResultsPreparedSnapshotExecutionRuntimeArgs,
  | 'resultsRuntimeOwner'
  | 'animateSheetTo'
  | 'prepareShortcutSheetTransition'
  | 'setDisplayQueryOverride'
>;

export type UseResultsPreparedExitSnapshotExecutionRuntimeArgs = Pick<
  UseResultsPreparedSnapshotExecutionRuntimeArgs,
  'resultsRuntimeOwner' | 'animateSheetTo' | 'setDisplayQueryOverride' | 'beginCloseTransition'
>;

export type ResultsPreparedSnapshotShellApplier = (
  snapshot: PreparedResultsPresentationSnapshot
) => void;

export type ResultsPreparedEnterSnapshotExecutor = (args: {
  snapshot: PreparedResultsEnterPresentationSnapshot;
  displayQueryOverride?: string;
  preserveSheetState?: boolean;
  shouldPrepareShortcutSheetTransition?: boolean;
}) => string;

export type ResultsPreparedExitSnapshotExecutor = (
  snapshot: PreparedResultsExitPresentationSnapshot
) => string;
