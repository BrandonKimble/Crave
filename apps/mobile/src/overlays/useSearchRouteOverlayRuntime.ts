import React from 'react';

import type {
  SearchRoutePanelInteractionRef,
  SearchRoutePollsPanelInputs,
  SearchRouteHostVisualState,
} from './searchOverlayRouteHostContract';
import { useSearchRouteDockedPollsPanelInputs } from './useSearchRouteDockedPollsPanelInputs';
import { useSearchRouteOverlayRenderPolicy } from './useSearchRouteOverlayRenderPolicy';
import { useSearchRouteOverlayRuntimePublication } from './useSearchRouteOverlayRuntimePublication';
import type { OverlayContentSpec } from './types';

type UseSearchRouteOverlayRuntimeArgs = {
  shouldRenderSearchOverlay: boolean;
  visualState: SearchRouteHostVisualState | null;
  shouldShowSearchPanel: boolean;
  shouldShowDockedPollsPanel: boolean;
  searchPanelSpec: OverlayContentSpec<unknown> | null;
  searchInteractionRef: SearchRoutePanelInteractionRef | null;
  pollBounds: SearchRoutePollsPanelInputs['pollBounds'];
  startupPollsSnapshot: SearchRoutePollsPanelInputs['startupPollsSnapshot'];
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
  searchPanelSpec,
  searchInteractionRef,
  pollBounds,
  startupPollsSnapshot,
  shouldFreezeOverlaySheetForCloseHandoff,
  shouldFreezeOverlayHeaderActionForRunOne,
  isForegroundEditing,
  isSuggestionPanelActive,
}: UseSearchRouteOverlayRuntimeArgs): void => {
  const dockedPollsPanelInputs = useSearchRouteDockedPollsPanelInputs({
    pollBounds,
    startupPollsSnapshot,
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
    searchPanelSpec,
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
