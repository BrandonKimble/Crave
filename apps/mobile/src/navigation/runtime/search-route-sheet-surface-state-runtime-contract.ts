import type {
  SearchRouteOverlayRouteScope,
  SearchRouteOverlaySheetPolicy,
} from '../../overlays/searchRouteOverlayRuntimeContract';
import type { BottomSheetRuntimeModel } from '../../overlays/useBottomSheetRuntime';

export type SearchRouteSheetFrameHostInput = {
  activeSemanticOverlayKey: SearchRouteOverlayRouteScope['activeOverlayRouteKey'] | null;
  overlaySheetPolicy: SearchRouteOverlaySheetPolicy | null;
  expandedSnapPoint: number;
  middleSnapPoint: number;
  collapsedSnapPoint: number;
  sheetY: BottomSheetRuntimeModel['presentationState']['sheetY'] | null;
};

// F947, the tail of the dead persistence lane: `SearchRouteSheetMotionPersistenceInput`
// (the shape assembled on every surface resolve purely to feed the persistence-key
// resolver) and `SearchRouteSheetMotionCallbacksInput` (which carried it and had no
// importer anywhere) are deleted with the lane itself.
