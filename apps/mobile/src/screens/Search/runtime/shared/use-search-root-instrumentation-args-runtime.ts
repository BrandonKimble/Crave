import type {
  SearchRootInstrumentationArgsRuntime,
  UseSearchRootScaffoldLaneRuntimeArgs,
} from './use-search-root-scaffold-lane-runtime-contract';

const roundPerfValue = (value: number): number => Math.round(value * 10) / 10;
const SHORTCUT_HARNESS_RUN_TIMEOUT_MS = 45000;
const SHORTCUT_HARNESS_SETTLE_QUIET_PERIOD_MS = 320;

type UseSearchRootInstrumentationArgsRuntimeArgs = Pick<
  UseSearchRootScaffoldLaneRuntimeArgs,
  'isAutocompleteSuppressed' | 'rootSessionRuntime'
>;

export const useSearchRootInstrumentationArgsRuntime = ({
  isAutocompleteSuppressed,
  rootSessionRuntime,
}: UseSearchRootInstrumentationArgsRuntimeArgs): SearchRootInstrumentationArgsRuntime => {
  const {
    runtimeOwner: {
      mapQueryBudget,
      searchSessionController,
      searchRuntimeBus,
      runtimeWorkSchedulerRef,
      runOneHandoffCoordinatorRef,
    },
    resultsArrivalState: { isLoadingMore, resultsRequestKey, resultsPage },
    runtimeFlags: { searchMode, isSearchSessionActive, isSearchLoading, isSearchRequestLoadingRef },
    primitives: {
      searchInteractionRef,
      runOneCommitSpanPressureByOperationRef,
      getPerfNow,
      readRuntimeMemoryDiagnostics,
    },
    freezeGate: { isRun1HandoffActive: isRunOneHandoffActive },
    mapBootstrapRuntime: { isInitialCameraReady },
    filterStateRuntime: { scoreMode, setPreferredScoreMode },
  } = rootSessionRuntime;

  return {
    getPerfNow,
    roundPerfValue,
    searchSessionController,
    scoreMode,
    setPreferredScoreMode,
    mapQueryBudget,
    searchMode,
    isSearchLoading,
    isLoadingMore,
    isRunOneHandoffActive,
    resultsRequestKey,
    searchInteractionRef,
    isInitialCameraReady,
    runTimeoutMs: SHORTCUT_HARNESS_RUN_TIMEOUT_MS,
    settleQuietPeriodMs: SHORTCUT_HARNESS_SETTLE_QUIET_PERIOD_MS,
    searchRuntimeBus,
    runtimeWorkSchedulerRef,
    runOneHandoffCoordinatorRef,
    runOneCommitSpanPressureByOperationRef,
    isSearchRequestLoadingRef,
    readRuntimeMemoryDiagnostics,
    isSearchSessionActive,
    isAutocompleteSuppressed,
    resultsPage,
  };
};
