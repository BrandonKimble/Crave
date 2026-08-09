import type {
  BottomSheetSnap,
  BottomSheetSnapPoint,
  BottomSheetSnapPoints,
} from '../../../../overlays/bottomSheetMotionTypes';
import type { SharedValue } from 'react-native-reanimated';

import type { BottomSheetRuntimeModel } from '../../../../overlays/useBottomSheetRuntime';

export type SearchRouteSheetMotionStateEntry = {
  visible: boolean;
  snapPoints: BottomSheetSnapPoints;
  initialSnapPoint: BottomSheetSnapPoint;
  currentSnapPoint: BottomSheetSnap;
  /** The track's OWN published sheetTopY (track-sheet-position-authority) —
   *  the exact object TrackSheetPage animates with, not a mirror. The old
   *  scrollOffsetValue/momentumFlag lanes are gone: nothing ever read them
   *  (scroll is a point-in-time getter on the position authority now). */
  sheetYValue: SharedValue<number>;
  motionCommandValue: BottomSheetRuntimeModel['snapController']['motionCommand'];
};

export type SearchRouteSheetMotionStateSnapshot = {
  stateEntry: SearchRouteSheetMotionStateEntry | null;
};

export const EMPTY_SEARCH_ROUTE_SHEET_MOTION_STATE_SNAPSHOT: SearchRouteSheetMotionStateSnapshot = {
  stateEntry: null,
};
