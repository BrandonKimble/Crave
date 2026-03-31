import React from 'react';
import { View } from 'react-native';

import SearchFilters from './SearchFilters';
import SearchOverlayHeaderChrome from './SearchOverlayHeaderChrome';
import SearchSuggestionSurface from './SearchSuggestionSurface';
import styles from '../styles';

type SuggestionSurfaceProps = React.ComponentProps<typeof SearchSuggestionSurface>;
type HeaderChromeProps = React.ComponentProps<typeof SearchOverlayHeaderChrome>;
type HiddenSearchFiltersWarmupProps = React.ComponentProps<typeof SearchFilters>;

type SuggestionSurfaceFrozenProps = Pick<
  SuggestionSurfaceProps,
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
  HeaderChromeProps,
  | 'shouldMountSearchShortcuts'
  | 'shouldEnableSearchShortcutsInteraction'
  | 'searchShortcutsAnimatedStyle'
  | 'searchShortcutChipAnimatedStyle'
  | 'shouldShowSearchThisArea'
  | 'searchThisAreaTop'
  | 'searchThisAreaAnimatedStyle'
>;

type SearchOverlayChromeTreeProps = {
  shouldFreezeSuggestionSurfaceForRunOne: boolean;
  shouldFreezeOverlayHeaderChromeForRunOne: boolean;
  overlayContainerStyle: React.ComponentProps<typeof View>['style'];
  isSuggestionOverlayVisible: boolean;
  shouldHideBottomNavForRender: boolean;
  suggestionSurfaceProps: SuggestionSurfaceProps;
  headerChromeProps: HeaderChromeProps;
  hiddenSearchFiltersWarmupProps?: HiddenSearchFiltersWarmupProps | null;
  onProfilerRender: React.ProfilerOnRenderCallback;
};

const SearchOverlayChromeTree = ({
  shouldFreezeSuggestionSurfaceForRunOne,
  shouldFreezeOverlayHeaderChromeForRunOne,
  overlayContainerStyle,
  isSuggestionOverlayVisible,
  shouldHideBottomNavForRender,
  suggestionSurfaceProps,
  headerChromeProps,
  hiddenSearchFiltersWarmupProps = null,
  onProfilerRender,
}: SearchOverlayChromeTreeProps) => {
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
    searchShortcutsAnimatedStyle: headerChromeProps.searchShortcutsAnimatedStyle,
    searchShortcutChipAnimatedStyle: headerChromeProps.searchShortcutChipAnimatedStyle,
    shouldShowSearchThisArea: headerChromeProps.shouldShowSearchThisArea,
    searchThisAreaTop: headerChromeProps.searchThisAreaTop,
    searchThisAreaAnimatedStyle: headerChromeProps.searchThisAreaAnimatedStyle,
  };
  if (!shouldFreezeOverlayHeaderChromeForRunOne) {
    frozenHeaderChromePropsRef.current = nextHeaderChromeFrozenProps;
  }
  const headerChromePropsForRender = shouldFreezeOverlayHeaderChromeForRunOne
    ? frozenHeaderChromePropsRef.current ?? nextHeaderChromeFrozenProps
    : nextHeaderChromeFrozenProps;

  return (
    <React.Profiler id="SearchOverlayChrome" onRender={onProfilerRender}>
      <View
        style={[
          styles.overlay,
          overlayContainerStyle,
          isSuggestionOverlayVisible ? { zIndex: shouldHideBottomNavForRender ? 200 : 110 } : null,
        ]}
        pointerEvents="box-none"
      >
        <SearchSuggestionSurface
          {...suggestionSurfaceProps}
          suggestionDisplaySuggestions={
            suggestionSurfacePropsForRender.suggestionDisplaySuggestions
          }
          recentSearchesDisplay={suggestionSurfacePropsForRender.recentSearchesDisplay}
          recentlyViewedRestaurantsDisplay={
            suggestionSurfacePropsForRender.recentlyViewedRestaurantsDisplay
          }
          recentlyViewedFoodsDisplay={suggestionSurfacePropsForRender.recentlyViewedFoodsDisplay}
          hasRecentSearchesDisplay={suggestionSurfacePropsForRender.hasRecentSearchesDisplay}
          hasRecentlyViewedRestaurantsDisplay={
            suggestionSurfacePropsForRender.hasRecentlyViewedRestaurantsDisplay
          }
          hasRecentlyViewedFoodsDisplay={
            suggestionSurfacePropsForRender.hasRecentlyViewedFoodsDisplay
          }
          isRecentLoadingDisplay={suggestionSurfacePropsForRender.isRecentLoadingDisplay}
          isRecentlyViewedLoadingDisplay={
            suggestionSurfacePropsForRender.isRecentlyViewedLoadingDisplay
          }
          isRecentlyViewedFoodsLoadingDisplay={
            suggestionSurfacePropsForRender.isRecentlyViewedFoodsLoadingDisplay
          }
        />
        <SearchOverlayHeaderChrome
          {...headerChromeProps}
          shouldMountSearchShortcuts={headerChromePropsForRender.shouldMountSearchShortcuts}
          shouldEnableSearchShortcutsInteraction={
            headerChromePropsForRender.shouldEnableSearchShortcutsInteraction
          }
          searchShortcutsAnimatedStyle={headerChromePropsForRender.searchShortcutsAnimatedStyle}
          searchShortcutChipAnimatedStyle={
            headerChromePropsForRender.searchShortcutChipAnimatedStyle
          }
          shouldShowSearchThisArea={headerChromePropsForRender.shouldShowSearchThisArea}
          searchThisAreaTop={headerChromePropsForRender.searchThisAreaTop}
          searchThisAreaAnimatedStyle={headerChromePropsForRender.searchThisAreaAnimatedStyle}
        />
        {hiddenSearchFiltersWarmupProps ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: -1000,
              opacity: 0,
            }}
          >
            <SearchFilters {...hiddenSearchFiltersWarmupProps} />
          </View>
        ) : null}
      </View>
    </React.Profiler>
  );
};

export default React.memo(SearchOverlayChromeTree);
