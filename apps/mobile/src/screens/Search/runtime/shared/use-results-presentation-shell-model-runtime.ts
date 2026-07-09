import React from 'react';

import { type SharedValue, useDerivedValue } from 'react-native-reanimated';

import {
  isPerfScenarioAttributionActive,
  logPerfScenarioAttributionEvent,
} from '../../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../../perf/perf-scenario-runtime-store';
import {
  type SearchBackdropTarget,
  type SearchHeaderChromeMode,
  type SearchInputMode,
  type SearchResultsShellModel,
  type SearchSheetContentLane,
} from './results-presentation-shell-contract';
import type { SearchSurfaceVisualPolicySnapshot } from '../surface/search-surface-runtime';
import type { SearchChromeScalarSurfacePresentationRuntime } from '../native/search-chrome-scalar-surface-presentation-runtime';
import { resolveSearchHeaderVisualModel } from './results-presentation-shell-visual-runtime';
import { resolveShortcutToggleDisplayQuery } from './shortcut-toggle-display-query';

const clamp01 = (value: number): number => {
  'worklet';
  return Math.max(0, Math.min(1, value));
};

type UseResultsPresentationShellModelRuntimeArgs = {
  query: string;
  submittedQuery: string;
  // Shortcut toggle title swap (display-only): the current search mode + the optimistic tab
  // (the desired tab, tuple.tab) so a shortcut search's bar text flips to the sibling
  // shortcut label on toggle press-up.
  searchMode: string | null;
  optimisticActiveTab: 'dishes' | 'restaurants';
  isSuggestionPanelActive: boolean;
  shouldRenderSearchOverlay: boolean;
  shouldEnableShortcutInteractions: boolean;
  sheetY: SharedValue<number>;
  resultsSnapY: number;
  collapsedY: number;
  backdropTarget: SearchBackdropTarget;
  inputMode: SearchInputMode;
  displayQueryOverride: string;
  isCloseTransitionActive: boolean;
  surfaceVisualPolicy: SearchSurfaceVisualPolicySnapshot;
  searchSheetContentLane: SearchSheetContentLane;
  searchChromeScalarSurfacePresentationRuntime?: SearchChromeScalarSurfacePresentationRuntime;
};

export const useResultsPresentationShellModelRuntime = ({
  query,
  submittedQuery,
  searchMode,
  optimisticActiveTab,
  isSuggestionPanelActive,
  shouldRenderSearchOverlay,
  shouldEnableShortcutInteractions,
  sheetY,
  resultsSnapY,
  collapsedY,
  backdropTarget,
  inputMode,
  displayQueryOverride,
  isCloseTransitionActive,
  surfaceVisualPolicy,
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

  const resultsDisplayQuery = resolveShortcutToggleDisplayQuery({
    displayQuery:
      query.trim().length > 0
        ? query
        : submittedQuery.trim().length > 0
          ? submittedQuery
          : displayQueryOverride,
    searchMode,
    optimisticActiveTab,
  });

  const lastResultsDisplayQueryRef = React.useRef('');
  if (resultsDisplayQuery.trim().length > 0) {
    lastResultsDisplayQueryRef.current = resultsDisplayQuery;
  }
  const surfaceDismissOwnsHeader =
    surfaceVisualPolicy.phase === 'results_dismissing' ||
    searchSheetContentLane.kind === 'results_closing';
  const effectiveBackdropTarget: SearchBackdropTarget =
    inputMode === 'editing'
      ? backdropTarget
      : surfaceDismissOwnsHeader
        ? 'default'
        : backdropTarget;

  const shouldRetainResultsDisplayQuery =
    effectiveBackdropTarget === 'results' &&
    resultsDisplayQuery.trim().length === 0 &&
    lastResultsDisplayQueryRef.current.trim().length > 0;
  const effectiveResultsDisplayQuery = shouldRetainResultsDisplayQuery
    ? lastResultsDisplayQueryRef.current
    : resultsDisplayQuery;
  const chromeMode: SearchHeaderChromeMode =
    inputMode === 'editing'
      ? 'editing'
      : effectiveBackdropTarget === 'results'
        ? 'results'
        : 'default';

  const headerVisualModel = React.useMemo(
    () =>
      resolveSearchHeaderVisualModel({
        chromeMode,
        query,
        resultsDisplayQuery: effectiveResultsDisplayQuery,
        shouldRenderSearchOverlay,
        shouldEnableShortcutInteractions,
        isSuggestionPanelActive,
        isCloseTransitionActive,
      }),
    [
      chromeMode,
      effectiveResultsDisplayQuery,
      isSuggestionPanelActive,
      isCloseTransitionActive,
      query,
      shouldEnableShortcutInteractions,
      shouldRenderSearchOverlay,
    ]
  );
  const activeScenarioConfig = usePerfScenarioRuntimeStore((state) => state.activeConfig);
  React.useEffect(() => {
    if (!isPerfScenarioAttributionActive(activeScenarioConfig)) {
      return;
    }
    logPerfScenarioAttributionEvent('VisualReadiness', activeScenarioConfig, {
      event: 'search_header_visual_contract',
      backdropTarget: effectiveBackdropTarget,
      bottomBandOwner: surfaceVisualPolicy.bottomBandOwner,
      canAdmitResultsBody: surfaceVisualPolicy.canAdmitResultsBody,
      canExposePersistentPolls: surfaceVisualPolicy.canExposePersistentPolls,
      canReleasePersistentPolls: surfaceVisualPolicy.canReleasePersistentPolls,
      chromeMode,
      displayQuery: headerVisualModel.displayQuery,
      isCloseTransitionActive,
      searchSheetContentLaneKind: searchSheetContentLane.kind,
      searchSurfacePhase: surfaceVisualPolicy.phase,
      shouldHoldResultsHeader: surfaceVisualPolicy.shouldHoldResultsHeader,
      shouldRetainResultsDisplayQuery,
      rawBackdropTarget: backdropTarget,
      shouldHoldSearchDisplayForPollRestore:
        surfaceVisualPolicy.shouldHoldSearchDisplayForPollRestore,
      sheetClipMode: surfaceVisualPolicy.sheetClipMode,
      shortcutsInteractive: headerVisualModel.shortcutsInteractive,
      shortcutsVisibleTarget: headerVisualModel.shortcutsVisibleTarget,
      transactionId: surfaceVisualPolicy.transactionId,
    });
  }, [
    activeScenarioConfig,
    backdropTarget,
    chromeMode,
    effectiveBackdropTarget,
    headerVisualModel.displayQuery,
    headerVisualModel.shortcutsInteractive,
    headerVisualModel.shortcutsVisibleTarget,
    isCloseTransitionActive,
    searchSheetContentLane.kind,
    shouldRetainResultsDisplayQuery,
    surfaceVisualPolicy.bottomBandOwner,
    surfaceVisualPolicy.canAdmitResultsBody,
    surfaceVisualPolicy.canExposePersistentPolls,
    surfaceVisualPolicy.canReleasePersistentPolls,
    surfaceVisualPolicy.phase,
    surfaceVisualPolicy.shouldHoldResultsHeader,
    surfaceVisualPolicy.shouldHoldSearchDisplayForPollRestore,
    surfaceVisualPolicy.sheetClipMode,
    surfaceVisualPolicy.transactionId,
  ]);

  searchChromeScalarSurfacePresentationRuntime?.syncShellPresentationScalars({
    shouldRenderSearchOverlay,
    headerShortcutsVisibleTarget: headerVisualModel.shortcutsVisibleTarget,
    headerShortcutsInteractive: headerVisualModel.shortcutsInteractive,
    backdropTarget: effectiveBackdropTarget,
  });

  return React.useMemo(
    () => ({
      backdropTarget: effectiveBackdropTarget,
      inputMode,
      defaultChromeProgress,
      headerVisualModel,
      searchSheetContentLane,
      isCloseTransitionActive,
    }),
    [
      defaultChromeProgress,
      effectiveBackdropTarget,
      headerVisualModel,
      inputMode,
      isCloseTransitionActive,
      searchSheetContentLane,
    ]
  );
};
