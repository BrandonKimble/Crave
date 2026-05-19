import type {
  BottomSheetSnap,
  BottomSheetSnapPoint,
  BottomSheetSnapPoints,
} from '../../../../overlays/bottomSheetMotionTypes';
import type { BottomSheetRuntimeModel } from '../../../../overlays/useBottomSheetRuntime';

export type SearchRouteSheetMotionStateEntry = {
  visible: boolean;
  snapPoints: BottomSheetSnapPoints;
  initialSnapPoint: BottomSheetSnapPoint;
  currentSnapPoint: BottomSheetSnap;
  sheetYValue: BottomSheetRuntimeModel['presentationState']['sheetY'];
  scrollOffsetValue: BottomSheetRuntimeModel['presentationState']['scrollOffset'];
  momentumFlag: BottomSheetRuntimeModel['presentationState']['momentumFlag'];
  motionCommandValue: BottomSheetRuntimeModel['snapController']['motionCommand'];
};

export type SearchRouteSheetMotionStateSnapshot = {
  stateEntry: SearchRouteSheetMotionStateEntry | null;
};

export const EMPTY_SEARCH_ROUTE_SHEET_MOTION_STATE_SNAPSHOT: SearchRouteSheetMotionStateSnapshot = {
  stateEntry: null,
};
