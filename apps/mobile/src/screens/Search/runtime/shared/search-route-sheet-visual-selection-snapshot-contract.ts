import type {
  SearchRouteSceneStackChromeVisualState,
  SearchRouteSceneStackPresentationState,
} from '../../../../overlays/searchRouteSceneStackSheetContract';

export type SearchRouteSheetVisualSelectionSnapshot = {
  presentationState: SearchRouteSceneStackPresentationState | null;
  chromeVisualState: SearchRouteSceneStackChromeVisualState | null;
};

export const EMPTY_SEARCH_ROUTE_SHEET_VISUAL_SELECTION_SNAPSHOT: SearchRouteSheetVisualSelectionSnapshot =
  {
    presentationState: null,
    chromeVisualState: null,
  };
