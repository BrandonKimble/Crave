import React from 'react';

import type {
  SearchRoutePanelInteractionRef,
  SearchRoutePollsPanelInputs,
  SearchRouteOverlayRenderPolicy,
  SearchRouteHostVisualState,
} from './searchOverlayRouteHostContract';
import { useSearchRouteOverlayRuntimeStore } from './searchRouteOverlayRuntimeStore';
import type { OverlayContentSpec } from './types';

type UseSearchRouteOverlayRuntimePublicationArgs = {
  shouldRenderSearchOverlay: boolean;
  visualState: SearchRouteHostVisualState | null;
  searchPanelSpec: OverlayContentSpec<unknown> | null;
  searchPanelInteractionRef: SearchRoutePanelInteractionRef | null;
  dockedPollsPanelInputs: SearchRoutePollsPanelInputs | null;
  renderPolicy: SearchRouteOverlayRenderPolicy;
};

export const useSearchRouteOverlayRuntimePublication = ({
  shouldRenderSearchOverlay,
  visualState,
  searchPanelSpec,
  searchPanelInteractionRef,
  dockedPollsPanelInputs,
  renderPolicy,
}: UseSearchRouteOverlayRuntimePublicationArgs): void => {
  const publishSearchRouteRuntimeState = useSearchRouteOverlayRuntimeStore(
    (state) => state.publishSearchRouteRuntimeState
  );
  const clearSearchRouteOverlayRuntimeState = useSearchRouteOverlayRuntimeStore(
    (state) => state.clearSearchRouteOverlayRuntimeState
  );

  React.useEffect(() => {
    if (!shouldRenderSearchOverlay) {
      clearSearchRouteOverlayRuntimeState();
      return;
    }

    publishSearchRouteRuntimeState({
      visualState,
      searchPanelSpec,
      searchPanelInteractionRef,
      dockedPollsPanelInputs,
      renderPolicy,
    });
  }, [
    clearSearchRouteOverlayRuntimeState,
    dockedPollsPanelInputs,
    publishSearchRouteRuntimeState,
    renderPolicy,
    searchPanelInteractionRef,
    searchPanelSpec,
    shouldRenderSearchOverlay,
    visualState,
  ]);

  React.useEffect(
    () => () => {
      clearSearchRouteOverlayRuntimeState();
    },
    [clearSearchRouteOverlayRuntimeState]
  );
};
