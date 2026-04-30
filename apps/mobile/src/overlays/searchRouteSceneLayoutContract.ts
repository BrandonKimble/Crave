import type { SearchRouteHostVisualState } from './searchOverlayRouteHostContract';
import { EMPTY_SEARCH_ROUTE_VISUAL_STATE } from './searchRouteOverlayRuntimeContract';

export type SearchRouteSceneLayoutState = {
  navBarHeight: number;
  navBarTop: number;
  searchBarTop: number;
  snapPoints: SearchRouteHostVisualState['snapPoints'];
};

export const EMPTY_SEARCH_ROUTE_SCENE_LAYOUT_STATE: SearchRouteSceneLayoutState = {
  navBarHeight: EMPTY_SEARCH_ROUTE_VISUAL_STATE.navBarHeight,
  navBarTop: EMPTY_SEARCH_ROUTE_VISUAL_STATE.navBarTopForSnaps,
  searchBarTop: EMPTY_SEARCH_ROUTE_VISUAL_STATE.searchBarTop,
  snapPoints: EMPTY_SEARCH_ROUTE_VISUAL_STATE.snapPoints,
};
