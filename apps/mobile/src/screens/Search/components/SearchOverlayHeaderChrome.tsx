import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  View,
  type LayoutChangeEvent,
  type LayoutRectangle,
  type TextInput,
} from 'react-native';
import Reanimated, { type SharedValue } from 'react-native-reanimated';

import { Text } from '../../../components';
import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../perf/perf-scenario-runtime-store';
import { ACTIVE_TAB_COLOR } from '../constants/search';
import styles from '../styles';
import SearchHeader from './SearchHeader';
import SearchShortcutsRow from './SearchShortcutsRow';
import type { SearchHeaderVisualModel } from '../runtime/shared/use-results-presentation-runtime-owner';

type SearchHeaderChromeModel = Pick<
  SearchHeaderVisualModel,
  'displayQuery' | 'chromeMode' | 'leadingIconMode' | 'trailingActionMode' | 'editable'
>;

type SearchOverlayHeaderChromeProps = {
  handleSearchContainerLayout: (event: LayoutChangeEvent) => void;
  headerVisualModel: SearchHeaderChromeModel;
  shouldShowAutocompleteSpinnerInBar: boolean;
  handleQueryChange: (value: string) => void;
  handleSubmit: () => void;
  handleSearchFocus: () => void;
  handleSearchBlur: () => void;
  handleClear: () => void;
  focusSearchInput: () => void;
  handleSearchBack: () => void;
  handleSearchHeaderLayout: (event: LayoutChangeEvent) => void;
  inputRef: React.RefObject<TextInput | null>;
  searchBarInputAnimatedStyle: React.ComponentProps<typeof SearchHeader>['inputAnimatedStyle'];
  searchBarContainerAnimatedStyle: React.ComponentProps<
    typeof SearchHeader
  >['containerAnimatedStyle'];
  isSuggestionScrollDismissing: boolean;
  searchHeaderFocusProgress: SharedValue<number>;
  searchShortcutsAnimatedStyle: React.ComponentProps<
    typeof SearchShortcutsRow
  >['containerAnimatedStyle'];
  searchShortcutChipAnimatedStyle: React.ComponentProps<
    typeof SearchShortcutsRow
  >['chipAnimatedStyle'];
  searchShortcutContentAnimatedStyle: React.ComponentProps<
    typeof SearchShortcutsRow
  >['contentAnimatedStyle'];
  shortcutsInteractionEnabledRef: React.RefObject<boolean>;
  handleBestRestaurantsHere: () => void;
  handleSearchShortcutsRowLayout: (layout: LayoutRectangle) => void;
  handleRestaurantsShortcutLayout: (layout: LayoutRectangle) => void;
  shouldShowSearchThisArea: boolean;
  searchThisAreaTop: number;
  searchThisAreaAnimatedStyle: React.ComponentProps<typeof Reanimated.View>['style'];
  handleSearchThisAreaButtonLayout: (layout: LayoutRectangle) => void;
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
  handleSearchBack,
  handleSearchHeaderLayout,
  inputRef,
  searchBarInputAnimatedStyle,
  searchBarContainerAnimatedStyle,
  isSuggestionScrollDismissing,
  searchHeaderFocusProgress,
  searchShortcutsAnimatedStyle,
  searchShortcutChipAnimatedStyle,
  searchShortcutContentAnimatedStyle,
  shortcutsInteractionEnabledRef,
  handleBestRestaurantsHere,
  handleSearchShortcutsRowLayout,
  handleRestaurantsShortcutLayout,
  shouldShowSearchThisArea,
  searchThisAreaTop,
  searchThisAreaAnimatedStyle,
  handleSearchThisAreaButtonLayout,
  handleSearchThisArea,
}: SearchOverlayHeaderChromeProps) => {
  const { t } = useTranslation();
  const activeScenarioConfig = usePerfScenarioRuntimeStore((state) => state.activeConfig);
  const searchThisAreaLayoutRef = React.useRef<LayoutRectangle | null>(null);
  const lastSearchThisAreaGeometryKeyRef = React.useRef<string | null>(null);
  const emitSearchThisAreaGeometryContract = React.useCallback(
    (layout: LayoutRectangle) => {
      if (!isPerfScenarioAttributionActive(activeScenarioConfig)) {
        return;
      }
      const buttonX = layout.x;
      const buttonY = searchThisAreaTop + layout.y;
      const buttonWidth = layout.width;
      const buttonHeight = layout.height;
      const hasUsableGeometry = buttonWidth >= 120 && buttonHeight >= 36 && buttonY > 0;
      const geometryKey = [
        activeScenarioConfig.runId,
        shouldShowSearchThisArea,
        Math.round(buttonX),
        Math.round(buttonY),
        Math.round(buttonWidth),
        Math.round(buttonHeight),
      ].join('|');
      if (lastSearchThisAreaGeometryKeyRef.current === geometryKey) {
        return;
      }
      lastSearchThisAreaGeometryKeyRef.current = geometryKey;
      logPerfScenarioAttributionEvent('VisualReadiness', activeScenarioConfig, {
        event: 'search_this_area_visibility_geometry_contract',
        source: 'react_layout',
        controlId: 'search_this_area',
        // F5705 — `visible` and `enabled` were the SAME identifier on consecutive lines,
        // so "rendered but inert" was unrepresentable in the telemetry. It is also
        // unrepresentable in the COMPONENT, which is why the second field is gone rather
        // than re-derived: the Reanimated.View below is always mounted and its
        // pointerEvents is a pure function of `shouldShowSearchThisArea`, the Pressable
        // has no disabled state, and no in-flight gate sits between them. One fact, one
        // field. `hasUsableGeometry` is the derived predicate here that CAN be false.
        visible: shouldShowSearchThisArea,
        buttonX,
        buttonY,
        buttonWidth,
        buttonHeight,
        searchThisAreaTop,
        hasUsableGeometry,
      });
    },
    [activeScenarioConfig, searchThisAreaTop, shouldShowSearchThisArea]
  );

  React.useEffect(() => {
    if (!shouldShowSearchThisArea) {
      lastSearchThisAreaGeometryKeyRef.current = null;
    }
  }, [shouldShowSearchThisArea]);

  React.useEffect(() => {
    if (!shouldShowSearchThisArea || searchThisAreaLayoutRef.current == null) {
      return;
    }
    emitSearchThisAreaGeometryContract(searchThisAreaLayoutRef.current);
  }, [emitSearchThisAreaGeometryContract, shouldShowSearchThisArea]);

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
          // Refit layer 2 zero-state (plans/suggest-ideal-shape.md): the
          // placeholder NAMES the accepted intents. K1 feel copy.
          placeholder={t('search.placeholder')}
          loading={shouldShowAutocompleteSpinnerInBar}
          onChangeText={handleQueryChange}
          onSubmit={handleSubmit}
          onFocus={handleSearchFocus}
          onBlur={handleSearchBlur}
          onClear={handleClear}
          onPress={headerVisualModel.editable ? focusSearchInput : undefined}
          onPressUp={headerVisualModel.editable ? focusSearchInput : undefined}
          accentColor={ACTIVE_TAB_COLOR}
          showBack={headerVisualModel.leadingIconMode === 'back'}
          onBackPress={handleSearchBack}
          onLayout={handleSearchHeaderLayout}
          inputRef={inputRef}
          inputAnimatedStyle={searchBarInputAnimatedStyle}
          containerAnimatedStyle={searchBarContainerAnimatedStyle}
          editable={headerVisualModel.editable && !isSuggestionScrollDismissing}
          inputFocusEnabled={headerVisualModel.chromeMode === 'editing'}
          showInactiveSearchIcon={headerVisualModel.leadingIconMode === 'search'}
          isSearchSessionActive={headerVisualModel.chromeMode === 'results'}
          focusProgress={searchHeaderFocusProgress}
          trailingActionMode={headerVisualModel.trailingActionMode}
        />
      </View>
      <SearchShortcutsRow
        containerAnimatedStyle={[styles.searchShortcutsRow, searchShortcutsAnimatedStyle]}
        chipAnimatedStyle={searchShortcutChipAnimatedStyle}
        contentAnimatedStyle={searchShortcutContentAnimatedStyle}
        interactionEnabledRef={shortcutsInteractionEnabledRef}
        onPressBestRestaurants={handleBestRestaurantsHere}
        onRowLayout={handleSearchShortcutsRowLayout}
        onRestaurantsChipLayout={handleRestaurantsShortcutLayout}
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
          testID="search-this-area-button"
          hitSlop={8}
          onLayout={({ nativeEvent: { layout } }) => {
            searchThisAreaLayoutRef.current = layout;
            handleSearchThisAreaButtonLayout(layout);
            emitSearchThisAreaGeometryContract(layout);
          }}
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
