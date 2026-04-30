import React from 'react';

import type { SearchForegroundHeaderSearchBarInteractionInputs } from './search-foreground-chrome-contract';
import type {
  SearchRootForegroundInputControlLane,
  SearchRootForegroundInteractionControlLane,
  SearchRootSuggestionInteractionControlLane,
} from './use-search-root-control-plane-runtime-contract';

export const useSearchRootOverlayHeaderSearchBarInteractionRuntime = ({
  foregroundInteractionControlLane,
  foregroundInputControlLane,
  suggestionInteractionControlLane,
}: {
  foregroundInteractionControlLane: SearchRootForegroundInteractionControlLane;
  foregroundInputControlLane: SearchRootForegroundInputControlLane;
  suggestionInteractionControlLane: SearchRootSuggestionInteractionControlLane;
}): SearchForegroundHeaderSearchBarInteractionInputs =>
  React.useMemo(
    () => ({
      handleQueryChange:
        foregroundInputControlLane.foregroundInputRuntime.handleQueryChange,
      handleSubmit:
        foregroundInteractionControlLane.foregroundInteractionRuntime.handleSubmit,
      handleSearchFocus:
        foregroundInteractionControlLane.foregroundInteractionRuntime
          .handleSearchFocus,
      handleSearchBlur:
        foregroundInteractionControlLane.foregroundInteractionRuntime
          .handleSearchBlur,
      handleClear:
        foregroundInteractionControlLane.foregroundInteractionRuntime.handleClear,
      focusSearchInput:
        foregroundInputControlLane.foregroundInputRuntime.focusSearchInput,
      handleSearchPressIn:
        foregroundInputControlLane.foregroundInputRuntime.handleSearchPressIn,
      handleSearchBack:
        foregroundInteractionControlLane.foregroundInteractionRuntime
          .handleSearchBack,
      inputRef:
        suggestionInteractionControlLane.suggestionInteractionRuntime.inputRef,
    }),
    [
      foregroundInputControlLane.foregroundInputRuntime.focusSearchInput,
      foregroundInputControlLane.foregroundInputRuntime.handleQueryChange,
      foregroundInputControlLane.foregroundInputRuntime.handleSearchPressIn,
      foregroundInteractionControlLane.foregroundInteractionRuntime.handleClear,
      foregroundInteractionControlLane.foregroundInteractionRuntime
        .handleSearchBack,
      foregroundInteractionControlLane.foregroundInteractionRuntime
        .handleSearchBlur,
      foregroundInteractionControlLane.foregroundInteractionRuntime
        .handleSearchFocus,
      foregroundInteractionControlLane.foregroundInteractionRuntime
        .handleSubmit,
      suggestionInteractionControlLane.suggestionInteractionRuntime.inputRef,
    ]
  );
