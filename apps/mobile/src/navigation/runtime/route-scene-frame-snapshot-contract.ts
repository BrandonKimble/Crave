import type { SearchRouteSceneStackFrameEntry } from '../../overlays/searchRouteSceneStackSheetContract';

export type RouteSceneFrameSnapshot = {
  activeSceneFrameEntry: SearchRouteSceneStackFrameEntry | null;
};

export const EMPTY_ROUTE_SCENE_FRAME_SNAPSHOT: RouteSceneFrameSnapshot = {
  activeSceneFrameEntry: null,
};
