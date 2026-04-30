import type React from 'react';

import type { ResultsPresentationLog } from './results-presentation-runtime-contract';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { AppRouteResultsSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-results-sheet-runtime-contract';
import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import type { ArmSearchCloseRestoreOptions } from './results-presentation-shell-runtime-contract';
import {
  useResultsPresentationOwnerStateSessionRuntime,
  type ResultsPresentationOwnerStateSessionRuntime,
} from './use-results-presentation-owner-state-session-runtime';
import {
  useResultsPresentationOwnerStateTransitionRuntime,
  type ResultsPresentationOwnerStateTransitionRuntime,
} from './use-results-presentation-owner-state-transition-runtime';
import type { RunOneHandoffCoordinator } from '../controller/run-one-handoff-coordinator';
import type { SearchChromeScalarSurfacePresentationRuntime } from '../native/search-chrome-scalar-surface-presentation-runtime';
import type { ResultsPresentationPolicyFactsLaneChange } from './results-presentation-policy-facts-controller';

export type UseResultsPresentationOwnerStateRuntimeArgs<Suggestion> = {
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
    | 'sheetState'
  >;
  armSearchCloseRestore: (options?: ArmSearchCloseRestoreOptions) => boolean;
  commitSearchCloseRestore: () => boolean;
  cancelSearchCloseRestore: () => void;
  flushPendingSearchOriginRestore: () => boolean;
  requestDefaultPostSearchRestore: () => void;
  clearSearchState: () => void;
  cancelActiveSearchRequest: () => void;
  cancelAutocomplete: () => void;
  handleCancelPendingMutationWork: () => void;
  resetSubmitTransitionHold: () => void;
  setIsSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSuggestionPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
  setIsAutocompleteSuppressed: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSuggestions: React.Dispatch<React.SetStateAction<boolean>>;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSuggestions: React.Dispatch<React.SetStateAction<Suggestion[]>>;
  inputRef: React.RefObject<{ blur?: () => void } | null>;
  searchRuntimeBus: SearchRuntimeBus;
  log: ResultsPresentationLog;
  runOneHandoffCoordinatorRef: React.MutableRefObject<RunOneHandoffCoordinator>;
  emitRuntimeMechanismEvent: (event: string, payload: Record<string, unknown>) => void;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
  onSearchSheetContentLaneChanged?: (change: ResultsPresentationPolicyFactsLaneChange) => void;
  searchChromeScalarSurfacePresentationRuntime?: SearchChromeScalarSurfacePresentationRuntime;
};

export type ResultsPresentationOwnerStateRuntime = {
  bridgeStateRuntime: ResultsPresentationOwnerStateSessionRuntime['bridgeStateRuntime'];
  shellStateRuntime: ResultsPresentationOwnerStateSessionRuntime['shellStateRuntime'];
  closeTransitionRuntime: ResultsPresentationOwnerStateTransitionRuntime['closeTransitionRuntime'];
  resultsSheetExecutionModel: ResultsPresentationOwnerStateTransitionRuntime['resultsSheetExecutionModel'];
};

export const useResultsPresentationOwnerStateRuntime = <Suggestion>({
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
  armSearchCloseRestore,
  commitSearchCloseRestore,
  cancelSearchCloseRestore,
  flushPendingSearchOriginRestore,
  requestDefaultPostSearchRestore,
  clearSearchState,
  cancelActiveSearchRequest,
  cancelAutocomplete,
  handleCancelPendingMutationWork,
  resetSubmitTransitionHold,
  setIsSearchFocused,
  setIsSuggestionPanelActive,
  setIsAutocompleteSuppressed,
  setShowSuggestions,
  setQuery,
  setError,
  setSuggestions,
  inputRef,
  searchRuntimeBus,
  log,
  runOneHandoffCoordinatorRef,
  emitRuntimeMechanismEvent,
  routeSceneVisibilityPolicyRuntime,
  onSearchSheetContentLaneChanged,
  searchChromeScalarSurfacePresentationRuntime,
}: UseResultsPresentationOwnerStateRuntimeArgs<Suggestion>): ResultsPresentationOwnerStateRuntime => {
  const sessionRuntime = useResultsPresentationOwnerStateSessionRuntime({
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
  });

  const transitionRuntime = useResultsPresentationOwnerStateTransitionRuntime<Suggestion>({
    clearSearchState,
    armSearchCloseRestore,
    commitSearchCloseRestore,
    cancelSearchCloseRestore,
    flushPendingSearchOriginRestore,
    requestDefaultPostSearchRestore,
    cancelActiveSearchRequest,
    cancelAutocomplete,
    handleCancelPendingMutationWork,
    resetSubmitTransitionHold,
    setIsSearchFocused,
    setIsSuggestionPanelActive,
    setIsAutocompleteSuppressed,
    setShowSuggestions,
    setQuery,
    setError,
    setSuggestions,
    inputRef,
    resultsSheetRuntime,
    sessionRuntime,
    routeSceneVisibilityPolicyRuntime,
  });

  return {
    bridgeStateRuntime: sessionRuntime.bridgeStateRuntime,
    shellStateRuntime: sessionRuntime.shellStateRuntime,
    closeTransitionRuntime: transitionRuntime.closeTransitionRuntime,
    resultsSheetExecutionModel: transitionRuntime.resultsSheetExecutionModel,
  };
};
