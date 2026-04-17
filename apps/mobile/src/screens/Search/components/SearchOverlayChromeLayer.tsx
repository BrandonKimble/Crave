import React from 'react';
import { View } from 'react-native';

import SearchFilters from './SearchFilters';
import SearchOverlayHeaderChrome from './SearchOverlayHeaderChrome';
import SearchSuggestionSurface from './SearchSuggestionSurface';
import styles from '../styles';
import type { SearchOverlayChromeModel } from '../runtime/shared/search-foreground-chrome-contract';

const getCollectionSize = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

const buildSearchOverlayChromeMemoKey = (
  searchOverlayChromeModel: SearchOverlayChromeModel
): string =>
  JSON.stringify({
    isSuggestionOverlayVisible: searchOverlayChromeModel.isSuggestionOverlayVisible,
    shouldHideBottomNavForRender: searchOverlayChromeModel.shouldHideBottomNavForRender,
    overlayContainerStyle: searchOverlayChromeModel.overlayContainerStyle,
    headerVisualModel: {
      chromeMode: searchOverlayChromeModel.headerChromeProps.headerVisualModel.chromeMode,
      displayQuery: searchOverlayChromeModel.headerChromeProps.headerVisualModel.displayQuery,
      editable: searchOverlayChromeModel.headerChromeProps.headerVisualModel.editable,
      leadingIconMode: searchOverlayChromeModel.headerChromeProps.headerVisualModel.leadingIconMode,
      trailingActionMode:
        searchOverlayChromeModel.headerChromeProps.headerVisualModel.trailingActionMode,
    },
    shouldMountSearchShortcuts:
      searchOverlayChromeModel.headerChromeProps.shouldMountSearchShortcuts,
    shouldEnableSearchShortcutsInteraction:
      searchOverlayChromeModel.headerChromeProps.shouldEnableSearchShortcutsInteraction,
    shouldShowSearchThisArea: searchOverlayChromeModel.headerChromeProps.shouldShowSearchThisArea,
    shouldRenderSuggestionPanel:
      searchOverlayChromeModel.suggestionSurfaceProps.shouldRenderSuggestionPanel,
    shouldRenderAutocompleteSection:
      searchOverlayChromeModel.suggestionSurfaceProps.shouldRenderAutocompleteSection,
    shouldRenderRecentSection:
      searchOverlayChromeModel.suggestionSurfaceProps.shouldRenderRecentSection,
    suggestionCount: getCollectionSize(
      searchOverlayChromeModel.suggestionSurfaceProps.suggestionDisplaySuggestions
    ),
    recentSearchCount: getCollectionSize(
      searchOverlayChromeModel.suggestionSurfaceProps.recentSearchesDisplay
    ),
    recentRestaurantCount: getCollectionSize(
      searchOverlayChromeModel.suggestionSurfaceProps.recentlyViewedRestaurantsDisplay
    ),
    recentFoodCount: getCollectionSize(
      searchOverlayChromeModel.suggestionSurfaceProps.recentlyViewedFoodsDisplay
    ),
    isRecentLoadingDisplay: searchOverlayChromeModel.suggestionSurfaceProps.isRecentLoadingDisplay,
    isRecentlyViewedLoadingDisplay:
      searchOverlayChromeModel.suggestionSurfaceProps.isRecentlyViewedLoadingDisplay,
    isRecentlyViewedFoodsLoadingDisplay:
      searchOverlayChromeModel.suggestionSurfaceProps.isRecentlyViewedFoodsLoadingDisplay,
    hasHiddenSearchFiltersWarmupProps:
      searchOverlayChromeModel.hiddenSearchFiltersWarmupProps != null,
  });

type SearchOverlayChromeLayerProps = {
  searchOverlayChromeModel: SearchOverlayChromeModel;
};

const SearchOverlayChromeLayer = React.memo(
  ({ searchOverlayChromeModel }: SearchOverlayChromeLayerProps) => (
    <View
      style={[
        styles.overlay,
        searchOverlayChromeModel.overlayContainerStyle,
        searchOverlayChromeModel.isSuggestionOverlayVisible
          ? {
              zIndex: searchOverlayChromeModel.shouldHideBottomNavForRender ? 200 : 110,
            }
          : null,
      ]}
      pointerEvents="box-none"
    >
      <SearchSuggestionSurface {...searchOverlayChromeModel.suggestionSurfaceProps} />
      <SearchOverlayHeaderChrome {...searchOverlayChromeModel.headerChromeProps} />
      {searchOverlayChromeModel.hiddenSearchFiltersWarmupProps ? (
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
          <SearchFilters {...searchOverlayChromeModel.hiddenSearchFiltersWarmupProps} />
        </View>
      ) : null}
    </View>
  ),
  (previousProps, nextProps) =>
    buildSearchOverlayChromeMemoKey(previousProps.searchOverlayChromeModel) ===
    buildSearchOverlayChromeMemoKey(nextProps.searchOverlayChromeModel)
);

export default SearchOverlayChromeLayer;
