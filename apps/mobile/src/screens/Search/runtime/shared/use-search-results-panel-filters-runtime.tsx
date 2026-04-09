import React from 'react';

import SearchFilters, { cloneSearchFiltersLayoutCache } from '../../components/SearchFilters';
import { ACTIVE_TAB_COLOR, CONTENT_HORIZONTAL_PADDING } from '../../constants/search';
import { useSearchFilterChipReadModel } from '../read-models/chip-read-model-builder';
import type { ResultsInteractionModel } from './results-presentation-owner-contract';
import type { UseSearchResultsRoutePublicationArgs } from './search-results-panel-runtime-contract';

type UseSearchResultsPanelFiltersRuntimeArgs = Pick<
  UseSearchResultsRoutePublicationArgs,
  | 'searchFiltersLayoutCacheRef'
  | 'handleSearchFiltersLayoutCache'
  | 'toggleRankSelector'
  | 'toggleOpenNow'
  | 'toggleVotesFilter'
  | 'togglePriceSelector'
> & {
  activeTab: 'dishes' | 'restaurants';
  pendingTabSwitchTab: 'dishes' | 'restaurants' | null;
  scheduleTabToggleCommit: ResultsInteractionModel['scheduleTabToggleCommit'];
  requestVersionKey: string;
  rankButtonLabelText: string;
  rankButtonIsActive: boolean;
  priceButtonLabelText: string;
  priceButtonIsActive: boolean;
  openNow: boolean;
  votesFilterActive: boolean;
  isRankSelectorVisible: boolean;
  isPriceSelectorVisible: boolean;
};

export type SearchResultsPanelFiltersRuntime = {
  filtersHeader: React.ReactNode;
};

export const useSearchResultsPanelFiltersRuntime = ({
  searchFiltersLayoutCacheRef,
  handleSearchFiltersLayoutCache,
  toggleRankSelector,
  toggleOpenNow,
  toggleVotesFilter,
  togglePriceSelector,
  activeTab,
  pendingTabSwitchTab,
  scheduleTabToggleCommit,
  requestVersionKey,
  rankButtonLabelText,
  rankButtonIsActive,
  priceButtonLabelText,
  priceButtonIsActive,
  openNow,
  votesFilterActive,
  isRankSelectorVisible,
  isPriceSelectorVisible,
}: UseSearchResultsPanelFiltersRuntimeArgs): SearchResultsPanelFiltersRuntime => {
  const filtersActiveTab = pendingTabSwitchTab ?? activeTab;

  const handleInteractionTabChange = React.useCallback(
    (next: 'dishes' | 'restaurants') => {
      scheduleTabToggleCommit(next);
    },
    [scheduleTabToggleCommit]
  );

  const filterChipReadModel = useSearchFilterChipReadModel({
    requestVersionKey,
    activeTab,
    rankButtonLabel: rankButtonLabelText,
    rankButtonActive: rankButtonIsActive,
    priceButtonLabel: priceButtonLabelText,
    priceButtonActive: priceButtonIsActive,
    openNow,
    votesFilterActive,
    isRankSelectorVisible,
    isPriceSelectorVisible,
  });

  const filtersHeader = React.useMemo(
    () => (
      <SearchFilters
        activeTab={filtersActiveTab}
        onTabChange={handleInteractionTabChange}
        rankButtonLabel={filterChipReadModel.rankButtonLabel}
        rankButtonActive={filterChipReadModel.rankButtonActive}
        onToggleRankSelector={toggleRankSelector}
        isRankSelectorVisible={filterChipReadModel.isRankSelectorVisible}
        openNow={filterChipReadModel.openNow}
        onToggleOpenNow={toggleOpenNow}
        votesFilterActive={filterChipReadModel.votesFilterActive}
        onToggleVotesFilter={toggleVotesFilter}
        priceButtonLabel={filterChipReadModel.priceButtonLabel}
        priceButtonActive={filterChipReadModel.priceButtonActive}
        onTogglePriceSelector={togglePriceSelector}
        isPriceSelectorVisible={filterChipReadModel.isPriceSelectorVisible}
        contentHorizontalPadding={CONTENT_HORIZONTAL_PADDING}
        accentColor={ACTIVE_TAB_COLOR}
        initialLayoutCache={cloneSearchFiltersLayoutCache(searchFiltersLayoutCacheRef.current)}
        onLayoutCacheChange={handleSearchFiltersLayoutCache}
      />
    ),
    [
      filterChipReadModel.isPriceSelectorVisible,
      filterChipReadModel.isRankSelectorVisible,
      filterChipReadModel.openNow,
      filterChipReadModel.priceButtonActive,
      filterChipReadModel.priceButtonLabel,
      filterChipReadModel.rankButtonActive,
      filterChipReadModel.rankButtonLabel,
      filterChipReadModel.votesFilterActive,
      filtersActiveTab,
      handleInteractionTabChange,
      handleSearchFiltersLayoutCache,
      searchFiltersLayoutCacheRef,
      toggleOpenNow,
      togglePriceSelector,
      toggleRankSelector,
      toggleVotesFilter,
    ]
  );

  return React.useMemo(
    () => ({
      filtersHeader,
    }),
    [filtersHeader]
  );
};
