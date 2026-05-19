import type React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type SearchOverlayHeaderChrome from '../../components/SearchOverlayHeaderChrome';
import type SearchSuggestionSurface from '../../components/SearchSuggestionSurface';
import type SearchFilters from '../../components/SearchFilters';

type SuggestionSurfaceProps = React.ComponentProps<typeof SearchSuggestionSurface>;
type HeaderChromeProps = React.ComponentProps<typeof SearchOverlayHeaderChrome>;
type HiddenSearchFiltersWarmupProps = React.ComponentProps<typeof SearchFilters>;
type SearchForegroundChromeSuggestionSurfaceProps = Omit<
  SuggestionSurfaceProps,
  'pointerEvents' | 'shouldHideBottomNav'
>;
type SearchForegroundChromeHeaderSurfaceProps = Omit<HeaderChromeProps, 'headerVisualModel'>;

export type SearchOverlayChromeSuggestionSurfaceProps = SuggestionSurfaceProps;
export type SearchOverlayChromeHeaderProps = HeaderChromeProps;
export type SearchOverlayChromeHiddenSearchFiltersWarmupProps = HiddenSearchFiltersWarmupProps;
export type SearchOverlayChromeFrameSnapshot = {
  isFocused: boolean;
  shouldRenderSearchOverlay: boolean;
  shouldFreezeSuggestionSurfaceForRunOne: boolean;
  shouldFreezeOverlayHeaderChromeForRunOne: boolean;
  onProfilerRender: React.ProfilerOnRenderCallback | null;
  hiddenSearchFiltersWarmupProps: SearchOverlayChromeHiddenSearchFiltersWarmupProps | null;
};

export type SearchOverlayChromeContainerSnapshot = {
  overlayContainerStyle: StyleProp<ViewStyle>;
  isSuggestionOverlayVisible: boolean;
  shouldHideBottomNavForRender: boolean;
};

export type SearchOverlayChromeHostSnapshot = {
  frameSnapshot: SearchOverlayChromeFrameSnapshot;
  containerSnapshot: SearchOverlayChromeContainerSnapshot;
  headerProps: SearchOverlayChromeHeaderProps;
  suggestionSurfaceProps: SearchOverlayChromeSuggestionSurfaceProps;
};

export type SearchForegroundSuggestionLayoutInputs = Pick<
  SearchForegroundChromeSuggestionSurfaceProps,
  | 'shouldDisableSearchBlur'
  | 'shouldShowSuggestionSurface'
  | 'resolvedSuggestionHeaderHoles'
  | 'shouldDriveSuggestionLayout'
  | 'shouldShowSuggestionBackground'
  | 'suggestionTopFillHeight'
  | 'suggestionScrollMaxHeightTarget'
  | 'searchLayoutTop'
  | 'searchLayoutHeight'
  | 'navBarHeight'
  | 'bottomInset'
>;

export type SearchForegroundSuggestionMotionInputs = Pick<
  SearchForegroundChromeSuggestionSurfaceProps,
  | 'searchSurfaceAnimatedStyle'
  | 'suggestionHeaderHeightAnimatedStyle'
  | 'suggestionPanelAnimatedStyle'
  | 'suggestionScrollTopAnimatedStyle'
  | 'suggestionScrollMaxHeightAnimatedStyle'
  | 'suggestionHeaderDividerAnimatedStyle'
>;

export type SearchForegroundSuggestionPanelInputs = Pick<
  SearchForegroundChromeSuggestionSurfaceProps,
  | 'isSuggestionScreenActive'
  | 'shouldRenderSuggestionPanel'
  | 'shouldRenderAutocompleteSection'
  | 'shouldRenderRecentSection'
>;

export type SearchForegroundSuggestionDataInputs = Pick<
  SearchForegroundChromeSuggestionSurfaceProps,
  | 'suggestionDisplaySuggestions'
  | 'recentSearchesDisplay'
  | 'recentlyViewedRestaurantsDisplay'
  | 'recentlyViewedFoodsDisplay'
>;

export type SearchForegroundSuggestionScrollInputs = Pick<
  SearchForegroundChromeSuggestionSurfaceProps,
  | 'onSuggestionScroll'
  | 'onSuggestionTouchStart'
  | 'onSuggestionContentSizeChange'
  | 'onSuggestionInteractionStart'
  | 'onSuggestionInteractionEnd'
>;

export type SearchForegroundSuggestionSelectionInputs = Pick<
  SearchForegroundChromeSuggestionSurfaceProps,
  | 'onSuggestionPress'
  | 'onRecentSearchPress'
  | 'onRecentlyViewedRestaurantPress'
  | 'onRecentlyViewedFoodPress'
  | 'onRecentViewMorePress'
  | 'onRecentlyViewedMorePress'
>;

export type SearchForegroundChromeSuggestionInputs = {
  layoutInputs: SearchForegroundSuggestionLayoutInputs;
  motionInputs: SearchForegroundSuggestionMotionInputs;
  panelInputs: SearchForegroundSuggestionPanelInputs;
  dataInputs: SearchForegroundSuggestionDataInputs;
  scrollInputs: SearchForegroundSuggestionScrollInputs;
  selectionInputs: SearchForegroundSuggestionSelectionInputs;
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
  | 'handleSearchBack'
  | 'handleSearchHeaderLayout'
  | 'inputRef'
  | 'searchBarInputAnimatedStyle'
  | 'searchBarContainerAnimatedStyle'
  | 'isSuggestionScrollDismissing'
  | 'searchHeaderFocusProgress'
>;

export type SearchForegroundHeaderSearchBarLayoutInputs = Pick<
  SearchForegroundHeaderSearchBarInputs,
  'handleSearchContainerLayout' | 'handleSearchHeaderLayout'
>;

export type SearchForegroundHeaderSearchBarVisualInputs = Pick<
  SearchForegroundHeaderSearchBarInputs,
  | 'shouldShowAutocompleteSpinnerInBar'
  | 'searchBarInputAnimatedStyle'
  | 'searchBarContainerAnimatedStyle'
  | 'isSuggestionScrollDismissing'
  | 'searchHeaderFocusProgress'
> &
  Pick<SearchOverlayChromeHeaderProps, 'headerVisualModel'>;

export type SearchForegroundHeaderSearchBarInteractionInputs = Pick<
  SearchForegroundHeaderSearchBarInputs,
  | 'handleQueryChange'
  | 'handleSubmit'
  | 'handleSearchFocus'
  | 'handleSearchBlur'
  | 'handleClear'
  | 'focusSearchInput'
  | 'handleSearchBack'
  | 'inputRef'
>;

export type SearchForegroundHeaderShortcutsInputs = Pick<
  SearchForegroundChromeHeaderSurfaceProps,
  | 'searchShortcutsAnimatedStyle'
  | 'searchShortcutChipAnimatedStyle'
  | 'searchShortcutContentAnimatedStyle'
  | 'handleBestRestaurantsHere'
  | 'handleBestDishesHere'
  | 'handleSearchShortcutsRowLayout'
  | 'handleRestaurantsShortcutLayout'
  | 'handleDishesShortcutLayout'
> & {
  shouldMountSearchShortcuts: boolean;
  shouldEnableSearchShortcutsInteraction: boolean;
};

export type SearchForegroundHeaderShortcutsVisualInputs = Pick<
  SearchForegroundHeaderShortcutsInputs,
  | 'shouldMountSearchShortcuts'
  | 'shouldEnableSearchShortcutsInteraction'
  | 'searchShortcutsAnimatedStyle'
  | 'searchShortcutChipAnimatedStyle'
  | 'searchShortcutContentAnimatedStyle'
>;

export type SearchForegroundHeaderShortcutsInteractionInputs = Pick<
  SearchForegroundHeaderShortcutsInputs,
  'handleBestRestaurantsHere' | 'handleBestDishesHere'
>;

export type SearchForegroundHeaderShortcutsLayoutInputs = Pick<
  SearchForegroundHeaderShortcutsInputs,
  | 'handleSearchShortcutsRowLayout'
  | 'handleRestaurantsShortcutLayout'
  | 'handleDishesShortcutLayout'
>;

export type SearchForegroundHeaderSearchThisAreaInputs = Pick<
  SearchForegroundChromeHeaderSurfaceProps,
  | 'shouldShowSearchThisArea'
  | 'searchThisAreaTop'
  | 'searchThisAreaAnimatedStyle'
  | 'handleSearchThisAreaButtonLayout'
  | 'handleSearchThisArea'
>;

export type SearchForegroundHeaderSearchThisAreaVisualInputs = Pick<
  SearchForegroundHeaderSearchThisAreaInputs,
  'shouldShowSearchThisArea' | 'searchThisAreaTop' | 'searchThisAreaAnimatedStyle'
>;

export type SearchForegroundHeaderSearchThisAreaInteractionInputs = Pick<
  SearchForegroundHeaderSearchThisAreaInputs,
  'handleSearchThisArea'
>;

export type SearchForegroundChromeHeaderInputs = {
  searchBarInputs: SearchForegroundHeaderSearchBarInputs;
  shortcutsInputs: SearchForegroundHeaderShortcutsInputs;
  searchThisAreaInputs: SearchForegroundHeaderSearchThisAreaInputs;
};
