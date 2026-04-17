import React from 'react';

import type {
  SearchRoutePanelInteractionRef,
  SearchRoutePollsPanelInputs,
  SearchRouteOverlayRenderPolicy,
  SearchRouteSceneDefinition,
  SearchRouteHostVisualState,
} from './searchOverlayRouteHostContract';
import { useSearchRouteOverlayRuntimeStore } from './searchRouteOverlayRuntimeStore';

type UseSearchRouteOverlayRuntimePublicationArgs = {
  shouldRenderSearchOverlay: boolean;
  visualState: SearchRouteHostVisualState | null;
  searchSceneDefinition: SearchRouteSceneDefinition | null;
  searchPanelInteractionRef: SearchRoutePanelInteractionRef | null;
  dockedPollsPanelInputs: SearchRoutePollsPanelInputs | null;
  renderPolicy: SearchRouteOverlayRenderPolicy;
};

export const useSearchRouteOverlayRuntimePublication = ({
  shouldRenderSearchOverlay,
  visualState,
  searchSceneDefinition,
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
  const lastDiagnosticRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const nextDiagnostic = JSON.stringify({
      shouldRenderSearchOverlay,
      hasVisualState: visualState != null,
      searchPanelOverlayKey: searchSceneDefinition?.shellSpec.overlayKey ?? null,
      hasSearchInteractionRef: searchPanelInteractionRef != null,
      hasDockedPollsPanelInputs: dockedPollsPanelInputs != null,
      renderPolicy,
    });

    if (lastDiagnosticRef.current === nextDiagnostic) {
      return;
    }

    console.debug('[DEBUG] [SEARCH-ROUTE-PUBLICATION-DIAG] publishBoundary', {
      shouldRenderSearchOverlay,
      hasVisualState: visualState != null,
      searchPanelOverlayKey: searchSceneDefinition?.shellSpec.overlayKey ?? null,
      hasSearchInteractionRef: searchPanelInteractionRef != null,
      hasDockedPollsPanelInputs: dockedPollsPanelInputs != null,
      renderPolicy,
    });
    lastDiagnosticRef.current = nextDiagnostic;
  }, [
    dockedPollsPanelInputs,
    renderPolicy,
    searchPanelInteractionRef,
    searchSceneDefinition?.shellSpec.overlayKey,
    shouldRenderSearchOverlay,
    visualState,
  ]);

  React.useEffect(() => {
    if (!shouldRenderSearchOverlay) {
      console.debug('[DEBUG] [SEARCH-ROUTE-PUBLICATION-DIAG] clearOverlayRuntimeState', {
        reason: 'should_render_search_overlay_false',
      });
      clearSearchRouteOverlayRuntimeState();
      return;
    }

    publishSearchRouteRuntimeState({
      visualState,
      searchSceneDefinition,
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
    searchSceneDefinition,
    shouldRenderSearchOverlay,
    visualState,
  ]);

  React.useEffect(
    () => () => {
      console.debug('[DEBUG] [SEARCH-ROUTE-PUBLICATION-DIAG] clearOverlayRuntimeState', {
        reason: 'publication_effect_unmount',
      });
      clearSearchRouteOverlayRuntimeState();
    },
    [clearSearchRouteOverlayRuntimeState]
  );
};
