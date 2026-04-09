import type { SearchRouteHostVisualState } from './searchRouteHostVisualState';
import {
  EMPTY_SEARCH_ROUTE_VISUAL_STATE,
  type SearchRouteOverlaySheetKeys,
} from './searchResolvedRouteHostModelContract';

type UseSearchRouteTabPanelRuntimeArgs = {
  publishedVisualState: SearchRouteHostVisualState | null;
  overlaySheetKeys: SearchRouteOverlaySheetKeys;
};

export type SearchRouteTabPanelRuntimeModel = {
  navBarTop: SearchRouteHostVisualState['navBarTopForSnaps'];
  searchBarTop: SearchRouteHostVisualState['searchBarTop'];
  snapPoints: SearchRouteHostVisualState['snapPoints'];
  sheetY: SearchRouteHostVisualState['sheetTranslateY'];
  headerActionProgress: SearchRouteHostVisualState['overlayHeaderActionProgress'];
  showBookmarksOverlay: boolean;
  showProfileOverlay: boolean;
};

export const useSearchRouteTabPanelRuntime = ({
  publishedVisualState,
  overlaySheetKeys,
}: UseSearchRouteTabPanelRuntimeArgs): SearchRouteTabPanelRuntimeModel => {
  const visualState = publishedVisualState ?? EMPTY_SEARCH_ROUTE_VISUAL_STATE;

  return {
    navBarTop: visualState.navBarTopForSnaps,
    searchBarTop: visualState.searchBarTop,
    snapPoints: visualState.snapPoints,
    sheetY: visualState.sheetTranslateY,
    headerActionProgress: visualState.overlayHeaderActionProgress,
    showBookmarksOverlay: overlaySheetKeys.showBookmarksOverlay,
    showProfileOverlay: overlaySheetKeys.showProfileOverlay,
  };
};
