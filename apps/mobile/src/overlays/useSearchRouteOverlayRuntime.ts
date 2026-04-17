import React from 'react';

import type {
  SearchRoutePanelInteractionRef,
  SearchRoutePollsPanelInputs,
  SearchRouteSceneDefinition,
  SearchRouteHostVisualState,
} from './searchOverlayRouteHostContract';
import { useSearchRouteDockedPollsPanelInputs } from './useSearchRouteDockedPollsPanelInputs';
import { useSearchRouteOverlayRenderPolicy } from './useSearchRouteOverlayRenderPolicy';
import { useSearchRouteOverlayRuntimePublication } from './useSearchRouteOverlayRuntimePublication';

type UseSearchRouteOverlayRuntimeArgs = {
  shouldRenderSearchOverlay: boolean;
  visualState: SearchRouteHostVisualState | null;
  shouldShowSearchPanel: boolean;
  shouldShowDockedPollsPanel: boolean;
  searchSceneDefinition: SearchRouteSceneDefinition | null;
  searchInteractionRef: SearchRoutePanelInteractionRef | null;
  pollBounds: SearchRoutePollsPanelInputs['pollBounds'];
  startupPollsSnapshot: SearchRoutePollsPanelInputs['startupPollsSnapshot'];
  userLocation: SearchRoutePollsPanelInputs['userLocation'];
  shouldFreezeOverlaySheetForCloseHandoff: boolean;
  shouldFreezeOverlayHeaderActionForRunOne: boolean;
  isForegroundEditing: boolean;
  isSuggestionPanelActive: boolean;
};

export const useSearchRouteOverlayRuntime = ({
  shouldRenderSearchOverlay,
  visualState,
  shouldShowSearchPanel,
  shouldShowDockedPollsPanel,
  searchSceneDefinition,
  searchInteractionRef,
  pollBounds,
  startupPollsSnapshot,
  userLocation,
  shouldFreezeOverlaySheetForCloseHandoff,
  shouldFreezeOverlayHeaderActionForRunOne,
  isForegroundEditing,
  isSuggestionPanelActive,
}: UseSearchRouteOverlayRuntimeArgs): void => {
  const dockedPollsPanelInputs = useSearchRouteDockedPollsPanelInputs({
    pollBounds,
    startupPollsSnapshot,
    userLocation,
    searchInteractionRef,
  });
  const renderPolicy = useSearchRouteOverlayRenderPolicy({
    shouldShowSearchPanel,
    shouldShowDockedPollsPanel,
    shouldFreezeOverlaySheetForCloseHandoff,
    shouldFreezeOverlayHeaderActionForRunOne,
    isForegroundEditing,
    isSuggestionPanelActive,
  });

  useSearchRouteOverlayRuntimePublication({
    shouldRenderSearchOverlay,
    visualState,
    searchSceneDefinition,
    searchPanelInteractionRef: searchInteractionRef,
    dockedPollsPanelInputs,
    renderPolicy,
  });

  React.useDebugValue(
    shouldRenderSearchOverlay
      ? {
          shouldShowSearchPanel,
          shouldShowDockedPollsPanel,
        }
      : 'hidden'
  );
};
