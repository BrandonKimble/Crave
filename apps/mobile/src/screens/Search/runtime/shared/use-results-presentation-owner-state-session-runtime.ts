import type React from 'react';

import type { ResultsPresentationLog } from './results-presentation-runtime-contract';
import type { ResultsPresentationAuthority } from './results-presentation-authority';
import type { ResultsPresentationSurfaceAuthority } from './results-presentation-surface-authority';
import type { SearchMapSourceFramePort } from '../map/search-map-source-frame-port';
import type { SearchRuntimeBus } from './search-runtime-bus';
import type { AppRouteSharedSheetRuntimeOwner } from '../../../../navigation/runtime/app-route-shared-sheet-runtime-contract';
import type { SearchChromeScalarSurfacePresentationRuntime } from '../native/search-chrome-scalar-surface-presentation-runtime';
import type { ResultsPresentationPolicyFactsLaneChange } from './results-presentation-policy-facts-controller';
import type { RouteSceneSwitchAuthority } from './route-authority-contract';
import {
  useResultsPresentationOwnerBridgeStateRuntime,
  type ResultsPresentationOwnerBridgeStateRuntime,
} from './use-results-presentation-owner-bridge-state-runtime';
import {
  useResultsPresentationOwnerShellStateRuntime,
  type ResultsPresentationOwnerShellStateRuntime,
} from './use-results-presentation-owner-shell-state-runtime';
import type { SearchSurfaceRedrawCoordinator } from '../controller/search-surface-redraw-coordinator';

export type ResultsPresentationOwnerStateSessionRuntime = {
  bridgeStateRuntime: ResultsPresentationOwnerBridgeStateRuntime;
  shellStateRuntime: ResultsPresentationOwnerShellStateRuntime;
};

export const useResultsPresentationOwnerStateSessionRuntime = ({
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
}: {
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
  >;
  searchRuntimeBus: SearchRuntimeBus;
  resultsPresentationAuthority: ResultsPresentationAuthority;
  routeSceneSwitchAuthority: RouteSceneSwitchAuthority;
  resultsPresentationSurfaceAuthority: ResultsPresentationSurfaceAuthority;
  searchMapSourceFramePort: SearchMapSourceFramePort;
  log: ResultsPresentationLog;
  searchSurfaceRedrawCoordinatorRef: React.MutableRefObject<SearchSurfaceRedrawCoordinator>;
  emitRuntimeMechanismEvent: (event: string, payload: Record<string, unknown>) => void;
  onSearchSheetContentLaneChanged?: (change: ResultsPresentationPolicyFactsLaneChange) => void;
  searchChromeScalarSurfacePresentationRuntime?: SearchChromeScalarSurfacePresentationRuntime;
}): ResultsPresentationOwnerStateSessionRuntime => {
  const bridgeStateRuntime = useResultsPresentationOwnerBridgeStateRuntime({
    setActiveTab,
    setActiveTabPreference,
    searchRuntimeBus,
    resultsPresentationAuthority,
    resultsPresentationSurfaceAuthority,
    searchMapSourceFramePort,
    log,
    searchSurfaceRedrawCoordinatorRef,
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
    resultsPresentationAuthority,
    routeSceneSwitchAuthority,
    onSearchSheetContentLaneChanged,
    resultsSheetRuntime,
    searchChromeScalarSurfacePresentationRuntime,
  });

  return {
    bridgeStateRuntime,
    shellStateRuntime,
  };
};
