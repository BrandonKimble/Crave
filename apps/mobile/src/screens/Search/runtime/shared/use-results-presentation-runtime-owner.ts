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

export type UseResultsPresentationOwnerArgs = {
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
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  routeSceneSwitchAuthority: RouteSceneSwitchAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  searchMapSourceFramePort: SearchMapSourceFramePort;
  log: ResultsPresentationLog;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
  onSearchSheetContentLaneChanged?: (change: ResultsPresentationPolicyFactsLaneChange) => void;
};

export const useResultsPresentationOwner = ({
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
  searchRuntimeBus,
  resultsPresentationAuthority,
  routeSceneSwitchAuthority,
  resultsPresentationSurfaceAuthority,
  searchMapSourceFramePort,
  log,
  routeSceneVisibilityPolicyRuntime,
  onSearchSheetContentLaneChanged,
}: UseResultsPresentationOwnerArgs): ResultsPresentationOwner => {
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
    searchRuntimeBus,
    resultsPresentationAuthority,
    routeSceneSwitchAuthority,
    resultsPresentationSurfaceAuthority,
    searchMapSourceFramePort,
    log,
        routeSceneVisibilityPolicyRuntime,
    onSearchSheetContentLaneChanged,
  });
};
