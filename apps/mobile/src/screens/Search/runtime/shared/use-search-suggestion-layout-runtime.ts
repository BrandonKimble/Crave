import { useSearchSuggestionHeaderHolesRuntime } from './use-search-suggestion-header-holes-runtime';
import { useSearchSuggestionLayoutStateRuntime } from './use-search-suggestion-layout-state-runtime';
import { useSearchSuggestionLayoutVisualRuntime } from './use-search-suggestion-layout-visual-runtime';
import type {
  SearchSuggestionHeaderHolesRuntime,
  SearchSuggestionLayoutStateRuntime,
  SearchSuggestionLayoutRuntime,
  SearchSuggestionLayoutRuntimeArgs,
  SearchSuggestionLayoutVisualRuntime,
} from './use-search-suggestion-surface-runtime-contract';

export const useSearchSuggestionLayoutRuntime = ({
  ...args
}: SearchSuggestionLayoutRuntimeArgs): SearchSuggestionLayoutRuntime => {
  const stateRuntime: SearchSuggestionLayoutStateRuntime =
    useSearchSuggestionLayoutStateRuntime(args);
  const visualRuntime: SearchSuggestionLayoutVisualRuntime = useSearchSuggestionLayoutVisualRuntime(
    {
      isSuggestionPanelActive: args.isSuggestionPanelActive,
      isSuggestionPanelVisible: args.isSuggestionPanelVisible,
      shouldDriveSuggestionLayout: args.shouldDriveSuggestionLayout,
      shouldShowSuggestionBackground: args.shouldShowSuggestionBackground,
      searchLayout: stateRuntime.searchLayout,
      suggestionContentHeight: stateRuntime.suggestionContentHeight,
      shouldFreezeSuggestionHeader: stateRuntime.shouldFreezeSuggestionHeader,
      shouldIncludeShortcutLayout: stateRuntime.shouldIncludeShortcutLayout,
      resolvedSearchContainerFrame: stateRuntime.resolvedSearchContainerFrame,
      resolvedSearchShortcutsFrame: stateRuntime.resolvedSearchShortcutsFrame,
    }
  );
  const headerHolesRuntime: SearchSuggestionHeaderHolesRuntime =
    useSearchSuggestionHeaderHolesRuntime({
      shouldDriveSuggestionLayout: stateRuntime.shouldDriveSuggestionLayout,
      shouldFreezeSuggestionHeader: stateRuntime.shouldFreezeSuggestionHeader,
      shouldIncludeShortcutHoles: stateRuntime.shouldIncludeShortcutHoles,
      resolvedSearchContainerFrame: stateRuntime.resolvedSearchContainerFrame,
      resolvedSearchShortcutsFrame: stateRuntime.resolvedSearchShortcutsFrame,
      resolvedSearchShortcutChipFrames: stateRuntime.resolvedSearchShortcutChipFrames,
    });

  return {
    handleSuggestionContentSizeChange: stateRuntime.handleSuggestionContentSizeChange,
    searchLayout: stateRuntime.searchLayout,
    searchBarFrame: stateRuntime.searchBarFrame,
    handleSearchHeaderLayout: stateRuntime.handleSearchHeaderLayout,
    handleSearchContainerLayout: stateRuntime.handleSearchContainerLayout,
    handleSearchShortcutsRowLayout: stateRuntime.handleSearchShortcutsRowLayout,
    handleRestaurantsShortcutLayout: stateRuntime.handleRestaurantsShortcutLayout,
    handleDishesShortcutLayout: stateRuntime.handleDishesShortcutLayout,
    resetSearchHeaderFocusProgress: visualRuntime.resetSearchHeaderFocusProgress,
    searchHeaderFocusProgress: visualRuntime.searchHeaderFocusProgress,
    suggestionHeaderHeightAnimatedStyle: visualRuntime.suggestionHeaderHeightAnimatedStyle,
    suggestionScrollTopAnimatedStyle: visualRuntime.suggestionScrollTopAnimatedStyle,
    suggestionScrollMaxHeightAnimatedStyle: visualRuntime.suggestionScrollMaxHeightAnimatedStyle,
    suggestionHeaderDividerAnimatedStyle: visualRuntime.suggestionHeaderDividerAnimatedStyle,
    suggestionScrollHandler: visualRuntime.suggestionScrollHandler,
    resolvedSuggestionHeaderHoles: headerHolesRuntime.resolvedSuggestionHeaderHoles,
    suggestionTopFillHeight: visualRuntime.suggestionTopFillHeight,
    suggestionScrollMaxHeightTarget: visualRuntime.suggestionScrollMaxHeightTarget,
  };
};
