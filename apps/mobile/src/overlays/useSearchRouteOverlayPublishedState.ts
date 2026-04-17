import { useShallow } from 'zustand/react/shallow';

import { useSearchRouteOverlayRuntimeStore } from './searchRouteOverlayRuntimeStore';
import type { SearchRouteOverlayPublishedState } from './searchResolvedRouteHostModelContract';

export const useSearchRouteOverlayPublishedState = (): SearchRouteOverlayPublishedState =>
  useSearchRouteOverlayRuntimeStore(
    useShallow((state) => ({
      publishedVisualState: state.visualState,
      searchSceneDefinition: state.searchSceneDefinition,
      searchPanelInteractionRef: state.searchPanelInteractionRef,
      dockedPollsPanelInputs: state.dockedPollsPanelInputs,
      renderPolicy: state.renderPolicy,
    }))
  );
