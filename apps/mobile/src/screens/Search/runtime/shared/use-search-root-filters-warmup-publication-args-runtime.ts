import type {
  SearchRootFiltersWarmupPublicationArgsRuntime,
  UseSearchRootChromeInputPublicationArgsRuntimeArgs,
} from './use-search-root-chrome-input-publication-args-runtime-contract';

export const useSearchRootFiltersWarmupPublicationArgsRuntime = ({
  rootPrimitivesRuntime,
  sessionActionRuntime,
}: UseSearchRootChromeInputPublicationArgsRuntimeArgs): SearchRootFiltersWarmupPublicationArgsRuntime => {
  const {
    mapState: { searchFiltersLayoutCacheRef },
    searchState: { activeTab, isSearchFiltersLayoutWarm, handleSearchFiltersLayoutCache },
  } = rootPrimitivesRuntime;
  const { filterModalRuntime } = sessionActionRuntime;

  return {
    filtersWarmupInputsArgs: {
      isSearchFiltersLayoutWarm,
      activeTab,
      searchFiltersLayoutCacheRef,
      handleSearchFiltersLayoutCache,
      rankButtonLabelText: filterModalRuntime.rankButtonLabelText,
      rankButtonIsActive: filterModalRuntime.rankButtonIsActive,
      openNow: filterModalRuntime.openNow,
      votesFilterActive: filterModalRuntime.votesFilterActive,
      priceButtonLabelText: filterModalRuntime.priceButtonLabelText,
      priceButtonIsActive: filterModalRuntime.priceButtonIsActive,
    },
  };
};
