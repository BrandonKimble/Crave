import type { SearchRuntimeBus } from './search-runtime-bus';
import type { SearchResultsPanelFiltersRuntimeState } from './search-results-panel-runtime-state-contract';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';

export const useSearchResultsPanelFiltersRuntimeState = (
  searchRuntimeBus: SearchRuntimeBus
): SearchResultsPanelFiltersRuntimeState => {
  return useSearchRuntimeBusSelector(
    searchRuntimeBus,
    (state) => ({
      priceButtonLabelText: state.priceButtonLabelText,
      priceButtonIsActive: state.priceButtonIsActive,
      openNow: state.openNow,
      includeSimilarActive: state.includeSimilarActive,
      similarAvailableCount: state.results?.metadata?.similarAvailable ?? 0,
      risingActive: state.risingActive,
      isPriceSelectorVisible: state.isPriceSelectorVisible,
    }),
    (left, right) =>
      left.priceButtonLabelText === right.priceButtonLabelText &&
      left.priceButtonIsActive === right.priceButtonIsActive &&
      left.openNow === right.openNow &&
      left.includeSimilarActive === right.includeSimilarActive &&
      left.similarAvailableCount === right.similarAvailableCount &&
      left.risingActive === right.risingActive &&
      left.isPriceSelectorVisible === right.isPriceSelectorVisible,
    [
      'priceButtonLabelText',
      'priceButtonIsActive',
      'openNow',
      'includeSimilarActive',
      'results',
      'risingActive',
      'isPriceSelectorVisible',
    ] as const
  );
};
