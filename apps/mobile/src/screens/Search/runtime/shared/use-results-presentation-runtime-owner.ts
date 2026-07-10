import React from 'react';

import type { SearchClearOwner } from '../../hooks/use-search-clear-owner';
import { type ResultsPresentationLog } from './results-presentation-runtime-contract';
import { type ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchMapSourceFramePort } from '../map/search-map-source-frame-port';
import { type SearchRuntimeBus } from './search-runtime-bus';
import { type ResultsPresentationOwner } from './results-presentation-owner-contract';
import type { AppRouteSharedSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-shared-sheet-runtime-contract';
import type { RouteSceneVisibilityPolicyRuntime } from '../../../../navigation/runtime/app-route-scene-visibility-policy-contract';
import type { SearchChromeScalarSurfacePresentationRuntime } from '../native/search-chrome-scalar-surface-presentation-runtime';
import type { ResultsPresentationPolicyFactsLaneChange } from './results-presentation-policy-facts-controller';
import { useResultsPresentationOwnerCompositionRuntime } from './use-results-presentation-owner-composition-runtime';
import type { RouteSceneSwitchAuthority } from './route-authority-contract';
export type {
  ResultsInteractionModel,
  ResultsPresentationOwner,
} from './results-presentation-owner-contract';
export type {
  MarkerEnterSettledPayload,
  ResultsPresentationRuntimeOwner,
} from './results-presentation-runtime-owner-contract';
export type {
  SearchHeaderVisualModel,
  SearchResultsShellModel,
} from './results-presentation-shell-contract';
import type { SearchSurfaceRedrawCoordinator } from '../controller/search-surface-redraw-coordinator';

export type UseResultsPresentationOwnerArgs<Suggestion> = {
  setActiveTab: (next: 'dishes' | 'restaurants') => void;
  setActiveTabPreference: (next: 'dishes' | 'restaurants') => void;
  clearTypedQuery: SearchClearOwner['clearTypedQuery'];
  clearSearchState: SearchClearOwner['clearSearchState'];
  query: string;
  submittedQuery: string;
  hasActiveSearchContent: boolean;
  isSearchSessionActive: boolean;
  hasResults: boolean;
  isSearchLoading: boolean;
  isSuggestionPanelActive: boolean;
  shouldRenderSearchOverlay: boolean;
  shouldEnableShortcutInteractions: boolean;
  ignoreNextSearchBlurRef: React.MutableRefObject<boolean>;
  isClearingSearchRef: React.MutableRefObject<boolean>;
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

export const useResultsPresentationOwner = <Suggestion>({
  setActiveTab,
  setActiveTabPreference,
  clearTypedQuery,
  clearSearchState,
  query,
  submittedQuery,
  hasActiveSearchContent,
  isSearchSessionActive,
  hasResults,
  isSearchLoading,
  isSuggestionPanelActive,
  shouldRenderSearchOverlay,
  shouldEnableShortcutInteractions,
  ignoreNextSearchBlurRef,
  isClearingSearchRef,
  resultsSheetRuntime,
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
}: UseResultsPresentationOwnerArgs<Suggestion>): ResultsPresentationOwner => {
  return useResultsPresentationOwnerCompositionRuntime({
    setActiveTab,
    setActiveTabPreference,
    clearTypedQuery,
    clearSearchState,
    query,
    submittedQuery,
    hasActiveSearchContent,
    isSearchSessionActive,
    hasResults,
    isSearchLoading,
    isSuggestionPanelActive,
    shouldRenderSearchOverlay,
    shouldEnableShortcutInteractions,
    ignoreNextSearchBlurRef,
    isClearingSearchRef,
    resultsSheetRuntime,
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
};
