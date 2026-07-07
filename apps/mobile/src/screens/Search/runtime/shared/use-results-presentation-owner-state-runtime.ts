import type React from 'react';

import type { ResultsPresentationLog } from './results-presentation-runtime-contract';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchMapSourceFramePort } from '../map/search-map-source-frame-port';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { AppRouteSharedSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-shared-sheet-runtime-contract';
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
import type { SearchSurfaceRedrawCoordinator } from '../controller/search-surface-redraw-coordinator';
import type { SearchChromeScalarSurfacePresentationRuntime } from '../native/search-chrome-scalar-surface-presentation-runtime';
import type { ResultsPresentationPolicyFactsLaneChange } from './results-presentation-policy-facts-controller';
import type { RouteSceneSwitchAuthority } from './route-authority-contract';

export type UseResultsPresentationOwnerStateRuntimeArgs<Suggestion> = {
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
    AppRouteSharedSheetRuntimeOwner,
    | 'sheetTranslateY'
    | 'snapPoints'
    | 'prepareSharedSheetForSearchPresentation'
    | 'sharedSheetRuntimeModel'
    | 'shouldRenderMountedSharedSheetRef'
    | 'markSharedSheetHidden'
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
  resultsPresentationAuthority: ResultsPresentationAuthority;
  routeSceneSwitchAuthority: RouteSceneSwitchAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  searchMapSourceFramePort: SearchMapSourceFramePort;
  log: ResultsPresentationLog;
  searchSurfaceRedrawCoordinatorRef: React.MutableRefObject<SearchSurfaceRedrawCoordinator>;
  emitRuntimeMechanismEvent: (event: string, payload: Record<string, unknown>) => void;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
  onSearchSheetContentLaneChanged?: (change: ResultsPresentationPolicyFactsLaneChange) => void;
  searchChromeScalarSurfacePresentationRuntime?: SearchChromeScalarSurfacePresentationRuntime;
};

export type ResultsPresentationOwnerStateRuntime = {
  bridgeStateRuntime: ResultsPresentationOwnerStateSessionRuntime['bridgeStateRuntime'];
  shellStateRuntime: ResultsPresentationOwnerStateSessionRuntime['shellStateRuntime'];
  closeTransitionRuntime: ResultsPresentationOwnerStateTransitionRuntime['closeTransitionRuntime'];
};

export const useResultsPresentationOwnerStateRuntime = <Suggestion>({
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
  resultsPresentationAuthority,
  routeSceneSwitchAuthority,
  resultsPresentationSurfaceAuthority,
  searchMapSourceFramePort,
  log,
  searchSurfaceRedrawCoordinatorRef,
  emitRuntimeMechanismEvent,
  routeSceneVisibilityPolicyRuntime,
  onSearchSheetContentLaneChanged,
  searchChromeScalarSurfacePresentationRuntime,
}: UseResultsPresentationOwnerStateRuntimeArgs<Suggestion>): ResultsPresentationOwnerStateRuntime => {
  const sessionRuntime = useResultsPresentationOwnerStateSessionRuntime({
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
    resultsPresentationAuthority,
    routeSceneSwitchAuthority,
    resultsPresentationSurfaceAuthority,
    searchMapSourceFramePort,
    log,
    searchSurfaceRedrawCoordinatorRef,
    emitRuntimeMechanismEvent,
    onSearchSheetContentLaneChanged,
    searchChromeScalarSurfacePresentationRuntime,
  });

  const transitionRuntime = useResultsPresentationOwnerStateTransitionRuntime<Suggestion>({
    searchRuntimeBus,
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
    sessionRuntime,
    routeSceneVisibilityPolicyRuntime,
  });

  return {
    bridgeStateRuntime: sessionRuntime.bridgeStateRuntime,
    shellStateRuntime: sessionRuntime.shellStateRuntime,
    closeTransitionRuntime: transitionRuntime.closeTransitionRuntime,
  };
};
