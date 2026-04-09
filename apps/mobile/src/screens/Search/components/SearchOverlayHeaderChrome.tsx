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
import type { SearchHeaderVisualModel } from '../runtime/shared/use-results-presentation-runtime-owner';

type SearchOverlayHeaderChromeProps = {
  handleSearchContainerLayout: (event: LayoutChangeEvent) => void;
  headerVisualModel: SearchHeaderVisualModel;
  shouldShowAutocompleteSpinnerInBar: boolean;
  handleQueryChange: (value: string) => void;
  handleSubmit: () => void;
  handleSearchFocus: () => void;
  handleSearchBlur: () => void;
  handleClear: () => void;
  focusSearchInput: () => void;
  handleSearchPressIn: () => void;
  handleSearchBack: () => void;
  handleSearchHeaderLayout: (event: LayoutChangeEvent) => void;
  inputRef: React.RefObject<TextInput | null>;
  searchBarInputAnimatedStyle: React.ComponentProps<typeof SearchHeader>['inputAnimatedStyle'];
  searchBarContainerAnimatedStyle: React.ComponentProps<
    typeof SearchHeader
  >['containerAnimatedStyle'];
  isSuggestionScrollDismissing: boolean;
  searchHeaderFocusProgress: SharedValue<number>;
  shouldMountSearchShortcuts: boolean;
  shouldEnableSearchShortcutsInteraction: boolean;
  searchShortcutsAnimatedStyle: React.ComponentProps<
    typeof SearchShortcutsRow
  >['containerAnimatedStyle'];
  searchShortcutChipAnimatedStyle: React.ComponentProps<
    typeof SearchShortcutsRow
  >['chipAnimatedStyle'];
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
  headerVisualModel,
  shouldShowAutocompleteSpinnerInBar,
  handleQueryChange,
  handleSubmit,
  handleSearchFocus,
  handleSearchBlur,
  handleClear,
  focusSearchInput,
  handleSearchPressIn,
  handleSearchBack,
  handleSearchHeaderLayout,
  inputRef,
  searchBarInputAnimatedStyle,
  searchBarContainerAnimatedStyle,
  isSuggestionScrollDismissing,
  searchHeaderFocusProgress,
  shouldMountSearchShortcuts,
  shouldEnableSearchShortcutsInteraction,
  searchShortcutsAnimatedStyle,
  searchShortcutChipAnimatedStyle,
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
          value={headerVisualModel.displayQuery}
          displayValue={headerVisualModel.displayQuery}
          placeholder="What are you craving?"
          loading={shouldShowAutocompleteSpinnerInBar}
          onChangeText={handleQueryChange}
          onSubmit={handleSubmit}
          onFocus={handleSearchFocus}
          onBlur={handleSearchBlur}
          onClear={handleClear}
          onPress={headerVisualModel.editable ? focusSearchInput : undefined}
          onPressIn={headerVisualModel.editable ? handleSearchPressIn : undefined}
          onInputTouchStart={headerVisualModel.editable ? handleSearchPressIn : undefined}
          accentColor={ACTIVE_TAB_COLOR}
          showBack={headerVisualModel.leadingIconMode === 'back'}
          onBackPress={handleSearchBack}
          onLayout={handleSearchHeaderLayout}
          inputRef={inputRef}
          inputAnimatedStyle={searchBarInputAnimatedStyle}
          containerAnimatedStyle={searchBarContainerAnimatedStyle}
          editable={headerVisualModel.editable && !isSuggestionScrollDismissing}
          showInactiveSearchIcon={headerVisualModel.leadingIconMode === 'search'}
          isSearchSessionActive={headerVisualModel.chromeMode === 'results'}
          focusProgress={searchHeaderFocusProgress}
          trailingActionMode={headerVisualModel.trailingActionMode}
        />
      </View>
      <SearchShortcutsRow
        visible={shouldMountSearchShortcuts}
        interactive={shouldEnableSearchShortcutsInteraction}
        containerAnimatedStyle={[styles.searchShortcutsRow, searchShortcutsAnimatedStyle]}
        chipAnimatedStyle={searchShortcutChipAnimatedStyle}
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
