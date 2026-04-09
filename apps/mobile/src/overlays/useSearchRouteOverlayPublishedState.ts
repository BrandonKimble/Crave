import { useSearchRouteOverlayRuntimeStore } from './searchRouteOverlayRuntimeStore';
import type { SearchRouteOverlayPublishedState } from './searchResolvedRouteHostModelContract';

export const useSearchRouteOverlayPublishedState = (): SearchRouteOverlayPublishedState => {
  const publishedVisualState = useSearchRouteOverlayRuntimeStore((state) => state.visualState);
  const searchPanelSpec = useSearchRouteOverlayRuntimeStore((state) => state.searchPanelSpec);
  const searchPanelInteractionRef = useSearchRouteOverlayRuntimeStore(
    (state) => state.searchPanelInteractionRef
  );
  const dockedPollsPanelInputs = useSearchRouteOverlayRuntimeStore(
    (state) => state.dockedPollsPanelInputs
  );
  const renderPolicy = useSearchRouteOverlayRuntimeStore((state) => state.renderPolicy);

  return {
    publishedVisualState,
    searchPanelSpec,
    searchPanelInteractionRef,
    dockedPollsPanelInputs,
    renderPolicy,
  };
};
