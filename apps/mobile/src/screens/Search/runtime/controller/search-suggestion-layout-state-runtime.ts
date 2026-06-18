import type {
  SearchLayout,
  SearchSuggestionLayoutStateRuntime,
} from '../shared/use-search-suggestion-surface-runtime-contract';

import type { LayoutRectangle } from 'react-native';

type SearchSuggestionLayoutStateRuntimeValue = SearchSuggestionLayoutStateRuntime;

export const createSearchSuggestionLayoutStateRuntimeValue = ({
  shouldDriveSuggestionLayout,
  handleSuggestionContentSizeChange,
  searchLayout,
  searchBarFrame,
  handleSearchHeaderLayout,
  handleSearchContainerLayout,
  handleSearchShortcutsRowLayout,
  handleRestaurantsShortcutLayout,
  handleDishesShortcutLayout,
  suggestionContentHeight,
  shouldFreezeSuggestionHeader,
  shouldIncludeShortcutHoles,
  shouldIncludeShortcutLayout,
  resolvedSearchContainerFrame,
  resolvedSearchShortcutsFrame,
  resolvedSearchShortcutChipFrames,
}: {
  shouldDriveSuggestionLayout: boolean;
  handleSuggestionContentSizeChange: (_width: number, height: number) => void;
  searchLayout: SearchLayout;
  searchBarFrame: LayoutRectangle | null;
  handleSearchHeaderLayout: (event: import('react-native').LayoutChangeEvent) => void;
  handleSearchContainerLayout: (event: import('react-native').LayoutChangeEvent) => void;
  handleSearchShortcutsRowLayout: (layout: LayoutRectangle) => void;
  handleRestaurantsShortcutLayout: (layout: LayoutRectangle) => void;
  handleDishesShortcutLayout: (layout: LayoutRectangle) => void;
  suggestionContentHeight: number;
  shouldFreezeSuggestionHeader: boolean;
  shouldIncludeShortcutHoles: boolean;
  shouldIncludeShortcutLayout: boolean;
  resolvedSearchContainerFrame: LayoutRectangle | null;
  resolvedSearchShortcutsFrame: LayoutRectangle | null;
  resolvedSearchShortcutChipFrames: Record<string, LayoutRectangle>;
}): SearchSuggestionLayoutStateRuntimeValue => ({
  shouldDriveSuggestionLayout,
  handleSuggestionContentSizeChange,
  searchLayout,
  searchBarFrame,
  handleSearchHeaderLayout,
  handleSearchContainerLayout,
  handleSearchShortcutsRowLayout,
  handleRestaurantsShortcutLayout,
  handleDishesShortcutLayout,
  suggestionContentHeight,
  shouldFreezeSuggestionHeader,
  shouldIncludeShortcutHoles,
  shouldIncludeShortcutLayout,
  resolvedSearchContainerFrame,
  resolvedSearchShortcutsFrame,
  resolvedSearchShortcutChipFrames,
});
