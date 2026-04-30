import type { SearchRouteSceneLayoutState } from '../../../../overlays/searchRouteSceneLayoutContract';

export type RouteSceneLayoutSnapshot = {
  routeSceneLayout: SearchRouteSceneLayoutState | null;
};

export const EMPTY_ROUTE_SCENE_LAYOUT_SNAPSHOT: RouteSceneLayoutSnapshot = {
  routeSceneLayout: null,
};
