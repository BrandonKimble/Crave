import type { SearchRouteSceneStackFrameEntry } from '../../../../overlays/searchRouteSceneStackSheetContract';
import type {
  SearchRouteOverlayRouteScope,
  SearchRouteOverlaySheetPolicy,
} from '../../../../overlays/searchRouteOverlayRuntimeContract';

export type SearchRouteSheetResolvedSceneSelectionSnapshot = {
  resolvedActiveSceneFrameEntry: SearchRouteSceneStackFrameEntry | null;
  resolvedOverlayRouteScope: SearchRouteOverlayRouteScope | null;
  resolvedOverlaySheetPolicy: SearchRouteOverlaySheetPolicy | null;
};

export const EMPTY_SEARCH_ROUTE_SHEET_RESOLVED_SCENE_SELECTION_SNAPSHOT: SearchRouteSheetResolvedSceneSelectionSnapshot =
  {
    resolvedActiveSceneFrameEntry: null,
    resolvedOverlayRouteScope: null,
    resolvedOverlaySheetPolicy: null,
  };
