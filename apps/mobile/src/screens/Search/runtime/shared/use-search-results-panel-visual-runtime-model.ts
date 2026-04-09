import React from 'react';

import type { ResultsPanelVisualRuntimeModel } from './search-results-panel-runtime-contract';

type UseSearchResultsPanelVisualRuntimeModelArgs = ResultsPanelVisualRuntimeModel;

export const useSearchResultsPanelVisualRuntimeModel = ({
  resultsWashAnimatedStyle,
  resultsSheetVisibilityAnimatedStyle,
  shouldDisableResultsSheetInteraction,
  resultsScrollRef,
}: UseSearchResultsPanelVisualRuntimeModelArgs): ResultsPanelVisualRuntimeModel =>
  React.useMemo(
    () => ({
      resultsWashAnimatedStyle,
      resultsSheetVisibilityAnimatedStyle,
      shouldDisableResultsSheetInteraction,
      resultsScrollRef,
    }),
    [
      resultsScrollRef,
      resultsSheetVisibilityAnimatedStyle,
      resultsWashAnimatedStyle,
      shouldDisableResultsSheetInteraction,
    ]
  );
