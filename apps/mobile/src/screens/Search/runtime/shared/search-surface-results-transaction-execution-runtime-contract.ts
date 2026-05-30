import type {
  SearchSurfaceResultsEnterTransaction,
  SearchSurfaceResultsExitTransaction,
  SearchSurfaceResultsTransaction,
} from './search-surface-results-transaction';
import type { SearchSubmitEntrySurface } from './search-submit-entry-surface-contract';
import type { ResultsSurfaceTransactionExecutionBoundary } from './results-presentation-execution-intent-runtime-contract';
import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';

export type UseResultsSurfaceTransactionExecutionRuntimeArgs =
  ResultsSurfaceTransactionExecutionBoundary;

export type UseResultsSurfaceTransactionShellApplicationRuntimeArgs = Pick<
  UseResultsSurfaceTransactionExecutionRuntimeArgs,
  'cancelSearchSheetCloseTransition' | 'setBackdropTarget' | 'setInputMode'
> & {
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
};

export type UseResultsSurfaceEnterTransactionExecutionRuntimeArgs = Pick<
  UseResultsSurfaceTransactionExecutionRuntimeArgs,
  'resultsRuntimeOwner' | 'prepareSharedSheetForSearchPresentation' | 'setDisplayQueryOverride'
>;

export type UseResultsSurfaceExitTransactionExecutionRuntimeArgs = Pick<
  UseResultsSurfaceTransactionExecutionRuntimeArgs,
  'resultsRuntimeOwner' | 'getCurrentSheetSnap' | 'beginCloseTransition'
>;

export type ResultsSurfaceTransactionShellApplier = (
  snapshot: SearchSurfaceResultsTransaction
) => void;

export type ResultsSurfaceEnterTransactionExecutor = (args: {
  snapshot: SearchSurfaceResultsEnterTransaction;
  displayQueryOverride?: string;
  preserveSheetState?: boolean;
  shouldPrepareShortcutSheetTransition?: boolean;
  entrySurface: SearchSubmitEntrySurface;
}) => string;

export type ResultsSurfaceExitTransactionExecutor = (
  snapshot: SearchSurfaceResultsExitTransaction
) => string;
