import { create } from 'zustand';

import type {
  SearchRoutePanelInteractionRef,
  SearchRoutePollsPanelInputs,
  SearchRouteOverlayRenderPolicy,
  SearchRouteSceneDefinition,
} from './searchOverlayRouteHostContract';
import {
  EMPTY_SEARCH_ROUTE_DOCKED_POLLS_PANEL_INPUTS,
  EMPTY_SEARCH_ROUTE_OVERLAY_RENDER_POLICY,
  EMPTY_SEARCH_ROUTE_PANEL_INTERACTION_REF,
  EMPTY_SEARCH_ROUTE_SCENE_DEFINITION,
} from './searchOverlayRouteHostContract';
import type { SearchRouteHostVisualState } from './searchRouteHostVisualState';

type SearchRouteOverlayRuntimeState = {
  visualState: SearchRouteHostVisualState | null;
  searchSceneDefinition: SearchRouteSceneDefinition | null;
  searchPanelInteractionRef: SearchRoutePanelInteractionRef | null;
  dockedPollsPanelInputs: SearchRoutePollsPanelInputs | null;
  renderPolicy: SearchRouteOverlayRenderPolicy;
  publishSearchRouteRuntimeState: (searchRouteRuntimeState: {
    visualState: SearchRouteHostVisualState | null;
    searchSceneDefinition: SearchRouteSceneDefinition | null;
    searchPanelInteractionRef: SearchRoutePanelInteractionRef | null;
    dockedPollsPanelInputs: SearchRoutePollsPanelInputs | null;
    renderPolicy: SearchRouteOverlayRenderPolicy;
  }) => void;
  clearSearchRouteOverlayRuntimeState: () => void;
};

const isSearchRouteOverlayRenderPolicyEqual = (
  left: SearchRouteOverlayRenderPolicy,
  right: SearchRouteOverlayRenderPolicy
): boolean =>
  left.shouldShowSearchPanel === right.shouldShowSearchPanel &&
  left.shouldShowDockedPollsPanel === right.shouldShowDockedPollsPanel &&
  left.shouldFreezeOverlaySheetForCloseHandoff === right.shouldFreezeOverlaySheetForCloseHandoff &&
  left.shouldFreezeOverlayHeaderActionForRunOne ===
    right.shouldFreezeOverlayHeaderActionForRunOne &&
  left.shouldSuppressSearchAndTabSheetsForForegroundEditing ===
    right.shouldSuppressSearchAndTabSheetsForForegroundEditing &&
  left.shouldSuppressTabSheetsForSuggestions === right.shouldSuppressTabSheetsForSuggestions;

const isSearchRoutePollsPanelInputsEqual = (
  left: SearchRoutePollsPanelInputs | null,
  right: SearchRoutePollsPanelInputs | null
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.pollBounds === right.pollBounds &&
    left.startupPollsSnapshot === right.startupPollsSnapshot &&
    left.userLocation === right.userLocation &&
    left.interactionRef === right.interactionRef);

const isSearchRouteRuntimeStateEqual = (
  state: Pick<
    SearchRouteOverlayRuntimeState,
    | 'visualState'
    | 'searchSceneDefinition'
    | 'searchPanelInteractionRef'
    | 'dockedPollsPanelInputs'
    | 'renderPolicy'
  >,
  nextState: Pick<
    SearchRouteOverlayRuntimeState,
    | 'visualState'
    | 'searchSceneDefinition'
    | 'searchPanelInteractionRef'
    | 'dockedPollsPanelInputs'
    | 'renderPolicy'
  >
): boolean =>
  state.visualState === nextState.visualState &&
  state.searchSceneDefinition === nextState.searchSceneDefinition &&
  state.searchPanelInteractionRef === nextState.searchPanelInteractionRef &&
  isSearchRoutePollsPanelInputsEqual(
    state.dockedPollsPanelInputs,
    nextState.dockedPollsPanelInputs
  ) &&
  isSearchRouteOverlayRenderPolicyEqual(state.renderPolicy, nextState.renderPolicy);

export const useSearchRouteOverlayRuntimeStore = create<SearchRouteOverlayRuntimeState>((set) => ({
  visualState: null,
  searchSceneDefinition: EMPTY_SEARCH_ROUTE_SCENE_DEFINITION,
  searchPanelInteractionRef: EMPTY_SEARCH_ROUTE_PANEL_INTERACTION_REF,
  dockedPollsPanelInputs: EMPTY_SEARCH_ROUTE_DOCKED_POLLS_PANEL_INPUTS,
  renderPolicy: EMPTY_SEARCH_ROUTE_OVERLAY_RENDER_POLICY,
  publishSearchRouteRuntimeState: (searchRouteRuntimeState) =>
    set((state) =>
      isSearchRouteRuntimeStateEqual(state, searchRouteRuntimeState)
        ? state
        : {
            ...state,
            ...searchRouteRuntimeState,
          }
    ),
  clearSearchRouteOverlayRuntimeState: () =>
    set((state) => {
      const clearedState = {
        visualState: null,
        searchSceneDefinition: EMPTY_SEARCH_ROUTE_SCENE_DEFINITION,
        searchPanelInteractionRef: EMPTY_SEARCH_ROUTE_PANEL_INTERACTION_REF,
        dockedPollsPanelInputs: EMPTY_SEARCH_ROUTE_DOCKED_POLLS_PANEL_INPUTS,
        renderPolicy: EMPTY_SEARCH_ROUTE_OVERLAY_RENDER_POLICY,
      };

      return isSearchRouteRuntimeStateEqual(state, clearedState)
        ? state
        : {
            ...state,
            ...clearedState,
          };
    }),
}));
