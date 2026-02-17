import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated from 'react-native-reanimated';

import { FrostedGlassBackground } from '../../../components/FrostedGlassBackground';
import MaskedHoleOverlay, { type MaskedHole } from '../../../components/MaskedHoleOverlay';
import type { AutocompleteMatch } from '../../../services/autocomplete';
import type {
  RecentSearch,
  RecentlyViewedFood,
  RecentlyViewedRestaurant,
} from '../../../services/search';
import {
  CONTENT_HORIZONTAL_PADDING,
  SCREEN_HEIGHT,
  SEARCH_SUGGESTION_PANEL_PADDING_BOTTOM,
} from '../constants/search';
import styles from '../styles';
import SearchSuggestions from './SearchSuggestions';

const SUGGESTION_SCROLL_WHITE_OVERSCROLL_BUFFER = SCREEN_HEIGHT;

type SearchSuggestionSurfaceProps = {
  searchSurfaceAnimatedStyle: StyleProp<ViewStyle>;
  shouldDisableSearchBlur: boolean;
  shouldShowSuggestionSurface: boolean;
  resolvedSuggestionHeaderHoles: MaskedHole[];
  suggestionHeaderHeightAnimatedStyle: StyleProp<ViewStyle>;
  suggestionPanelAnimatedStyle: StyleProp<ViewStyle>;
  shouldDriveSuggestionLayout: boolean;
  suggestionScrollTopAnimatedStyle: StyleProp<ViewStyle>;
  suggestionScrollMaxHeightTarget?: number;
  suggestionScrollMaxHeightAnimatedStyle: StyleProp<ViewStyle>;
  searchLayoutTop: number;
  searchLayoutHeight: number;
  shouldHideBottomNav: boolean;
  navBarHeight: number;
  bottomInset: number;
  onSuggestionScroll: React.ComponentProps<typeof Reanimated.ScrollView>['onScroll'];
  onSuggestionTouchStart: () => void;
  onSuggestionContentSizeChange: (width: number, height: number) => void;
  onSuggestionInteractionStart: () => void;
  onSuggestionInteractionEnd: () => void;
  isSuggestionScreenActive: boolean;
  shouldRenderSuggestionPanel: boolean;
  shouldRenderAutocompleteSection: boolean;
  shouldRenderRecentSection: boolean;
  suggestionDisplaySuggestions: AutocompleteMatch[];
  recentSearchesDisplay: RecentSearch[];
  recentlyViewedRestaurantsDisplay: RecentlyViewedRestaurant[];
  recentlyViewedFoodsDisplay: RecentlyViewedFood[];
  hasRecentSearchesDisplay: boolean;
  hasRecentlyViewedRestaurantsDisplay: boolean;
  hasRecentlyViewedFoodsDisplay: boolean;
  isRecentLoadingDisplay: boolean;
  isRecentlyViewedLoadingDisplay: boolean;
  isRecentlyViewedFoodsLoadingDisplay: boolean;
  onSuggestionPress: (match: AutocompleteMatch) => void;
  onRecentSearchPress: (term: RecentSearch) => void;
  onRecentlyViewedRestaurantPress: (restaurant: RecentlyViewedRestaurant) => void;
  onRecentlyViewedFoodPress: (food: RecentlyViewedFood) => void;
  onRecentViewMorePress: () => void;
  onRecentlyViewedMorePress: () => void;
  suggestionHeaderDividerAnimatedStyle: StyleProp<ViewStyle>;
};

const SearchSuggestionSurface = ({
  searchSurfaceAnimatedStyle,
  shouldDisableSearchBlur,
  shouldShowSuggestionSurface,
  resolvedSuggestionHeaderHoles,
  suggestionHeaderHeightAnimatedStyle,
  suggestionPanelAnimatedStyle,
  shouldDriveSuggestionLayout,
  suggestionScrollTopAnimatedStyle,
  suggestionScrollMaxHeightTarget,
  suggestionScrollMaxHeightAnimatedStyle,
  searchLayoutTop,
  searchLayoutHeight,
  shouldHideBottomNav,
  navBarHeight,
  bottomInset,
  onSuggestionScroll,
  onSuggestionTouchStart,
  onSuggestionContentSizeChange,
  onSuggestionInteractionStart,
  onSuggestionInteractionEnd,
  isSuggestionScreenActive,
  shouldRenderSuggestionPanel,
  shouldRenderAutocompleteSection,
  shouldRenderRecentSection,
  suggestionDisplaySuggestions,
  recentSearchesDisplay,
  recentlyViewedRestaurantsDisplay,
  recentlyViewedFoodsDisplay,
  hasRecentSearchesDisplay,
  hasRecentlyViewedRestaurantsDisplay,
  hasRecentlyViewedFoodsDisplay,
  isRecentLoadingDisplay,
  isRecentlyViewedLoadingDisplay,
  isRecentlyViewedFoodsLoadingDisplay,
  onSuggestionPress,
  onRecentSearchPress,
  onRecentlyViewedRestaurantPress,
  onRecentlyViewedFoodPress,
  onRecentViewMorePress,
  onRecentlyViewedMorePress,
  suggestionHeaderDividerAnimatedStyle,
}: SearchSuggestionSurfaceProps) => {
  return (
    <Reanimated.View
      pointerEvents="auto"
      style={[
        styles.searchSurface,
        searchSurfaceAnimatedStyle,
        {
          top: 0,
        },
      ]}
    >
      {!shouldDisableSearchBlur && <FrostedGlassBackground />}
      {shouldShowSuggestionSurface ? (
        <MaskedHoleOverlay
          holes={resolvedSuggestionHeaderHoles}
          backgroundColor="#ffffff"
          renderWhenEmpty
          style={[styles.searchSuggestionHeaderSurface, suggestionHeaderHeightAnimatedStyle]}
          pointerEvents="none"
        />
      ) : null}
      <Reanimated.ScrollView
        style={[
          styles.searchSurfaceScroll,
          suggestionPanelAnimatedStyle,
          shouldDriveSuggestionLayout
            ? [
                styles.searchSuggestionScrollSurface,
                suggestionScrollTopAnimatedStyle,
                suggestionScrollMaxHeightTarget ? suggestionScrollMaxHeightAnimatedStyle : null,
              ]
            : null,
        ]}
        contentContainerStyle={[
          styles.searchSurfaceContent,
          {
            paddingTop: shouldDriveSuggestionLayout ? 0 : searchLayoutTop + searchLayoutHeight + 8,
            paddingBottom: shouldDriveSuggestionLayout
              ? shouldHideBottomNav
                ? SEARCH_SUGGESTION_PANEL_PADDING_BOTTOM
                : navBarHeight + 16
              : bottomInset + 32,
            paddingHorizontal: shouldDriveSuggestionLayout ? CONTENT_HORIZONTAL_PADDING : 0,
            backgroundColor: 'transparent',
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScroll={onSuggestionScroll}
        scrollEventThrottle={16}
        onTouchStart={onSuggestionTouchStart}
        onContentSizeChange={onSuggestionContentSizeChange}
        onScrollBeginDrag={onSuggestionInteractionStart}
        onScrollEndDrag={onSuggestionInteractionEnd}
        onMomentumScrollEnd={onSuggestionInteractionEnd}
        scrollEnabled={Boolean(isSuggestionScreenActive && shouldRenderSuggestionPanel)}
        showsVerticalScrollIndicator={false}
      >
        {shouldRenderSuggestionPanel ? (
          <View style={styles.searchSuggestionScrollContent}>
            <View
              pointerEvents="none"
              style={[
                styles.searchSuggestionScrollBackground,
                {
                  left: -CONTENT_HORIZONTAL_PADDING,
                  right: -CONTENT_HORIZONTAL_PADDING,
                },
                { top: -SUGGESTION_SCROLL_WHITE_OVERSCROLL_BUFFER },
              ]}
            />
            <SearchSuggestions
              visible={shouldRenderSuggestionPanel}
              showAutocomplete={shouldRenderAutocompleteSection}
              showRecent={shouldRenderRecentSection}
              suggestions={suggestionDisplaySuggestions}
              recentSearches={recentSearchesDisplay}
              recentlyViewedRestaurants={recentlyViewedRestaurantsDisplay}
              recentlyViewedFoods={recentlyViewedFoodsDisplay}
              hasRecentSearches={hasRecentSearchesDisplay}
              hasRecentlyViewedRestaurants={hasRecentlyViewedRestaurantsDisplay}
              hasRecentlyViewedFoods={hasRecentlyViewedFoodsDisplay}
              isRecentLoading={isRecentLoadingDisplay}
              isRecentlyViewedLoading={isRecentlyViewedLoadingDisplay}
              isRecentlyViewedFoodsLoading={isRecentlyViewedFoodsLoadingDisplay}
              onSelectSuggestion={onSuggestionPress}
              onSelectRecent={onRecentSearchPress}
              onSelectRecentlyViewed={onRecentlyViewedRestaurantPress}
              onSelectRecentlyViewedFood={onRecentlyViewedFoodPress}
              onPressRecentViewMore={onRecentViewMorePress}
              onPressRecentlyViewedMore={onRecentlyViewedMorePress}
            />
          </View>
        ) : null}
      </Reanimated.ScrollView>
      {shouldShowSuggestionSurface ? (
        <Reanimated.View
          pointerEvents="none"
          style={[
            styles.searchSuggestionHeaderBottomSeparatorContainer,
            suggestionHeaderHeightAnimatedStyle,
          ]}
        >
          <Reanimated.View
            style={[
              styles.searchSuggestionHeaderBottomSeparator,
              suggestionHeaderDividerAnimatedStyle,
            ]}
          />
        </Reanimated.View>
      ) : null}
    </Reanimated.View>
  );
};

export default React.memo(SearchSuggestionSurface);
