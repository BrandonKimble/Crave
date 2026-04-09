import { useSearchBus } from './search-runtime-bus';
import type { SearchResultsPanelFiltersRuntimeState } from './search-results-panel-runtime-state-contract';
import { useSearchRuntimeBusSelector } from './use-search-runtime-bus-selector';

export const useSearchResultsPanelFiltersRuntimeState =
  (): SearchResultsPanelFiltersRuntimeState => {
    const searchRuntimeBus = useSearchBus();

    return useSearchRuntimeBusSelector(
      searchRuntimeBus,
      (state) => ({
        rankButtonLabelText: state.rankButtonLabelText,
        rankButtonIsActive: state.rankButtonIsActive,
        priceButtonLabelText: state.priceButtonLabelText,
        priceButtonIsActive: state.priceButtonIsActive,
        openNow: state.openNow,
        votesFilterActive: state.votesFilterActive,
        isRankSelectorVisible: state.isRankSelectorVisible,
        isPriceSelectorVisible: state.isPriceSelectorVisible,
      }),
      (left, right) =>
        left.rankButtonLabelText === right.rankButtonLabelText &&
        left.rankButtonIsActive === right.rankButtonIsActive &&
        left.priceButtonLabelText === right.priceButtonLabelText &&
        left.priceButtonIsActive === right.priceButtonIsActive &&
        left.openNow === right.openNow &&
        left.votesFilterActive === right.votesFilterActive &&
        left.isRankSelectorVisible === right.isRankSelectorVisible &&
        left.isPriceSelectorVisible === right.isPriceSelectorVisible,
      [
        'rankButtonLabelText',
        'rankButtonIsActive',
        'priceButtonLabelText',
        'priceButtonIsActive',
        'openNow',
        'votesFilterActive',
        'isRankSelectorVisible',
        'isPriceSelectorVisible',
      ] as const
    );
  };
