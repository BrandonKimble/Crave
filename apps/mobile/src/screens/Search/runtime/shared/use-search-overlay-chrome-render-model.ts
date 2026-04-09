import React from 'react';

import { cloneSearchFiltersLayoutCache } from '../../components/SearchFilters';
import { ACTIVE_TAB_COLOR, CONTENT_HORIZONTAL_PADDING } from '../../constants/search';
import type {
  SearchOverlayChromeModel,
  SearchForegroundChromeFiltersWarmupInputs,
  SearchForegroundChromeHeaderInputs,
  SearchForegroundChromeSuggestionInputs,
} from './search-foreground-chrome-contract';
import type { SearchHeaderVisualModel } from './results-presentation-shell-contract';

type UseSearchOverlayChromeRenderModelArgs = {
  insetsTop: number;
  insetsLeft: number;
  insetsRight: number;
  isSuggestionOverlayVisible: boolean;
  shouldHideBottomNavForRender: boolean;
  headerVisualModel: SearchHeaderVisualModel;
  shouldFreezeSuggestionSurfaceForRunOne: boolean;
  shouldFreezeOverlayHeaderChromeForRunOne: boolean;
  suggestionInputs: SearchForegroundChromeSuggestionInputs;
  headerInputs: SearchForegroundChromeHeaderInputs;
  filtersWarmupInputs: SearchForegroundChromeFiltersWarmupInputs;
};

type SuggestionSurfaceFrozenProps = Pick<
  SearchOverlayChromeModel['suggestionSurfaceProps'],
  | 'suggestionDisplaySuggestions'
  | 'recentSearchesDisplay'
  | 'recentlyViewedRestaurantsDisplay'
  | 'recentlyViewedFoodsDisplay'
  | 'hasRecentSearchesDisplay'
  | 'hasRecentlyViewedRestaurantsDisplay'
  | 'hasRecentlyViewedFoodsDisplay'
  | 'isRecentLoadingDisplay'
  | 'isRecentlyViewedLoadingDisplay'
  | 'isRecentlyViewedFoodsLoadingDisplay'
>;

type HeaderChromeFrozenProps = Pick<
  SearchOverlayChromeModel['headerChromeProps'],
  | 'shouldMountSearchShortcuts'
  | 'shouldEnableSearchShortcutsInteraction'
  | 'shouldShowSearchThisArea'
  | 'searchThisAreaTop'
>;

export const useSearchOverlayChromeRenderModel = ({
  insetsTop,
  insetsLeft,
  insetsRight,
  isSuggestionOverlayVisible,
  shouldHideBottomNavForRender,
  headerVisualModel,
  shouldFreezeSuggestionSurfaceForRunOne,
  shouldFreezeOverlayHeaderChromeForRunOne,
  suggestionInputs,
  headerInputs,
  filtersWarmupInputs,
}: UseSearchOverlayChromeRenderModelArgs): SearchOverlayChromeModel => {
  const suggestionSurfaceProps: SearchOverlayChromeModel['suggestionSurfaceProps'] = {
    ...suggestionInputs,
    pointerEvents: isSuggestionOverlayVisible ? 'auto' : 'none',
    shouldHideBottomNav: shouldHideBottomNavForRender,
  };
  const headerChromeProps: SearchOverlayChromeModel['headerChromeProps'] = {
    ...headerInputs,
    headerVisualModel,
  };
  const hiddenSearchFiltersWarmupProps: SearchOverlayChromeModel['hiddenSearchFiltersWarmupProps'] =
    filtersWarmupInputs.isSearchFiltersLayoutWarm
      ? null
      : {
          activeTab: filtersWarmupInputs.activeTab,
          onTabChange: () => undefined,
          rankButtonLabel: filtersWarmupInputs.rankButtonLabelText,
          rankButtonActive: filtersWarmupInputs.rankButtonIsActive,
          onToggleRankSelector: () => undefined,
          isRankSelectorVisible: false,
          openNow: filtersWarmupInputs.openNow,
          onToggleOpenNow: () => undefined,
          votesFilterActive: filtersWarmupInputs.votesFilterActive,
          onToggleVotesFilter: () => undefined,
          priceButtonLabel: filtersWarmupInputs.priceButtonLabelText,
          priceButtonActive: filtersWarmupInputs.priceButtonIsActive,
          onTogglePriceSelector: () => undefined,
          isPriceSelectorVisible: false,
          contentHorizontalPadding: CONTENT_HORIZONTAL_PADDING,
          accentColor: ACTIVE_TAB_COLOR,
          initialLayoutCache: cloneSearchFiltersLayoutCache(
            filtersWarmupInputs.searchFiltersLayoutCacheRef.current
          ),
          onLayoutCacheChange: filtersWarmupInputs.handleSearchFiltersLayoutCache,
        };

  const frozenSuggestionSurfacePropsRef = React.useRef<SuggestionSurfaceFrozenProps | null>(null);
  const nextSuggestionSurfaceFrozenProps = {
    suggestionDisplaySuggestions: suggestionSurfaceProps.suggestionDisplaySuggestions,
    recentSearchesDisplay: suggestionSurfaceProps.recentSearchesDisplay,
    recentlyViewedRestaurantsDisplay: suggestionSurfaceProps.recentlyViewedRestaurantsDisplay,
    recentlyViewedFoodsDisplay: suggestionSurfaceProps.recentlyViewedFoodsDisplay,
    hasRecentSearchesDisplay: suggestionSurfaceProps.hasRecentSearchesDisplay,
    hasRecentlyViewedRestaurantsDisplay: suggestionSurfaceProps.hasRecentlyViewedRestaurantsDisplay,
    hasRecentlyViewedFoodsDisplay: suggestionSurfaceProps.hasRecentlyViewedFoodsDisplay,
    isRecentLoadingDisplay: suggestionSurfaceProps.isRecentLoadingDisplay,
    isRecentlyViewedLoadingDisplay: suggestionSurfaceProps.isRecentlyViewedLoadingDisplay,
    isRecentlyViewedFoodsLoadingDisplay: suggestionSurfaceProps.isRecentlyViewedFoodsLoadingDisplay,
  };
  if (!shouldFreezeSuggestionSurfaceForRunOne) {
    frozenSuggestionSurfacePropsRef.current = nextSuggestionSurfaceFrozenProps;
  }
  const suggestionSurfacePropsForRender = shouldFreezeSuggestionSurfaceForRunOne
    ? frozenSuggestionSurfacePropsRef.current ?? nextSuggestionSurfaceFrozenProps
    : nextSuggestionSurfaceFrozenProps;

  const frozenHeaderChromePropsRef = React.useRef<HeaderChromeFrozenProps | null>(null);
  const nextHeaderChromeFrozenProps = {
    shouldMountSearchShortcuts: headerChromeProps.shouldMountSearchShortcuts,
    shouldEnableSearchShortcutsInteraction:
      headerChromeProps.shouldEnableSearchShortcutsInteraction,
    shouldShowSearchThisArea: headerChromeProps.shouldShowSearchThisArea,
    searchThisAreaTop: headerChromeProps.searchThisAreaTop,
  };
  if (!shouldFreezeOverlayHeaderChromeForRunOne) {
    frozenHeaderChromePropsRef.current = nextHeaderChromeFrozenProps;
  }
  const headerChromePropsForRender = shouldFreezeOverlayHeaderChromeForRunOne
    ? frozenHeaderChromePropsRef.current ?? nextHeaderChromeFrozenProps
    : nextHeaderChromeFrozenProps;

  return {
    overlayContainerStyle: {
      paddingTop: insetsTop,
      paddingLeft: insetsLeft,
      paddingRight: insetsRight,
    },
    isSuggestionOverlayVisible,
    shouldHideBottomNavForRender,
    suggestionSurfaceProps: {
      ...suggestionSurfaceProps,
      suggestionDisplaySuggestions: suggestionSurfacePropsForRender.suggestionDisplaySuggestions,
      recentSearchesDisplay: suggestionSurfacePropsForRender.recentSearchesDisplay,
      recentlyViewedRestaurantsDisplay:
        suggestionSurfacePropsForRender.recentlyViewedRestaurantsDisplay,
      recentlyViewedFoodsDisplay: suggestionSurfacePropsForRender.recentlyViewedFoodsDisplay,
      hasRecentSearchesDisplay: suggestionSurfacePropsForRender.hasRecentSearchesDisplay,
      hasRecentlyViewedRestaurantsDisplay:
        suggestionSurfacePropsForRender.hasRecentlyViewedRestaurantsDisplay,
      hasRecentlyViewedFoodsDisplay: suggestionSurfacePropsForRender.hasRecentlyViewedFoodsDisplay,
      isRecentLoadingDisplay: suggestionSurfacePropsForRender.isRecentLoadingDisplay,
      isRecentlyViewedLoadingDisplay:
        suggestionSurfacePropsForRender.isRecentlyViewedLoadingDisplay,
      isRecentlyViewedFoodsLoadingDisplay:
        suggestionSurfacePropsForRender.isRecentlyViewedFoodsLoadingDisplay,
    },
    headerChromeProps: {
      ...headerChromeProps,
      shouldMountSearchShortcuts: headerChromePropsForRender.shouldMountSearchShortcuts,
      shouldEnableSearchShortcutsInteraction:
        headerChromePropsForRender.shouldEnableSearchShortcutsInteraction,
      shouldShowSearchThisArea: headerChromePropsForRender.shouldShowSearchThisArea,
      searchThisAreaTop: headerChromePropsForRender.searchThisAreaTop,
    },
    hiddenSearchFiltersWarmupProps,
  };
};
