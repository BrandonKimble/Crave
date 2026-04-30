import React from 'react';
import type { LayoutRectangle } from 'react-native';

import type {
  SearchForegroundHeaderSearchThisAreaInputs,
  SearchForegroundHeaderShortcutsInputs,
} from './search-foreground-chrome-contract';
import type { SearchChromeTouchSurfaceRuntime } from './search-chrome-touch-surface-contract';
import type { SearchRootStateFoundationLane } from './use-search-root-foundation-runtime';

const areLayoutRectanglesEqual = (
  left: LayoutRectangle | null,
  right: LayoutRectangle | null
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    Math.abs(left.x - right.x) < 0.5 &&
    Math.abs(left.y - right.y) < 0.5 &&
    Math.abs(left.width - right.width) < 0.5 &&
    Math.abs(left.height - right.height) < 0.5);

const cloneLayoutRectangle = (layout: LayoutRectangle): LayoutRectangle => ({
  x: layout.x,
  y: layout.y,
  width: layout.width,
  height: layout.height,
});

const resolveShortcutHitRegion = ({
  rowFrame,
  chipFrame,
}: {
  rowFrame: LayoutRectangle | null;
  chipFrame: LayoutRectangle | null;
}): LayoutRectangle | null => {
  if (
    rowFrame == null ||
    chipFrame == null ||
    rowFrame.width <= 0 ||
    rowFrame.height <= 0 ||
    chipFrame.width <= 0 ||
    chipFrame.height <= 0
  ) {
    return null;
  }

  return {
    x: rowFrame.x + chipFrame.x,
    y: rowFrame.y + chipFrame.y,
    width: chipFrame.width,
    height: chipFrame.height,
  };
};

const resolveSearchThisAreaHitRegion = ({
  top,
  buttonFrame,
}: {
  top: number;
  buttonFrame: LayoutRectangle | null;
}): LayoutRectangle | null => {
  if (buttonFrame == null || buttonFrame.width <= 0 || buttonFrame.height <= 0) {
    return null;
  }

  return {
    x: buttonFrame.x,
    y: top + buttonFrame.y,
    width: buttonFrame.width,
    height: buttonFrame.height,
  };
};

export const useSearchChromeTouchSurfaceGeometryRuntime = ({
  stateFoundationLane,
  shortcutsInputs,
  searchThisAreaInputs,
}: {
  stateFoundationLane: SearchRootStateFoundationLane;
  shortcutsInputs: SearchForegroundHeaderShortcutsInputs;
  searchThisAreaInputs: Omit<
    SearchForegroundHeaderSearchThisAreaInputs,
    'handleSearchThisAreaButtonLayout'
  >;
}): SearchChromeTouchSurfaceRuntime => {
  const suggestionRuntime = stateFoundationLane.rootSuggestionRuntime;
  const [searchThisAreaButtonFrame, setSearchThisAreaButtonFrame] =
    React.useState<LayoutRectangle | null>(null);

  const handleSearchThisAreaButtonLayout = React.useCallback((layout: LayoutRectangle) => {
    const nextLayout = cloneLayoutRectangle(layout);
    setSearchThisAreaButtonFrame((previousLayout) =>
      areLayoutRectanglesEqual(previousLayout, nextLayout) ? previousLayout : nextLayout
    );
  }, []);

  const restaurantsHitRegion = React.useMemo(
    () =>
      resolveShortcutHitRegion({
        rowFrame: suggestionRuntime.resolvedSearchShortcutsFrame,
        chipFrame: suggestionRuntime.resolvedSearchShortcutChipFrames.restaurants ?? null,
      }),
    [
      suggestionRuntime.resolvedSearchShortcutChipFrames,
      suggestionRuntime.resolvedSearchShortcutsFrame,
    ]
  );
  const dishesHitRegion = React.useMemo(
    () =>
      resolveShortcutHitRegion({
        rowFrame: suggestionRuntime.resolvedSearchShortcutsFrame,
        chipFrame: suggestionRuntime.resolvedSearchShortcutChipFrames.dishes ?? null,
      }),
    [
      suggestionRuntime.resolvedSearchShortcutChipFrames,
      suggestionRuntime.resolvedSearchShortcutsFrame,
    ]
  );
  const searchThisAreaHitRegion = React.useMemo(
    () =>
      resolveSearchThisAreaHitRegion({
        top: searchThisAreaInputs.searchThisAreaTop,
        buttonFrame: searchThisAreaButtonFrame,
      }),
    [searchThisAreaButtonFrame, searchThisAreaInputs.searchThisAreaTop]
  );

  return React.useMemo(
    () => ({
      shortcuts: {
        restaurants: {
          hitRegion: shortcutsInputs.shouldMountSearchShortcuts ? restaurantsHitRegion : null,
          enabled:
            shortcutsInputs.shouldMountSearchShortcuts &&
            shortcutsInputs.shouldEnableSearchShortcutsInteraction,
          onPress: shortcutsInputs.handleBestRestaurantsHere,
        },
        dishes: {
          hitRegion: shortcutsInputs.shouldMountSearchShortcuts ? dishesHitRegion : null,
          enabled:
            shortcutsInputs.shouldMountSearchShortcuts &&
            shortcutsInputs.shouldEnableSearchShortcutsInteraction,
          onPress: shortcutsInputs.handleBestDishesHere,
        },
      },
      searchThisArea: {
        hitRegion: searchThisAreaInputs.shouldShowSearchThisArea ? searchThisAreaHitRegion : null,
        enabled: searchThisAreaInputs.shouldShowSearchThisArea,
        onPress: searchThisAreaInputs.handleSearchThisArea,
      },
      handleSearchThisAreaButtonLayout,
    }),
    [
      dishesHitRegion,
      handleSearchThisAreaButtonLayout,
      restaurantsHitRegion,
      searchThisAreaHitRegion,
      searchThisAreaInputs.handleSearchThisArea,
      searchThisAreaInputs.shouldShowSearchThisArea,
      shortcutsInputs.handleBestDishesHere,
      shortcutsInputs.handleBestRestaurantsHere,
      shortcutsInputs.shouldEnableSearchShortcutsInteraction,
      shortcutsInputs.shouldMountSearchShortcuts,
    ]
  );
};
