import React from 'react';

import { useResultsPresentationShellLocalState } from './use-results-presentation-shell-local-state';
import { useResultsPresentationShellModelRuntime } from './use-results-presentation-shell-model-runtime';
import type { AppRouteSharedSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-shared-sheet-runtime-contract';
import type { SearchChromeScalarSurfacePresentationRuntime } from '../native/search-chrome-scalar-surface-presentation-runtime';
import {
  createResultsPresentationPolicyFactsController,
  type ResultsPresentationPolicyFactsLaneChange,
  type ResultsPresentationPolicyFactsController,
} from './results-presentation-policy-facts-controller';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { RouteSceneSwitchAuthority } from './route-authority-contract';
import {
  areSearchSurfaceVisualPoliciesEqual,
  selectSearchSurfaceVisualPolicy,
  useSearchSurfaceRuntimeSelector,
} from '../surface/search-surface-runtime';

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
  resultsPresentationAuthority: ResultsPresentationAuthority;
  routeSceneSwitchAuthority: RouteSceneSwitchAuthority;
  onSearchSheetContentLaneChanged?: (change: ResultsPresentationPolicyFactsLaneChange) => void;
  searchChromeScalarSurfacePresentationRuntime?: SearchChromeScalarSurfacePresentationRuntime;
  resultsSheetRuntime: Pick<AppRouteSharedSheetRuntimeOwner, 'sheetTranslateY' | 'snapPoints'>;
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
  resultsPresentationAuthority,
  routeSceneSwitchAuthority,
  onSearchSheetContentLaneChanged,
  searchChromeScalarSurfacePresentationRuntime,
  resultsSheetRuntime,
}: UseResultsPresentationShellRuntimeArgs) => {
  const policyFactsControllerRef = React.useRef<ResultsPresentationPolicyFactsController | null>(
    null
  );
  if (policyFactsControllerRef.current == null) {
    policyFactsControllerRef.current = createResultsPresentationPolicyFactsController({
      policyFacts: resultsPresentationAuthority.readPolicyFactsSnapshot(
        searchRuntimeBus.getPolicyFactsSnapshot()
      ),
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
  void routeSceneSwitchAuthority;
  const surfaceVisualPolicy = useSearchSurfaceRuntimeSelector(
    selectSearchSurfaceVisualPolicy,
    areSearchSurfaceVisualPoliciesEqual
  );
  const policyFactsSnapshot = policyFactsControllerRef.current.updateShellFacts({
    hasActiveSearchContent,
    closeTransitionState: shellLocalState.searchCloseTransitionState,
    holdPersistentPollLane: shellLocalState.holdPersistentPollLane,
    surfaceVisualPolicy,
    policyFacts: resultsPresentationAuthority.readPolicyFactsSnapshot(
      searchRuntimeBus.getPolicyFactsSnapshot()
    ),
  });
  React.useLayoutEffect(() => {
    const laneChange =
      policyFactsControllerRef.current?.consumeSearchSheetContentLaneChange() ?? null;
    if (laneChange == null) {
      return;
    }
    onSearchSheetContentLaneChanged?.(laneChange);
  }, [onSearchSheetContentLaneChanged, policyFactsSnapshot]);

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
    isCloseTransitionActive: surfaceVisualPolicy.phase === 'results_dismissing',
    surfaceVisualPolicy,
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
