import React from 'react';

import { useResultsPresentationShellLocalState } from './use-results-presentation-shell-local-state';
import { useResultsPresentationShellModelRuntime } from './use-results-presentation-shell-model-runtime';
import type { AppRouteResultsSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-results-sheet-runtime-contract';
import type { SearchChromeScalarSurfacePresentationRuntime } from '../native/search-chrome-scalar-surface-presentation-runtime';
import {
  createResultsPresentationPolicyFactsController,
  type ResultsPresentationPolicyFactsLaneChange,
  type ResultsPresentationPolicyFactsController,
} from './results-presentation-policy-facts-controller';
import type { SearchRuntimeBus } from './search-runtime-bus';

type UseResultsPresentationShellRuntimeArgs = {
  query: string;
  submittedQuery: string;
  hasActiveSearchContent: boolean;
  isSearchSessionActive: boolean;
  isSearchLoading: boolean;
  isSuggestionPanelActive: boolean;
  shouldRenderSearchOverlay: boolean;
  shouldEnableShortcutInteractions: boolean;
  searchRuntimeBus: SearchRuntimeBus;
  onSearchSheetContentLaneChanged?: (change: ResultsPresentationPolicyFactsLaneChange) => void;
  searchChromeScalarSurfacePresentationRuntime?: SearchChromeScalarSurfacePresentationRuntime;
  resultsSheetRuntime: Pick<AppRouteResultsSheetRuntimeOwner, 'sheetTranslateY' | 'snapPoints'>;
};

export const useResultsPresentationShellRuntime = ({
  query,
  submittedQuery,
  hasActiveSearchContent,
  isSearchSessionActive,
  isSearchLoading,
  isSuggestionPanelActive,
  shouldRenderSearchOverlay,
  shouldEnableShortcutInteractions,
  searchRuntimeBus,
  onSearchSheetContentLaneChanged,
  searchChromeScalarSurfacePresentationRuntime,
  resultsSheetRuntime,
}: UseResultsPresentationShellRuntimeArgs) => {
  const policyFactsControllerRef = React.useRef<ResultsPresentationPolicyFactsController | null>(
    null
  );
  if (policyFactsControllerRef.current == null) {
    policyFactsControllerRef.current = createResultsPresentationPolicyFactsController({
      onSearchSheetContentLaneChanged,
      policyFacts: searchRuntimeBus.getPolicyFactsSnapshot(),
    });
  }

  const shellLocalState = useResultsPresentationShellLocalState({
    query,
    submittedQuery,
    hasActiveSearchContent,
    isSearchSessionActive,
    isSearchLoading,
    isSuggestionPanelActive,
  });
  const policyFactsSnapshot = policyFactsControllerRef.current.updateShellFacts({
    hasActiveSearchContent,
    closeTransitionState: shellLocalState.searchCloseTransitionState,
    holdPersistentPollLane: shellLocalState.holdPersistentPollLane,
    policyFacts: searchRuntimeBus.getPolicyFactsSnapshot(),
  });

  const shellModel = useResultsPresentationShellModelRuntime({
    query,
    submittedQuery,
    isSuggestionPanelActive,
    shouldRenderSearchOverlay,
    shouldEnableShortcutInteractions,
    sheetY: resultsSheetRuntime.sheetTranslateY,
    resultsSnapY: resultsSheetRuntime.snapPoints.middle,
    collapsedY: resultsSheetRuntime.snapPoints.collapsed,
    backdropTarget: shellLocalState.backdropTarget,
    inputMode: shellLocalState.inputMode,
    displayQueryOverride: shellLocalState.displayQueryOverride,
    searchCloseTransitionState: shellLocalState.searchCloseTransitionState,
    searchSheetContentLane: policyFactsSnapshot.searchSheetContentLane,
    searchChromeScalarSurfacePresentationRuntime,
  });

  return {
    shellLocalState,
    shellModel,
    policyFactsController: policyFactsControllerRef.current,
    policyFactsSnapshot,
  };
};
