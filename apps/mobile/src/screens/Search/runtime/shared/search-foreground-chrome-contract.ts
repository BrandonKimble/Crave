import type React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type SearchOverlayHeaderChrome from '../../components/SearchOverlayHeaderChrome';
import type SearchSuggestionSurface from '../../components/SearchSuggestionSurface';
import type SearchFilters from '../../components/SearchFilters';
import type { SearchFiltersLayoutCache } from '../../components/SearchFilters';

type SuggestionSurfaceProps = React.ComponentProps<typeof SearchSuggestionSurface>;
type HeaderChromeProps = React.ComponentProps<typeof SearchOverlayHeaderChrome>;
type HiddenSearchFiltersWarmupProps = React.ComponentProps<typeof SearchFilters>;
type SearchForegroundChromeSuggestionSurfaceProps = Omit<
  SuggestionSurfaceProps,
  'pointerEvents' | 'shouldHideBottomNav'
>;
type SearchForegroundChromeHeaderSurfaceProps = Omit<HeaderChromeProps, 'headerVisualModel'>;

export type SearchOverlayChromeModel = {
  overlayContainerStyle: StyleProp<ViewStyle>;
  isSuggestionOverlayVisible: boolean;
  shouldHideBottomNavForRender: boolean;
  suggestionSurfaceProps: SuggestionSurfaceProps;
  headerChromeProps: HeaderChromeProps;
  hiddenSearchFiltersWarmupProps: HiddenSearchFiltersWarmupProps | null;
};

export type SearchForegroundSuggestionVisualInputs = Pick<
  SearchForegroundChromeSuggestionSurfaceProps,
  | 'searchSurfaceAnimatedStyle'
  | 'shouldDisableSearchBlur'
  | 'shouldShowSuggestionSurface'
  | 'resolvedSuggestionHeaderHoles'
  | 'suggestionHeaderHeightAnimatedStyle'
  | 'suggestionPanelAnimatedStyle'
  | 'shouldDriveSuggestionLayout'
  | 'shouldShowSuggestionBackground'
  | 'suggestionTopFillHeight'
  | 'suggestionScrollTopAnimatedStyle'
  | 'suggestionScrollMaxHeightTarget'
  | 'suggestionScrollMaxHeightAnimatedStyle'
  | 'searchLayoutTop'
  | 'searchLayoutHeight'
  | 'navBarHeight'
  | 'bottomInset'
  | 'suggestionHeaderDividerAnimatedStyle'
>;

export type SearchForegroundSuggestionContentInputs = Pick<
  SearchForegroundChromeSuggestionSurfaceProps,
  | 'isSuggestionScreenActive'
  | 'shouldRenderSuggestionPanel'
  | 'shouldRenderAutocompleteSection'
  | 'shouldRenderRecentSection'
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

export type SearchForegroundSuggestionInteractionInputs = Pick<
  SearchForegroundChromeSuggestionSurfaceProps,
  | 'onSuggestionScroll'
  | 'onSuggestionTouchStart'
  | 'onSuggestionContentSizeChange'
  | 'onSuggestionInteractionStart'
  | 'onSuggestionInteractionEnd'
  | 'onSuggestionPress'
  | 'onRecentSearchPress'
  | 'onRecentlyViewedRestaurantPress'
  | 'onRecentlyViewedFoodPress'
  | 'onRecentViewMorePress'
  | 'onRecentlyViewedMorePress'
>;

export type SearchForegroundChromeSuggestionInputs = {
  visualInputs: SearchForegroundSuggestionVisualInputs;
  contentInputs: SearchForegroundSuggestionContentInputs;
  interactionInputs: SearchForegroundSuggestionInteractionInputs;
};

export type SearchForegroundHeaderSearchBarInputs = Pick<
  SearchForegroundChromeHeaderSurfaceProps,
  | 'handleSearchContainerLayout'
  | 'shouldShowAutocompleteSpinnerInBar'
  | 'handleQueryChange'
  | 'handleSubmit'
  | 'handleSearchFocus'
  | 'handleSearchBlur'
  | 'handleClear'
  | 'focusSearchInput'
  | 'handleSearchPressIn'
  | 'handleSearchBack'
  | 'handleSearchHeaderLayout'
  | 'inputRef'
  | 'searchBarInputAnimatedStyle'
  | 'searchBarContainerAnimatedStyle'
  | 'isSuggestionScrollDismissing'
  | 'searchHeaderFocusProgress'
>;

export type SearchForegroundHeaderShortcutsInputs = Pick<
  SearchForegroundChromeHeaderSurfaceProps,
  | 'shouldMountSearchShortcuts'
  | 'shouldEnableSearchShortcutsInteraction'
  | 'searchShortcutsAnimatedStyle'
  | 'searchShortcutChipAnimatedStyle'
  | 'handleBestRestaurantsHere'
  | 'handleBestDishesHere'
  | 'handleSearchShortcutsRowLayout'
  | 'handleRestaurantsShortcutLayout'
  | 'handleDishesShortcutLayout'
>;

export type SearchForegroundHeaderSearchThisAreaInputs = Pick<
  SearchForegroundChromeHeaderSurfaceProps,
  | 'shouldShowSearchThisArea'
  | 'searchThisAreaTop'
  | 'searchThisAreaAnimatedStyle'
  | 'handleSearchThisArea'
>;

export type SearchForegroundChromeHeaderInputs = {
  searchBarInputs: SearchForegroundHeaderSearchBarInputs;
  shortcutsInputs: SearchForegroundHeaderShortcutsInputs;
  searchThisAreaInputs: SearchForegroundHeaderSearchThisAreaInputs;
};

export type SearchForegroundChromeFiltersWarmupInputs = {
  isSearchFiltersLayoutWarm: boolean;
  activeTab: 'restaurants' | 'dishes';
  openNow: boolean;
  votesFilterActive: boolean;
  priceButtonLabelText: string;
  priceButtonIsActive: boolean;
  searchFiltersLayoutCacheRef: React.MutableRefObject<SearchFiltersLayoutCache | null>;
  handleSearchFiltersLayoutCache: (next: SearchFiltersLayoutCache) => void;
};
