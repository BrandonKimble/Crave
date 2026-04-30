import type React from 'react';

import type { ResultsPresentationLog } from './results-presentation-runtime-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { AppRouteResultsSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-results-sheet-runtime-contract';
import type { SearchChromeScalarSurfacePresentationRuntime } from '../native/search-chrome-scalar-surface-presentation-runtime';
import type { ResultsPresentationPolicyFactsLaneChange } from './results-presentation-policy-facts-controller';
import {
  useResultsPresentationOwnerBridgeStateRuntime,
  type ResultsPresentationOwnerBridgeStateRuntime,
} from './use-results-presentation-owner-bridge-state-runtime';
import {
  useResultsPresentationOwnerShellStateRuntime,
  type ResultsPresentationOwnerShellStateRuntime,
} from './use-results-presentation-owner-shell-state-runtime';
import type { RunOneHandoffCoordinator } from '../controller/run-one-handoff-coordinator';

export type ResultsPresentationOwnerStateSessionRuntime = {
  bridgeStateRuntime: ResultsPresentationOwnerBridgeStateRuntime;
  shellStateRuntime: ResultsPresentationOwnerShellStateRuntime;
};

export const useResultsPresentationOwnerStateSessionRuntime = ({
  activeTab,
  setActiveTab,
  setActiveTabPreference,
  query,
  submittedQuery,
  hasActiveSearchContent,
  isSearchSessionActive,
  isSearchLoading,
  isSuggestionPanelActive,
  shouldRenderSearchOverlay,
  shouldEnableShortcutInteractions,
  resultsSheetRuntime,
  searchRuntimeBus,
  log,
  runOneHandoffCoordinatorRef,
  emitRuntimeMechanismEvent,
  onSearchSheetContentLaneChanged,
  searchChromeScalarSurfacePresentationRuntime,
}: {
  activeTab: 'dishes' | 'restaurants';
  setActiveTab: (next: 'dishes' | 'restaurants') => void;
  setActiveTabPreference: (next: 'dishes' | 'restaurants') => void;
  query: string;
  submittedQuery: string;
  hasActiveSearchContent: boolean;
  isSearchSessionActive: boolean;
  isSearchLoading: boolean;
  isSuggestionPanelActive: boolean;
  shouldRenderSearchOverlay: boolean;
  shouldEnableShortcutInteractions: boolean;
  resultsSheetRuntime: Pick<
    AppRouteResultsSheetRuntimeOwner,
    | 'sheetTranslateY'
    | 'snapPoints'
    | 'animateSheetTo'
    | 'prepareShortcutSheetTransition'
    | 'resultsSheetRuntimeModel'
    | 'shouldRenderResultsSheetRef'
    | 'resetResultsSheetToHidden'
  >;
  searchRuntimeBus: SearchRuntimeBus;
  log: ResultsPresentationLog;
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinator>;
  emitRuntimeMechanismEvent: (event: string, payload: Record<string, unknown>) => void;
  onSearchSheetContentLaneChanged?: (change: ResultsPresentationPolicyFactsLaneChange) => void;
  searchChromeScalarSurfacePresentationRuntime?: SearchChromeScalarSurfacePresentationRuntime;
}): ResultsPresentationOwnerStateSessionRuntime => {
  const bridgeStateRuntime = useResultsPresentationOwnerBridgeStateRuntime({
    activeTab,
    setActiveTab,
    setActiveTabPreference,
    isSearchSessionActive,
    searchRuntimeBus,
    log,
    runOneHandoffCoordinatorRef,
    emitRuntimeMechanismEvent,
  });

  const shellStateRuntime = useResultsPresentationOwnerShellStateRuntime({
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
    resultsSheetRuntime,
    searchChromeScalarSurfacePresentationRuntime,
  });

  return {
    bridgeStateRuntime,
    shellStateRuntime,
  };
};
