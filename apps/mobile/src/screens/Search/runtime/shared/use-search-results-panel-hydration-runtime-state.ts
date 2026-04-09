import { useSearchBus } from './search-runtime-bus';
import type { SearchResultsPanelHydrationRuntimeState } from './search-results-panel-runtime-state-contract';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';

export const useSearchResultsPanelHydrationRuntimeState =
  (): SearchResultsPanelHydrationRuntimeState => {
    const searchRuntimeBus = useSearchBus();

    return useSearchRuntimeBusSelector(
      searchRuntimeBus,
      (state) => ({
        runOneCommitSpanPressureActive: state.runOneCommitSpanPressureActive,
        hydrationOperationId: state.hydrationOperationId,
        allowHydrationFinalizeCommit: state.allowHydrationFinalizeCommit,
        runtimeHydratedResultsKey: state.hydratedResultsKey,
        isRunOneChromeDeferred:
          state.isRunOneChromeFreezeActive ||
          state.runOneCommitSpanPressureActive ||
          state.isChromeDeferred,
      }),
      (left, right) =>
        left.runOneCommitSpanPressureActive === right.runOneCommitSpanPressureActive &&
        left.hydrationOperationId === right.hydrationOperationId &&
        left.allowHydrationFinalizeCommit === right.allowHydrationFinalizeCommit &&
        left.runtimeHydratedResultsKey === right.runtimeHydratedResultsKey &&
        left.isRunOneChromeDeferred === right.isRunOneChromeDeferred,
      [
        'runOneCommitSpanPressureActive',
        'hydrationOperationId',
        'allowHydrationFinalizeCommit',
        'hydratedResultsKey',
        'isRunOneChromeFreezeActive',
        'isChromeDeferred',
      ] as const
    );
  };
