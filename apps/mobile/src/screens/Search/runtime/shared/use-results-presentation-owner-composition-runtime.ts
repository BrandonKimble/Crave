import type React from 'react';

import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import type { ResultsPresentationLog } from './results-presentation-runtime-contract';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchMapSourceFramePort } from '../map/search-map-source-frame-port';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { ResultsPresentationOwner } from './results-presentation-owner-contract';
import type { AppRouteResultsSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-results-sheet-runtime-contract';
import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import type { ArmSearchCloseRestoreOptions } from './results-presentation-shell-runtime-contract';
import type { SearchSurfaceRedrawCoordinator } from '../controller/search-surface-redraw-coordinator';
import type { SearchChromeScalarSurfacePresentationRuntime } from '../native/search-chrome-scalar-surface-presentation-runtime';
import type { ResultsPresentationPolicyFactsLaneChange } from './results-presentation-policy-facts-controller';
import type { RouteSceneSwitchAuthority } from './route-authority-contract';
import { useResultsPresentationOwnerStateRuntime } from './use-results-presentation-owner-state-runtime';
import { useResultsPresentationOwnerPublicationRuntime } from './use-results-presentation-owner-publication-runtime';

export type UseResultsPresentationOwnerCompositionRuntimeArgs<Suggestion> = {
  activeTab: 'dishes' | 'restaurants';
  setActiveTab: (next: 'dishes' | 'restaurants') => void;
  setActiveTabPreference: (next: 'dishes' | 'restaurants') => void;
  clearTypedQuery: SearchClearOwner['clearTypedQuery'];
  clearSearchState: SearchClearOwner['clearSearchState'];
  query: string;
  submittedQuery: string;
  hasActiveSearchContent: boolean;
  isSearchSessionActive: boolean;
  hasResults: boolean;
  profilePresentationActiveRef: React.MutableRefObject<boolean>;
  prepareRestaurantProfileForTerminalSearchDismissRef: React.MutableRefObject<() => void>;
  isSearchLoading: boolean;
  isSuggestionPanelActive: boolean;
  shouldRenderSearchOverlay: boolean;
  shouldEnableShortcutInteractions: boolean;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  isClearingSearchRef: React.MutableRefObject<boolean>;
  resultsSheetRuntime: Pick<
    AppRouteResultsSheetRuntimeOwner,
    | 'sheetTranslateY'
    | 'snapPoints'
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
  requestDefaultPostSearchRestore: (options?: { mode?: 'full' | 'chrome-only' }) => void;
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

export const useResultsPresentationOwnerCompositionRuntime = <Suggestion>({
  activeTab,
  setActiveTab,
  setActiveTabPreference,
  clearTypedQuery,
  clearSearchState,
  query,
  submittedQuery,
  hasActiveSearchContent,
  isSearchSessionActive,
  hasResults,
  profilePresentationActiveRef,
  prepareRestaurantProfileForTerminalSearchDismissRef,
  isSearchLoading,
  isSuggestionPanelActive,
  shouldRenderSearchOverlay,
  shouldEnableShortcutInteractions,
  ignoreNextSearchBlurRef,
  isClearingSearchRef,
  resultsSheetRuntime,
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
}: UseResultsPresentationOwnerCompositionRuntimeArgs<Suggestion>): ResultsPresentationOwner => {
  const ownerStateRuntime = useResultsPresentationOwnerStateRuntime({
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
  });

  return useResultsPresentationOwnerPublicationRuntime({
    clearTypedQuery,
    submittedQuery,
    isSearchSessionActive,
    hasResults,
    profilePresentationActiveRef,
    prepareRestaurantProfileForTerminalSearchDismissRef,
    ignoreNextSearchBlurRef,
    isClearingSearchRef,
    resultsSheetRuntime,
    routeSceneVisibilityPolicyRuntime,
    ownerStateRuntime,
  });
};
