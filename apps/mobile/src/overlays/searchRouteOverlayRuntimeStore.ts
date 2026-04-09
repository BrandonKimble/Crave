import { create } from 'zustand';

import type {
  SearchRoutePanelInteractionRef,
  SearchRoutePollsPanelInputs,
  SearchRouteOverlayRenderPolicy,
} from './searchOverlayRouteHostContract';
import {
  EMPTY_SEARCH_ROUTE_DOCKED_POLLS_PANEL_INPUTS,
  EMPTY_SEARCH_ROUTE_OVERLAY_RENDER_POLICY,
  EMPTY_SEARCH_ROUTE_PANEL_INTERACTION_REF,
  EMPTY_SEARCH_ROUTE_PANEL_SPEC,
} from './searchOverlayRouteHostContract';
import type { SearchRouteHostVisualState } from './searchRouteHostVisualState';
import type { OverlayContentSpec } from './types';

type SearchRouteOverlayRuntimeState = {
  visualState: SearchRouteHostVisualState | null;
  searchPanelSpec: OverlayContentSpec<unknown> | null;
  searchPanelInteractionRef: SearchRoutePanelInteractionRef | null;
  dockedPollsPanelInputs: SearchRoutePollsPanelInputs | null;
  renderPolicy: SearchRouteOverlayRenderPolicy;
  publishSearchRouteRuntimeState: (searchRouteRuntimeState: {
    visualState: SearchRouteHostVisualState | null;
    searchPanelSpec: OverlayContentSpec<unknown> | null;
    searchPanelInteractionRef: SearchRoutePanelInteractionRef | null;
    dockedPollsPanelInputs: SearchRoutePollsPanelInputs | null;
    renderPolicy: SearchRouteOverlayRenderPolicy;
  }) => void;
  clearSearchRouteOverlayRuntimeState: () => void;
};

export const useSearchRouteOverlayRuntimeStore = create<SearchRouteOverlayRuntimeState>((set) => ({
  visualState: null,
  searchPanelSpec: EMPTY_SEARCH_ROUTE_PANEL_SPEC,
  searchPanelInteractionRef: EMPTY_SEARCH_ROUTE_PANEL_INTERACTION_REF,
  dockedPollsPanelInputs: EMPTY_SEARCH_ROUTE_DOCKED_POLLS_PANEL_INPUTS,
  renderPolicy: EMPTY_SEARCH_ROUTE_OVERLAY_RENDER_POLICY,
  publishSearchRouteRuntimeState: (searchRouteRuntimeState) => set(searchRouteRuntimeState),
  clearSearchRouteOverlayRuntimeState: () =>
    set({
      visualState: null,
      searchPanelSpec: EMPTY_SEARCH_ROUTE_PANEL_SPEC,
      searchPanelInteractionRef: EMPTY_SEARCH_ROUTE_PANEL_INTERACTION_REF,
      dockedPollsPanelInputs: EMPTY_SEARCH_ROUTE_DOCKED_POLLS_PANEL_INPUTS,
      renderPolicy: EMPTY_SEARCH_ROUTE_OVERLAY_RENDER_POLICY,
    }),
}));
