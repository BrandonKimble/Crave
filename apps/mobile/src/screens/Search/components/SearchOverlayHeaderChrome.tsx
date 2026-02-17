import React from 'react';
import {
  Pressable,
  View,
  type LayoutChangeEvent,
  type LayoutRectangle,
  type TextInput,
} from 'react-native';
import Reanimated, { type SharedValue } from 'react-native-reanimated';

import { Text } from '../../../components';
import { ACTIVE_TAB_COLOR } from '../constants/search';
import styles from '../styles';
import SearchHeader from './SearchHeader';
import SearchShortcutsRow from './SearchShortcutsRow';

type SearchOverlayHeaderChromeProps = {
  handleSearchContainerLayout: (event: LayoutChangeEvent) => void;
  query: string;
  shouldShowAutocompleteSpinnerInBar: boolean;
  handleQueryChange: (value: string) => void;
  handleSubmit: () => void;
  handleSearchFocus: () => void;
  handleSearchBlur: () => void;
  handleClear: () => void;
  focusSearchInput: () => void;
  handleSearchPressIn: () => void;
  isSuggestionPanelActive: boolean;
  handleSearchBack: () => void;
  handleSearchHeaderLayout: (event: LayoutChangeEvent) => void;
  inputRef: React.RefObject<TextInput>;
  searchBarInputAnimatedStyle: React.ComponentProps<typeof SearchHeader>['inputAnimatedStyle'];
  searchBarContainerAnimatedStyle: React.ComponentProps<
    typeof SearchHeader
  >['containerAnimatedStyle'];
  isSuggestionScrollDismissing: boolean;
  isSearchSessionActive: boolean;
  searchHeaderFocusProgress: SharedValue<number>;
  shouldMountSearchShortcuts: boolean;
  shouldRenderSearchShortcuts: boolean;
  searchShortcutsAnimatedStyle: React.ComponentProps<
    typeof SearchShortcutsRow
  >['containerAnimatedStyle'];
  searchShortcutChipAnimatedStyle: React.ComponentProps<
    typeof SearchShortcutsRow
  >['chipAnimatedStyle'];
  searchShortcutContentAnimatedStyle: React.ComponentProps<
    typeof SearchShortcutsRow
  >['contentAnimatedStyle'];
  handleBestRestaurantsHere: () => void;
  handleBestDishesHere: () => void;
  handleSearchShortcutsRowLayout: (layout: LayoutRectangle) => void;
  handleRestaurantsShortcutLayout: (layout: LayoutRectangle) => void;
  handleDishesShortcutLayout: (layout: LayoutRectangle) => void;
  shouldShowSearchThisArea: boolean;
  searchThisAreaTop: number;
  searchThisAreaAnimatedStyle: React.ComponentProps<typeof Reanimated.View>['style'];
  handleSearchThisArea: () => void;
};

const SearchOverlayHeaderChrome = ({
  handleSearchContainerLayout,
  query,
  shouldShowAutocompleteSpinnerInBar,
  handleQueryChange,
  handleSubmit,
  handleSearchFocus,
  handleSearchBlur,
  handleClear,
  focusSearchInput,
  handleSearchPressIn,
  isSuggestionPanelActive,
  handleSearchBack,
  handleSearchHeaderLayout,
  inputRef,
  searchBarInputAnimatedStyle,
  searchBarContainerAnimatedStyle,
  isSuggestionScrollDismissing,
  isSearchSessionActive,
  searchHeaderFocusProgress,
  shouldMountSearchShortcuts,
  shouldRenderSearchShortcuts,
  searchShortcutsAnimatedStyle,
  searchShortcutChipAnimatedStyle,
  searchShortcutContentAnimatedStyle,
  handleBestRestaurantsHere,
  handleBestDishesHere,
  handleSearchShortcutsRowLayout,
  handleRestaurantsShortcutLayout,
  handleDishesShortcutLayout,
  shouldShowSearchThisArea,
  searchThisAreaTop,
  searchThisAreaAnimatedStyle,
  handleSearchThisArea,
}: SearchOverlayHeaderChromeProps) => {
  return (
    <>
      <View
        pointerEvents="box-none"
        style={styles.searchContainer}
        onLayout={handleSearchContainerLayout}
      >
        <SearchHeader
          value={query}
          placeholder="What are you craving?"
          loading={shouldShowAutocompleteSpinnerInBar}
          onChangeText={handleQueryChange}
          onSubmit={handleSubmit}
          onFocus={handleSearchFocus}
          onBlur={handleSearchBlur}
          onClear={handleClear}
          onPress={focusSearchInput}
          onPressIn={handleSearchPressIn}
          onInputTouchStart={handleSearchPressIn}
          accentColor={ACTIVE_TAB_COLOR}
          showBack={Boolean(isSuggestionPanelActive)}
          onBackPress={handleSearchBack}
          onLayout={handleSearchHeaderLayout}
          inputRef={inputRef}
          inputAnimatedStyle={searchBarInputAnimatedStyle}
          containerAnimatedStyle={searchBarContainerAnimatedStyle}
          editable={!isSuggestionScrollDismissing}
          showInactiveSearchIcon={!isSuggestionPanelActive && !isSearchSessionActive}
          isSearchSessionActive={isSearchSessionActive && !isSuggestionPanelActive}
          focusProgress={searchHeaderFocusProgress}
        />
      </View>
      <SearchShortcutsRow
        visible={shouldMountSearchShortcuts}
        interactive={shouldRenderSearchShortcuts}
        containerAnimatedStyle={[styles.searchShortcutsRow, searchShortcutsAnimatedStyle]}
        chipAnimatedStyle={searchShortcutChipAnimatedStyle}
        contentAnimatedStyle={searchShortcutContentAnimatedStyle}
        onPressBestRestaurants={handleBestRestaurantsHere}
        onPressBestDishes={handleBestDishesHere}
        onRowLayout={handleSearchShortcutsRowLayout}
        onRestaurantsChipLayout={handleRestaurantsShortcutLayout}
        onDishesChipLayout={handleDishesShortcutLayout}
      />
      <Reanimated.View
        pointerEvents={shouldShowSearchThisArea ? 'box-none' : 'none'}
        style={[
          styles.searchThisAreaContainer,
          { top: searchThisAreaTop },
          searchThisAreaAnimatedStyle,
        ]}
      >
        <Pressable
          onPress={handleSearchThisArea}
          style={styles.searchThisAreaButton}
          accessibilityRole="button"
          accessibilityLabel="Search this area"
          hitSlop={8}
        >
          <Text variant="subtitle" weight="semibold" style={styles.searchThisAreaText}>
            Search this area
          </Text>
        </Pressable>
      </Reanimated.View>
    </>
  );
};

export default React.memo(SearchOverlayHeaderChrome);
