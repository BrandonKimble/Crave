import React from 'react';

import {
  cloneSearchFiltersLayoutCache,
  type SearchFiltersLayoutCache,
} from '../../components/SearchFilters';
import type { SearchBottomNavProps } from '../../components/SearchBottomNav';
import { SEARCH_BOTTOM_NAV_ICON_RENDERERS } from '../../components/search-bottom-nav-icons';
import { logger } from '../../../../utils';
import {
  ACTIVE_TAB_COLOR,
  ACTIVE_TAB_COLOR_DARK,
  CONTENT_HORIZONTAL_PADDING,
  SCORE_INFO_MAX_HEIGHT,
} from '../../constants/search';
import { formatCompactCount } from '../../utils/format';
import type { SearchRootScaffoldRuntime } from './search-root-scaffold-runtime-contract';
import type {
  SearchAppShellModalModel,
  SearchAppShellOverlayModel,
} from './search-app-shell-render-contract';
import type { SearchRootSuggestionRuntime } from './search-root-core-runtime-contract';
import type { SearchRootVisualRuntime } from './search-root-visual-runtime-contract';
import type { SearchRootActionLanesRuntime } from './use-search-root-action-lanes-runtime-contract';
import type { SearchHeaderVisualModel } from './results-presentation-shell-contract';
import type {
  SearchForegroundChromeFiltersWarmupInputs,
  SearchOverlayChromeModel,
} from './search-foreground-chrome-contract';
import { getActiveSearchNavSwitchPerfProbe } from './search-nav-switch-perf-probe';

const getPerfNow = (): number => {
  const perfNow = globalThis.performance?.now?.();
  return typeof perfNow === 'number' && Number.isFinite(perfNow) ? perfNow : Date.now();
};

const SEARCH_BOTTOM_NAV_ITEMS: SearchBottomNavProps['navItems'] = [
  { key: 'search', label: 'Search' },
  { key: 'bookmarks', label: 'Favorites' },
  { key: 'profile', label: 'Profile' },
];

type SearchRootOverlayRenderSearchState = {
  activeTab: 'restaurants' | 'dishes';
  isSearchFiltersLayoutWarm: boolean;
  searchFiltersLayoutCacheRef: React.MutableRefObject<SearchFiltersLayoutCache | null>;
  handleSearchFiltersLayoutCache: (cache: SearchFiltersLayoutCache) => void;
};

type UseSearchRootOverlayRenderSurfaceRuntimeArgs = {
  insets: {
    top: number;
    left: number;
    right: number;
  };
  overlaySessionRuntime: SearchRootScaffoldRuntime['overlaySessionRuntime'];
  instrumentationRuntime: SearchRootScaffoldRuntime['instrumentationRuntime'];
  suggestionRuntime: SearchRootSuggestionRuntime;
  visualRuntime: SearchRootVisualRuntime;
  actionLanesRuntime: SearchRootActionLanesRuntime;
  headerVisualModel: SearchHeaderVisualModel;
  searchState: SearchRootOverlayRenderSearchState;
  shouldFreezeSuggestionSurfaceForRunOne: boolean;
  shouldFreezeOverlayHeaderChromeForRunOne: boolean;
};

export const useSearchRootOverlayRenderSurfaceRuntime = ({
  insets,
  overlaySessionRuntime,
  instrumentationRuntime,
  suggestionRuntime,
  visualRuntime,
  actionLanesRuntime,
  headerVisualModel,
  searchState,
  shouldFreezeSuggestionSurfaceForRunOne,
  shouldFreezeOverlayHeaderChromeForRunOne,
}: UseSearchRootOverlayRenderSurfaceRuntimeArgs): {
  overlayRenderSurfaceModel: SearchAppShellOverlayModel;
  modalSheetRenderSurfaceModel: SearchAppShellModalModel;
} => {
  const suggestionVisualInputs = React.useMemo(
    () => ({
      searchSurfaceAnimatedStyle: visualRuntime.searchSurfaceAnimatedStyle,
      shouldDisableSearchBlur: false,
      shouldShowSuggestionSurface: suggestionRuntime.shouldShowSuggestionSurface,
      resolvedSuggestionHeaderHoles: suggestionRuntime.resolvedSuggestionHeaderHoles,
      suggestionHeaderHeightAnimatedStyle: suggestionRuntime.suggestionHeaderHeightAnimatedStyle,
      suggestionPanelAnimatedStyle: visualRuntime.suggestionPanelAnimatedStyle,
      shouldDriveSuggestionLayout: suggestionRuntime.shouldDriveSuggestionLayout,
      shouldShowSuggestionBackground: suggestionRuntime.shouldShowSuggestionBackground,
      suggestionTopFillHeight: suggestionRuntime.suggestionTopFillHeight,
      suggestionScrollTopAnimatedStyle: suggestionRuntime.suggestionScrollTopAnimatedStyle,
      suggestionScrollMaxHeightTarget: suggestionRuntime.suggestionScrollMaxHeightTarget,
      suggestionScrollMaxHeightAnimatedStyle:
        suggestionRuntime.suggestionScrollMaxHeightAnimatedStyle,
      searchLayoutTop: suggestionRuntime.searchLayout.top,
      searchLayoutHeight: suggestionRuntime.searchLayout.height,
      navBarHeight: visualRuntime.navBarHeight,
      bottomInset: overlaySessionRuntime.bottomInset,
      suggestionHeaderDividerAnimatedStyle: suggestionRuntime.suggestionHeaderDividerAnimatedStyle,
    }),
    [
      overlaySessionRuntime.bottomInset,
      suggestionRuntime.resolvedSuggestionHeaderHoles,
      suggestionRuntime.searchLayout.height,
      suggestionRuntime.searchLayout.top,
      suggestionRuntime.shouldDriveSuggestionLayout,
      suggestionRuntime.shouldShowSuggestionBackground,
      suggestionRuntime.shouldShowSuggestionSurface,
      suggestionRuntime.suggestionHeaderDividerAnimatedStyle,
      suggestionRuntime.suggestionHeaderHeightAnimatedStyle,
      suggestionRuntime.suggestionScrollMaxHeightAnimatedStyle,
      suggestionRuntime.suggestionScrollMaxHeightTarget,
      suggestionRuntime.suggestionScrollTopAnimatedStyle,
      suggestionRuntime.suggestionTopFillHeight,
      visualRuntime.navBarHeight,
      visualRuntime.searchSurfaceAnimatedStyle,
      visualRuntime.suggestionPanelAnimatedStyle,
    ]
  );

  const suggestionContentInputs = React.useMemo(
    () => ({
      isSuggestionScreenActive: suggestionRuntime.isSuggestionScreenActive,
      shouldRenderSuggestionPanel: suggestionRuntime.shouldRenderSuggestionPanel,
      shouldRenderAutocompleteSection: suggestionRuntime.shouldRenderAutocompleteSection,
      shouldRenderRecentSection: suggestionRuntime.shouldRenderRecentSection,
      suggestionDisplaySuggestions: suggestionRuntime.suggestionDisplaySuggestions,
      recentSearchesDisplay: suggestionRuntime.recentSearchesDisplay,
      recentlyViewedRestaurantsDisplay: suggestionRuntime.recentlyViewedRestaurantsDisplay,
      recentlyViewedFoodsDisplay: suggestionRuntime.recentlyViewedFoodsDisplay,
      hasRecentSearchesDisplay: suggestionRuntime.hasRecentSearchesDisplay,
      hasRecentlyViewedRestaurantsDisplay: suggestionRuntime.hasRecentlyViewedRestaurantsDisplay,
      hasRecentlyViewedFoodsDisplay: suggestionRuntime.hasRecentlyViewedFoodsDisplay,
      isRecentLoadingDisplay: suggestionRuntime.isRecentLoadingDisplay,
      isRecentlyViewedLoadingDisplay: suggestionRuntime.isRecentlyViewedLoadingDisplay,
      isRecentlyViewedFoodsLoadingDisplay: suggestionRuntime.isRecentlyViewedFoodsLoadingDisplay,
    }),
    [
      suggestionRuntime.hasRecentSearchesDisplay,
      suggestionRuntime.hasRecentlyViewedFoodsDisplay,
      suggestionRuntime.hasRecentlyViewedRestaurantsDisplay,
      suggestionRuntime.isRecentLoadingDisplay,
      suggestionRuntime.isRecentlyViewedFoodsLoadingDisplay,
      suggestionRuntime.isRecentlyViewedLoadingDisplay,
      suggestionRuntime.isSuggestionScreenActive,
      suggestionRuntime.recentSearchesDisplay,
      suggestionRuntime.recentlyViewedFoodsDisplay,
      suggestionRuntime.recentlyViewedRestaurantsDisplay,
      suggestionRuntime.shouldRenderAutocompleteSection,
      suggestionRuntime.shouldRenderRecentSection,
      suggestionRuntime.shouldRenderSuggestionPanel,
      suggestionRuntime.suggestionDisplaySuggestions,
    ]
  );

  const suggestionInteractionInputs = React.useMemo(
    () => ({
      onSuggestionScroll: suggestionRuntime.suggestionScrollHandler,
      onSuggestionTouchStart:
        actionLanesRuntime.profileActionRuntime.suggestionInteractionRuntime
          .handleSuggestionTouchStart,
      onSuggestionContentSizeChange: suggestionRuntime.handleSuggestionContentSizeChange,
      onSuggestionInteractionStart:
        actionLanesRuntime.profileActionRuntime.suggestionInteractionRuntime
          .handleSuggestionInteractionStart,
      onSuggestionInteractionEnd:
        actionLanesRuntime.profileActionRuntime.suggestionInteractionRuntime
          .handleSuggestionInteractionEnd,
      onSuggestionPress:
        actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime
          .handleSuggestionPress,
      onRecentSearchPress:
        actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime
          .handleRecentSearchPress,
      onRecentlyViewedRestaurantPress:
        actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime
          .handleRecentlyViewedRestaurantPress,
      onRecentlyViewedFoodPress:
        actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime
          .handleRecentlyViewedFoodPress,
      onRecentViewMorePress:
        actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime
          .handleRecentViewMorePress,
      onRecentlyViewedMorePress:
        actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime
          .handleRecentlyViewedMorePress,
    }),
    [
      actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime
        .handleRecentSearchPress,
      actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime
        .handleRecentViewMorePress,
      actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime
        .handleRecentlyViewedFoodPress,
      actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime
        .handleRecentlyViewedMorePress,
      actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime
        .handleRecentlyViewedRestaurantPress,
      actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.handleSuggestionPress,
      actionLanesRuntime.profileActionRuntime.suggestionInteractionRuntime
        .handleSuggestionInteractionEnd,
      actionLanesRuntime.profileActionRuntime.suggestionInteractionRuntime
        .handleSuggestionInteractionStart,
      actionLanesRuntime.profileActionRuntime.suggestionInteractionRuntime
        .handleSuggestionTouchStart,
      suggestionRuntime.handleSuggestionContentSizeChange,
      suggestionRuntime.suggestionScrollHandler,
    ]
  );

  const suggestionInputs = React.useMemo(
    () => ({
      visualInputs: suggestionVisualInputs,
      contentInputs: suggestionContentInputs,
      interactionInputs: suggestionInteractionInputs,
    }),
    [suggestionContentInputs, suggestionInteractionInputs, suggestionVisualInputs]
  );

  const headerSearchBarInputs = React.useMemo(
    () => ({
      handleSearchContainerLayout: suggestionRuntime.handleSearchContainerLayout,
      shouldShowAutocompleteSpinnerInBar: suggestionRuntime.shouldShowAutocompleteSpinnerInBar,
      handleQueryChange:
        actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.handleQueryChange,
      handleSubmit:
        actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.handleSubmit,
      handleSearchFocus:
        actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.handleSearchFocus,
      handleSearchBlur:
        actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.handleSearchBlur,
      handleClear:
        actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.handleClear,
      focusSearchInput:
        actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.focusSearchInput,
      handleSearchPressIn:
        actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.handleSearchPressIn,
      handleSearchBack:
        actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.handleSearchBack,
      handleSearchHeaderLayout: suggestionRuntime.handleSearchHeaderLayout,
      inputRef: actionLanesRuntime.profileActionRuntime.profileOwner.profileViewState.inputRef,
      searchBarInputAnimatedStyle: visualRuntime.searchBarInputAnimatedStyle,
      searchBarContainerAnimatedStyle: visualRuntime.searchBarContainerAnimatedStyle,
      isSuggestionScrollDismissing:
        actionLanesRuntime.profileActionRuntime.suggestionInteractionRuntime
          .isSuggestionScrollDismissing,
      searchHeaderFocusProgress: suggestionRuntime.searchHeaderFocusProgress,
    }),
    [
      actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.handleClear,
      actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.handleQueryChange,
      actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.handleSearchBack,
      actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.handleSearchBlur,
      actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.handleSearchFocus,
      actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.handleSearchPressIn,
      actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.handleSubmit,
      actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.focusSearchInput,
      actionLanesRuntime.profileActionRuntime.profileOwner.profileViewState.inputRef,
      actionLanesRuntime.profileActionRuntime.suggestionInteractionRuntime
        .isSuggestionScrollDismissing,
      suggestionRuntime.handleSearchContainerLayout,
      suggestionRuntime.handleSearchHeaderLayout,
      suggestionRuntime.searchHeaderFocusProgress,
      suggestionRuntime.shouldShowAutocompleteSpinnerInBar,
      visualRuntime.searchBarContainerAnimatedStyle,
      visualRuntime.searchBarInputAnimatedStyle,
    ]
  );

  const headerShortcutsInputs = React.useMemo(
    () => ({
      shouldMountSearchShortcuts: visualRuntime.shouldMountSearchShortcuts,
      shouldEnableSearchShortcutsInteraction: visualRuntime.shouldEnableSearchShortcutsInteraction,
      searchShortcutsAnimatedStyle: visualRuntime.searchShortcutsAnimatedStyle,
      searchShortcutChipAnimatedStyle: visualRuntime.searchShortcutChipAnimatedStyle,
      handleBestRestaurantsHere:
        actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime
          .handleBestRestaurantsHere,
      handleBestDishesHere:
        actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime
          .handleBestDishesHere,
      handleSearchShortcutsRowLayout: suggestionRuntime.handleSearchShortcutsRowLayout,
      handleRestaurantsShortcutLayout: suggestionRuntime.handleRestaurantsShortcutLayout,
      handleDishesShortcutLayout: suggestionRuntime.handleDishesShortcutLayout,
    }),
    [
      actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.handleBestDishesHere,
      actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime
        .handleBestRestaurantsHere,
      suggestionRuntime.handleDishesShortcutLayout,
      suggestionRuntime.handleRestaurantsShortcutLayout,
      suggestionRuntime.handleSearchShortcutsRowLayout,
      visualRuntime.searchShortcutChipAnimatedStyle,
      visualRuntime.searchShortcutsAnimatedStyle,
      visualRuntime.shouldEnableSearchShortcutsInteraction,
      visualRuntime.shouldMountSearchShortcuts,
    ]
  );

  const headerSearchThisAreaInputs = React.useMemo(
    () => ({
      shouldShowSearchThisArea: visualRuntime.shouldShowSearchThisArea,
      searchThisAreaTop: visualRuntime.searchThisAreaTop,
      searchThisAreaAnimatedStyle: visualRuntime.searchThisAreaAnimatedStyle,
      handleSearchThisArea:
        actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime
          .handleSearchThisArea,
    }),
    [
      actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.handleSearchThisArea,
      visualRuntime.searchThisAreaAnimatedStyle,
      visualRuntime.searchThisAreaTop,
      visualRuntime.shouldShowSearchThisArea,
    ]
  );

  const headerInputs = React.useMemo(
    () => ({
      searchBarInputs: headerSearchBarInputs,
      shortcutsInputs: headerShortcutsInputs,
      searchThisAreaInputs: headerSearchThisAreaInputs,
    }),
    [headerSearchBarInputs, headerSearchThisAreaInputs, headerShortcutsInputs]
  );

  const filtersWarmupInputs = React.useMemo<SearchForegroundChromeFiltersWarmupInputs>(
    () => ({
      isSearchFiltersLayoutWarm: searchState.isSearchFiltersLayoutWarm,
      activeTab: searchState.activeTab,
      openNow: actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.openNow,
      votesFilterActive:
        actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.votesFilterActive,
      priceButtonLabelText:
        actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.priceButtonLabelText,
      priceButtonIsActive:
        actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.priceButtonIsActive,
      searchFiltersLayoutCacheRef: searchState.searchFiltersLayoutCacheRef,
      handleSearchFiltersLayoutCache: searchState.handleSearchFiltersLayoutCache,
    }),
    [
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.openNow,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.priceButtonIsActive,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.priceButtonLabelText,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.votesFilterActive,
      searchState.activeTab,
      searchState.handleSearchFiltersLayoutCache,
      searchState.isSearchFiltersLayoutWarm,
      searchState.searchFiltersLayoutCacheRef,
    ]
  );

  const suggestionSurfacePropsBase = React.useMemo(
    () => ({
      ...suggestionInputs.visualInputs,
      ...suggestionInputs.contentInputs,
      ...suggestionInputs.interactionInputs,
      pointerEvents: suggestionRuntime.isSuggestionOverlayVisible ? 'auto' : 'none',
      shouldHideBottomNav: visualRuntime.shouldHideBottomNavForRender,
    }),
    [
      suggestionInputs.contentInputs,
      suggestionInputs.interactionInputs,
      suggestionInputs.visualInputs,
      suggestionRuntime.isSuggestionOverlayVisible,
      visualRuntime.shouldHideBottomNavForRender,
    ]
  );

  const frozenSuggestionSurfacePropsRef = React.useRef<Pick<
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
  > | null>(null);

  const nextSuggestionSurfaceFrozenProps = {
    suggestionDisplaySuggestions: suggestionSurfacePropsBase.suggestionDisplaySuggestions,
    recentSearchesDisplay: suggestionSurfacePropsBase.recentSearchesDisplay,
    recentlyViewedRestaurantsDisplay: suggestionSurfacePropsBase.recentlyViewedRestaurantsDisplay,
    recentlyViewedFoodsDisplay: suggestionSurfacePropsBase.recentlyViewedFoodsDisplay,
    hasRecentSearchesDisplay: suggestionSurfacePropsBase.hasRecentSearchesDisplay,
    hasRecentlyViewedRestaurantsDisplay:
      suggestionSurfacePropsBase.hasRecentlyViewedRestaurantsDisplay,
    hasRecentlyViewedFoodsDisplay: suggestionSurfacePropsBase.hasRecentlyViewedFoodsDisplay,
    isRecentLoadingDisplay: suggestionSurfacePropsBase.isRecentLoadingDisplay,
    isRecentlyViewedLoadingDisplay: suggestionSurfacePropsBase.isRecentlyViewedLoadingDisplay,
    isRecentlyViewedFoodsLoadingDisplay:
      suggestionSurfacePropsBase.isRecentlyViewedFoodsLoadingDisplay,
  };

  if (!shouldFreezeSuggestionSurfaceForRunOne) {
    frozenSuggestionSurfacePropsRef.current = nextSuggestionSurfaceFrozenProps;
  }

  const suggestionSurfacePropsForRender = shouldFreezeSuggestionSurfaceForRunOne
    ? (frozenSuggestionSurfacePropsRef.current ?? nextSuggestionSurfaceFrozenProps)
    : nextSuggestionSurfaceFrozenProps;

  const suggestionSurfaceProps = React.useMemo(
    () => ({
      ...suggestionSurfacePropsBase,
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
    }),
    [suggestionSurfacePropsBase, suggestionSurfacePropsForRender]
  );

  const headerChromePropsBase = React.useMemo(
    () => ({
      ...headerInputs.searchBarInputs,
      ...headerInputs.shortcutsInputs,
      ...headerInputs.searchThisAreaInputs,
      headerVisualModel,
    }),
    [
      headerInputs.searchBarInputs,
      headerInputs.searchThisAreaInputs,
      headerInputs.shortcutsInputs,
      headerVisualModel,
    ]
  );

  const frozenHeaderChromePropsRef = React.useRef<Pick<
    SearchOverlayChromeModel['headerChromeProps'],
    | 'shouldMountSearchShortcuts'
    | 'shouldEnableSearchShortcutsInteraction'
    | 'shouldShowSearchThisArea'
    | 'searchThisAreaTop'
  > | null>(null);

  const nextHeaderChromeFrozenProps = {
    shouldMountSearchShortcuts: headerChromePropsBase.shouldMountSearchShortcuts,
    shouldEnableSearchShortcutsInteraction:
      headerChromePropsBase.shouldEnableSearchShortcutsInteraction,
    shouldShowSearchThisArea: headerChromePropsBase.shouldShowSearchThisArea,
    searchThisAreaTop: headerChromePropsBase.searchThisAreaTop,
  };

  if (!shouldFreezeOverlayHeaderChromeForRunOne) {
    frozenHeaderChromePropsRef.current = nextHeaderChromeFrozenProps;
  }

  const headerChromePropsForRender = shouldFreezeOverlayHeaderChromeForRunOne
    ? (frozenHeaderChromePropsRef.current ?? nextHeaderChromeFrozenProps)
    : nextHeaderChromeFrozenProps;

  const headerChromeProps = React.useMemo(
    () => ({
      ...headerChromePropsBase,
      shouldMountSearchShortcuts: headerChromePropsForRender.shouldMountSearchShortcuts,
      shouldEnableSearchShortcutsInteraction:
        headerChromePropsForRender.shouldEnableSearchShortcutsInteraction,
      shouldShowSearchThisArea: headerChromePropsForRender.shouldShowSearchThisArea,
      searchThisAreaTop: headerChromePropsForRender.searchThisAreaTop,
    }),
    [headerChromePropsBase, headerChromePropsForRender]
  );

  const hiddenSearchFiltersWarmupProps = React.useMemo(
    () =>
      filtersWarmupInputs.isSearchFiltersLayoutWarm
        ? null
        : {
            activeTab: filtersWarmupInputs.activeTab,
            onTabChange: () => undefined,
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
          },
    [
      filtersWarmupInputs.activeTab,
      filtersWarmupInputs.handleSearchFiltersLayoutCache,
      filtersWarmupInputs.isSearchFiltersLayoutWarm,
      filtersWarmupInputs.openNow,
      filtersWarmupInputs.priceButtonIsActive,
      filtersWarmupInputs.priceButtonLabelText,
      filtersWarmupInputs.searchFiltersLayoutCacheRef,
      filtersWarmupInputs.votesFilterActive,
    ]
  );

  const searchOverlayChromeModel = React.useMemo(
    () =>
      ({
        overlayContainerStyle: {
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
        isSuggestionOverlayVisible: suggestionRuntime.isSuggestionOverlayVisible,
        shouldHideBottomNavForRender: visualRuntime.shouldHideBottomNavForRender,
        suggestionSurfaceProps,
        headerChromeProps,
        hiddenSearchFiltersWarmupProps,
      }) as SearchOverlayChromeModel,
    [
      headerChromeProps,
      hiddenSearchFiltersWarmupProps,
      insets.left,
      insets.right,
      insets.top,
      suggestionRuntime.isSuggestionOverlayVisible,
      suggestionSurfaceProps,
      visualRuntime.shouldHideBottomNavForRender,
    ]
  );

  const bottomNavProps = React.useMemo(
    () => ({
      bottomInset: overlaySessionRuntime.bottomInset,
      handleBottomNavLayout: overlaySessionRuntime.handleBottomNavLayout,
      shouldDisableSearchBlur: false,
      navItems: SEARCH_BOTTOM_NAV_ITEMS,
      rootOverlay: overlaySessionRuntime.rootOverlay,
      navIconRenderers: SEARCH_BOTTOM_NAV_ICON_RENDERERS,
      handleProfilePress:
        actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.handleProfilePress,
      handleOverlaySelect:
        actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.handleOverlaySelect,
      bottomNavAnimatedStyle: visualRuntime.bottomNavAnimatedStyle,
      shouldHideBottomNav: visualRuntime.shouldHideBottomNavForRender,
      bottomNavItemVisibilityAnimatedStyle: visualRuntime.bottomNavItemVisibilityAnimatedStyle,
    }),
    [
      actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.handleOverlaySelect,
      actionLanesRuntime.foregroundActionRuntime.foregroundInteractionRuntime.handleProfilePress,
      overlaySessionRuntime.bottomInset,
      overlaySessionRuntime.handleBottomNavLayout,
      overlaySessionRuntime.rootOverlay,
      visualRuntime.bottomNavAnimatedStyle,
      visualRuntime.bottomNavItemVisibilityAnimatedStyle,
      visualRuntime.shouldHideBottomNavForRender,
    ]
  );

  const overlayRenderSurfaceModel: SearchAppShellOverlayModel = React.useMemo(
    () => ({
      searchOverlayChromeModel,
      routeOverlayChromeTransitionProgress: visualRuntime.overlayChromeTransitionProgress,
      routeOverlayBackdropDimProgress: visualRuntime.overlayBackdropDimProgress,
      bottomNavProps,
      statusBarFadeHeight: visualRuntime.statusBarFadeHeight,
      shouldRenderSearchOverlay: overlaySessionRuntime.shouldRenderSearchOverlay,
    }),
    [
      bottomNavProps,
      overlaySessionRuntime.shouldRenderSearchOverlay,
      searchOverlayChromeModel,
      visualRuntime.overlayBackdropDimProgress,
      visualRuntime.overlayChromeTransitionProgress,
      visualRuntime.statusBarFadeHeight,
    ]
  );

  const navSwitchOverlayChromeSnapshotRef = React.useRef<string | null>(null);
  const navSwitchBottomNavSnapshotRef = React.useRef<string | null>(null);
  const navSwitchOverlaySurfaceSnapshotRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const probe = getActiveSearchNavSwitchPerfProbe();
    if (!probe) {
      navSwitchOverlayChromeSnapshotRef.current = null;
      navSwitchBottomNavSnapshotRef.current = null;
      navSwitchOverlaySurfaceSnapshotRef.current = null;
      return;
    }

    const overlayChromeSnapshot = JSON.stringify({
      shouldRenderSearchOverlay: overlaySessionRuntime.shouldRenderSearchOverlay,
      isSuggestionOverlayVisible: searchOverlayChromeModel.isSuggestionOverlayVisible,
      shouldHideBottomNavForRender: searchOverlayChromeModel.shouldHideBottomNavForRender,
      headerVisualModel: {
        chromeMode: headerVisualModel.chromeMode,
        editable: headerVisualModel.editable,
        leadingIconMode: headerVisualModel.leadingIconMode,
        trailingActionMode: headerVisualModel.trailingActionMode,
        displayQuery: headerVisualModel.displayQuery,
      },
      shouldMountSearchShortcuts:
        searchOverlayChromeModel.headerChromeProps.shouldMountSearchShortcuts,
      shouldEnableSearchShortcutsInteraction:
        searchOverlayChromeModel.headerChromeProps.shouldEnableSearchShortcutsInteraction,
      shouldShowSearchThisArea: searchOverlayChromeModel.headerChromeProps.shouldShowSearchThisArea,
    });
    if (navSwitchOverlayChromeSnapshotRef.current !== overlayChromeSnapshot) {
      navSwitchOverlayChromeSnapshotRef.current = overlayChromeSnapshot;
      logger.debug('[NAV-SWITCH-PERF] modelDelta', {
        seq: probe.seq,
        from: probe.from,
        to: probe.to,
        model: 'SearchOverlayChrome',
        ageMs: Number((getPerfNow() - probe.startedAtMs).toFixed(1)),
        snapshot: JSON.parse(overlayChromeSnapshot),
      });
    }

    const bottomNavSnapshot = JSON.stringify({
      rootOverlay: bottomNavProps.rootOverlay,
      shouldHideBottomNav: bottomNavProps.shouldHideBottomNav,
      bottomInset: bottomNavProps.bottomInset,
    });
    if (navSwitchBottomNavSnapshotRef.current !== bottomNavSnapshot) {
      navSwitchBottomNavSnapshotRef.current = bottomNavSnapshot;
      logger.debug('[NAV-SWITCH-PERF] modelDelta', {
        seq: probe.seq,
        from: probe.from,
        to: probe.to,
        model: 'BottomNav',
        ageMs: Number((getPerfNow() - probe.startedAtMs).toFixed(1)),
        snapshot: JSON.parse(bottomNavSnapshot),
      });
    }

    const overlaySurfaceSnapshot = JSON.stringify({
      rootOverlay: overlaySessionRuntime.rootOverlay,
      activeOverlayKey: overlaySessionRuntime.activeOverlayKey,
      shouldRenderSearchOverlay: overlaySessionRuntime.shouldRenderSearchOverlay,
      showPollsOverlay: overlaySessionRuntime.showPollsOverlay,
      showBookmarksOverlay: overlaySessionRuntime.showBookmarksOverlay,
      showProfileOverlay: overlaySessionRuntime.showProfileOverlay,
      shouldShowDockedPolls: overlaySessionRuntime.shouldShowDockedPolls,
      shouldShowPollsSheet: overlaySessionRuntime.shouldShowPollsSheet,
    });
    if (navSwitchOverlaySurfaceSnapshotRef.current !== overlaySurfaceSnapshot) {
      navSwitchOverlaySurfaceSnapshotRef.current = overlaySurfaceSnapshot;
      logger.debug('[NAV-SWITCH-PERF] modelDelta', {
        seq: probe.seq,
        from: probe.from,
        to: probe.to,
        model: 'OverlaySurface',
        ageMs: Number((getPerfNow() - probe.startedAtMs).toFixed(1)),
        snapshot: JSON.parse(overlaySurfaceSnapshot),
      });
    }
  }, [
    bottomNavProps.bottomInset,
    bottomNavProps.rootOverlay,
    bottomNavProps.shouldHideBottomNav,
    headerVisualModel.chromeMode,
    headerVisualModel.displayQuery,
    headerVisualModel.editable,
    headerVisualModel.leadingIconMode,
    headerVisualModel.trailingActionMode,
    overlaySessionRuntime.activeOverlayKey,
    overlaySessionRuntime.rootOverlay,
    overlaySessionRuntime.shouldRenderSearchOverlay,
    overlaySessionRuntime.shouldShowDockedPolls,
    overlaySessionRuntime.shouldShowPollsSheet,
    overlaySessionRuntime.showBookmarksOverlay,
    overlaySessionRuntime.showPollsOverlay,
    overlaySessionRuntime.showProfileOverlay,
    searchOverlayChromeModel.headerChromeProps.shouldEnableSearchShortcutsInteraction,
    searchOverlayChromeModel.headerChromeProps.shouldMountSearchShortcuts,
    searchOverlayChromeModel.headerChromeProps.shouldShowSearchThisArea,
    searchOverlayChromeModel.isSuggestionOverlayVisible,
    searchOverlayChromeModel.shouldHideBottomNavForRender,
  ]);

  const rankAndScoreSheetsProps = React.useMemo(
    () => ({
      isScoreInfoVisible:
        actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.isScoreInfoVisible,
      scoreInfo: actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.scoreInfo,
      closeScoreInfo: actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.closeScoreInfo,
      clearScoreInfo: actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.clearScoreInfo,
      scoreInfoMaxHeight: SCORE_INFO_MAX_HEIGHT,
      formatCompactCount,
      onProfilerRender: instrumentationRuntime.handleProfilerRender,
    }),
    [
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.clearScoreInfo,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.closeScoreInfo,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.isScoreInfoVisible,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.scoreInfo,
      instrumentationRuntime.handleProfilerRender,
    ]
  );
  const priceSheetProps = React.useMemo(
    () => ({
      priceSheetRef: actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.priceSheetRef,
      isPriceSelectorVisible:
        actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.isPriceSelectorVisible,
      closePriceSelector:
        actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.closePriceSelector,
      summaryCandidates:
        actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.priceSummaryCandidates,
      onMeasureSummaryCandidateWidth:
        actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.measureSummaryCandidateWidth,
      summaryPillPaddingX:
        actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.priceSummaryPillPaddingX,
      summaryPillWidth:
        actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.priceSummaryPillWidth,
      summaryLabel: actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.priceSheetSummary,
      summaryReelItems:
        actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.summaryReelItems,
      summaryReelPosition:
        actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.priceSheetSummaryReelPosition,
      summaryReelNearestIndex:
        actionLanesRuntime.foregroundActionRuntime.filterModalRuntime
          .priceSheetSummaryReelNearestIndex,
      summaryReelNeighborVisibility:
        actionLanesRuntime.foregroundActionRuntime.filterModalRuntime
          .priceSheetSummaryNeighborVisibility,
      isPriceSheetContentReady:
        actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.isPriceSheetContentReady,
      priceSliderLowValue:
        actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.priceSliderLowValue,
      priceSliderHighValue:
        actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.priceSliderHighValue,
      handlePriceSliderCommit:
        actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.handlePriceSliderCommit,
      dismissPriceSelector:
        actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.dismissPriceSelector,
      handlePriceDone:
        actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.handlePriceDone,
      activeTabColor: ACTIVE_TAB_COLOR,
    }),
    [
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.closePriceSelector,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.dismissPriceSelector,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.handlePriceDone,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.handlePriceSliderCommit,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.isPriceSelectorVisible,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.isPriceSheetContentReady,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.measureSummaryCandidateWidth,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.priceSheetRef,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.priceSheetSummary,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime
        .priceSheetSummaryNeighborVisibility,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime
        .priceSheetSummaryReelNearestIndex,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.priceSheetSummaryReelPosition,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.priceSliderHighValue,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.priceSliderLowValue,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.priceSummaryCandidates,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.priceSummaryPillPaddingX,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.priceSummaryPillWidth,
      actionLanesRuntime.foregroundActionRuntime.filterModalRuntime.summaryReelItems,
    ]
  );
  const modalSheetRenderSurfaceModel: SearchAppShellModalModel = React.useMemo(
    () => ({
      rankAndScoreSheetsProps,
      priceSheetProps,
    }),
    [priceSheetProps, rankAndScoreSheetsProps]
  );

  return {
    overlayRenderSurfaceModel,
    modalSheetRenderSurfaceModel,
  };
};
