import type { BottomSheetSnap } from '../../../../overlays/bottomSheetMotionTypes';

export type SearchRouteSheetMotionCallbacksEntry = {
  onSnapStart:
    | ((
        snap: BottomSheetSnap,
        meta?: { source: 'gesture' | 'programmatic' }
      ) => void)
    | undefined;
  onSnapChange:
    | ((
        snap: BottomSheetSnap,
        meta?: { source: 'gesture' | 'programmatic' }
      ) => void)
    | undefined;
  onDragStateChange: ((isDragging: boolean) => void) | undefined;
  onSettleStateChange: ((isSettling: boolean) => void) | undefined;
  onSnapSettleComplete: ((settleToken: number) => void) | undefined;
};

export type SearchRouteSheetMotionCallbacksSnapshot = {
  callbacksEntry: SearchRouteSheetMotionCallbacksEntry;
};
