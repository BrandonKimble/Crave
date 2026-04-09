import React from 'react';

import type { SearchForegroundChromeFiltersWarmupInputs } from './search-foreground-chrome-contract';

type UseSearchForegroundFiltersWarmupInputsArgs = SearchForegroundChromeFiltersWarmupInputs;

export const useSearchForegroundFiltersWarmupInputs = ({
  isSearchFiltersLayoutWarm,
  activeTab,
  rankButtonLabelText,
  rankButtonIsActive,
  openNow,
  votesFilterActive,
  priceButtonLabelText,
  priceButtonIsActive,
  searchFiltersLayoutCacheRef,
  handleSearchFiltersLayoutCache,
}: UseSearchForegroundFiltersWarmupInputsArgs): SearchForegroundChromeFiltersWarmupInputs =>
  React.useMemo(
    () => ({
      isSearchFiltersLayoutWarm,
      activeTab,
      rankButtonLabelText,
      rankButtonIsActive,
      openNow,
      votesFilterActive,
      priceButtonLabelText,
      priceButtonIsActive,
      searchFiltersLayoutCacheRef,
      handleSearchFiltersLayoutCache,
    }),
    [
      activeTab,
      handleSearchFiltersLayoutCache,
      isSearchFiltersLayoutWarm,
      openNow,
      priceButtonIsActive,
      priceButtonLabelText,
      rankButtonIsActive,
      rankButtonLabelText,
      searchFiltersLayoutCacheRef,
      votesFilterActive,
    ]
  );
