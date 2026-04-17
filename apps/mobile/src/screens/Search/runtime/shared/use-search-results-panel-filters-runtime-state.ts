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
      votesFilterActive: state.votesFilterActive,
      isPriceSelectorVisible: state.isPriceSelectorVisible,
    }),
    (left, right) =>
      left.priceButtonLabelText === right.priceButtonLabelText &&
      left.priceButtonIsActive === right.priceButtonIsActive &&
      left.openNow === right.openNow &&
      left.votesFilterActive === right.votesFilterActive &&
      left.isPriceSelectorVisible === right.isPriceSelectorVisible,
    [
      'priceButtonLabelText',
      'priceButtonIsActive',
      'openNow',
      'votesFilterActive',
      'isPriceSelectorVisible',
    ] as const
  );
};
