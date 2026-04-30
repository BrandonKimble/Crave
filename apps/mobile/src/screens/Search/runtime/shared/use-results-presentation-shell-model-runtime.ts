import React from 'react';

import { type SharedValue, useDerivedValue } from 'react-native-reanimated';

import {
  type SearchBackdropTarget,
  type SearchCloseTransitionState,
  type SearchHeaderChromeMode,
  type SearchInputMode,
  type SearchResultsShellModel,
  type SearchSheetContentLane,
} from './results-presentation-shell-contract';
import type { SearchChromeScalarSurfacePresentationRuntime } from '../native/search-chrome-scalar-surface-presentation-runtime';
import { resolveSearchHeaderVisualModel } from './results-presentation-shell-visual-runtime';

const clamp01 = (value: number): number => {
  'worklet';
  return Math.max(0, Math.min(1, value));
};

type UseResultsPresentationShellModelRuntimeArgs = {
  query: string;
  submittedQuery: string;
  isSuggestionPanelActive: boolean;
  shouldRenderSearchOverlay: boolean;
  shouldEnableShortcutInteractions: boolean;
  sheetY: SharedValue<number>;
  resultsSnapY: number;
  collapsedY: number;
  backdropTarget: SearchBackdropTarget;
  inputMode: SearchInputMode;
  displayQueryOverride: string;
  searchCloseTransitionState: SearchCloseTransitionState;
  searchSheetContentLane: SearchSheetContentLane;
  searchChromeScalarSurfacePresentationRuntime?: SearchChromeScalarSurfacePresentationRuntime;
};

export const useResultsPresentationShellModelRuntime = ({
  query,
  submittedQuery,
  isSuggestionPanelActive,
  shouldRenderSearchOverlay,
  shouldEnableShortcutInteractions,
  sheetY,
  resultsSnapY,
  collapsedY,
  backdropTarget,
  inputMode,
  displayQueryOverride,
  searchCloseTransitionState,
  searchSheetContentLane,
  searchChromeScalarSurfacePresentationRuntime,
}: UseResultsPresentationShellModelRuntimeArgs): SearchResultsShellModel => {
  const backgroundProgress = useDerivedValue(() => {
    const openY = Math.min(resultsSnapY, collapsedY - 1);
    const closedY = Math.max(collapsedY, openY + 1);
    const distance = Math.max(1, closedY - openY);
    return clamp01((closedY - sheetY.value) / distance);
  });

  const defaultChromeProgress = useDerivedValue(() => {
    if (inputMode === 'editing') {
      return 0;
    }
    return 1 - backgroundProgress.value;
  });

  const resultsDisplayQuery =
    query.trim().length > 0
      ? query
      : submittedQuery.trim().length > 0
      ? submittedQuery
      : displayQueryOverride;

  const chromeMode: SearchHeaderChromeMode =
    inputMode === 'editing' ? 'editing' : backdropTarget === 'results' ? 'results' : 'default';

  const headerVisualModel = React.useMemo(
    () =>
      resolveSearchHeaderVisualModel({
        chromeMode,
        query,
        resultsDisplayQuery,
        shouldRenderSearchOverlay,
        shouldEnableShortcutInteractions,
        isSuggestionPanelActive,
      }),
    [
      chromeMode,
      isSuggestionPanelActive,
      query,
      resultsDisplayQuery,
      shouldEnableShortcutInteractions,
      shouldRenderSearchOverlay,
    ]
  );

  searchChromeScalarSurfacePresentationRuntime?.syncShellPresentationScalars({
    shouldRenderSearchOverlay,
    headerShortcutsVisibleTarget: headerVisualModel.shortcutsVisibleTarget,
    headerShortcutsInteractive: headerVisualModel.shortcutsInteractive,
    backdropTarget,
  });

  return React.useMemo(
    () => ({
      backdropTarget,
      inputMode,
      defaultChromeProgress,
      headerVisualModel,
      searchSheetContentLane,
      isCloseTransitionActive: searchCloseTransitionState != null,
    }),
    [
      backdropTarget,
      defaultChromeProgress,
      headerVisualModel,
      inputMode,
      searchCloseTransitionState,
      searchSheetContentLane,
    ]
  );
};
