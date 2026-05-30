import type {
  SearchRouteSceneStackChromeVisualState,
  SearchRouteSceneStackPresentationState,
} from '../../../../overlays/searchRouteSceneStackSheetContract';
import { EMPTY_SEARCH_ROUTE_VISUAL_STATE } from '../../../../overlays/searchRouteOverlayRuntimeContract';

export const DEFAULT_PRESENTATION_STATE: SearchRouteSceneStackPresentationState = {
  sheetTranslateY: EMPTY_SEARCH_ROUTE_VISUAL_STATE.sheetTranslateY,
  sheetScrollOffset: EMPTY_SEARCH_ROUTE_VISUAL_STATE.sheetScrollOffset,
  sheetMomentum: EMPTY_SEARCH_ROUTE_VISUAL_STATE.sheetMomentum,
};

export const DEFAULT_CHROME_VISUAL_STATE: SearchRouteSceneStackChromeVisualState = {
  overlayHeaderActionProgress: EMPTY_SEARCH_ROUTE_VISUAL_STATE.overlayHeaderActionProgress,
  searchSurfacePageBundleProgress: EMPTY_SEARCH_ROUTE_VISUAL_STATE.searchSurfacePageBundleProgress,
  navBarCutoutHeight: EMPTY_SEARCH_ROUTE_VISUAL_STATE.navBarCutoutHeight,
  navBarCutoutProgress: EMPTY_SEARCH_ROUTE_VISUAL_STATE.navBarCutoutProgress,
  navBarCutoutHidingProgress: EMPTY_SEARCH_ROUTE_VISUAL_STATE.navBarCutoutHidingProgress,
  bottomNavHiddenTranslateY: EMPTY_SEARCH_ROUTE_VISUAL_STATE.bottomNavHiddenTranslateY,
  navBarCutoutIsHiding: EMPTY_SEARCH_ROUTE_VISUAL_STATE.navBarCutoutIsHiding,
  navTranslateY: EMPTY_SEARCH_ROUTE_VISUAL_STATE.navTranslateY,
  navSilhouetteSheetExclusionModeValue:
    EMPTY_SEARCH_ROUTE_VISUAL_STATE.navSilhouetteSheetExclusionModeValue,
};

export type SearchRouteSheetResolvedVisualSelectionSnapshot = {
  resolvedPresentationState: SearchRouteSceneStackPresentationState;
  resolvedChromeVisualState: SearchRouteSceneStackChromeVisualState;
};

export const EMPTY_SEARCH_ROUTE_SHEET_RESOLVED_VISUAL_SELECTION_SNAPSHOT: SearchRouteSheetResolvedVisualSelectionSnapshot =
  {
    resolvedPresentationState: DEFAULT_PRESENTATION_STATE,
    resolvedChromeVisualState: DEFAULT_CHROME_VISUAL_STATE,
  };
