import type React from 'react';
import type { OverlayContentSpec } from './types';
import type { SearchInteractionSnapshot } from '../screens/Search/context/SearchInteractionContext';
import type { UsePollsPanelSpecOptions } from './panels/runtime/polls-panel-runtime-contract';

export type SearchRoutePanelInteractionRef = React.MutableRefObject<SearchInteractionSnapshot>;
export type SearchRoutePollsPanelInputs = {
  pollBounds: UsePollsPanelSpecOptions['bounds'];
  startupPollsSnapshot: UsePollsPanelSpecOptions['bootstrapSnapshot'];
  interactionRef?: SearchRoutePanelInteractionRef | null;
};

export const EMPTY_SEARCH_ROUTE_PANEL_SPEC: OverlayContentSpec<unknown> | null = null;
export const EMPTY_SEARCH_ROUTE_PANEL_INTERACTION_REF: SearchRoutePanelInteractionRef | null = null;

export const EMPTY_SEARCH_ROUTE_DOCKED_POLLS_PANEL_INPUTS: SearchRoutePollsPanelInputs | null =
  null;

export type SearchRouteOverlayRenderPolicy = {
  shouldShowSearchPanel: boolean;
  shouldShowDockedPollsPanel: boolean;
  shouldFreezeOverlaySheetForCloseHandoff: boolean;
  shouldFreezeOverlayHeaderActionForRunOne: boolean;
  shouldSuppressSearchAndTabSheetsForForegroundEditing: boolean;
  shouldSuppressTabSheetsForSuggestions: boolean;
};

export const EMPTY_SEARCH_ROUTE_OVERLAY_RENDER_POLICY: SearchRouteOverlayRenderPolicy = {
  shouldShowSearchPanel: false,
  shouldShowDockedPollsPanel: false,
  shouldFreezeOverlaySheetForCloseHandoff: false,
  shouldFreezeOverlayHeaderActionForRunOne: false,
  shouldSuppressSearchAndTabSheetsForForegroundEditing: false,
  shouldSuppressTabSheetsForSuggestions: false,
};
