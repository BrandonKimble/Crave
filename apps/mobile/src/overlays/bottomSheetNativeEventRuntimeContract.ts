import type { BottomSheetNativeHostProps } from './BottomSheetNativeHost';
import type { BottomSheetSnap, BottomSheetSnapChangeSource } from './bottomSheetMotionTypes';
import type {
  BottomSheetProgrammaticRuntimeModel,
  BottomSheetRuntimeModel,
} from './useBottomSheetRuntime';

export type BottomSheetNativeSnapEvent = {
  snap: BottomSheetSnap;
  source: BottomSheetSnapChangeSource;
};

export type BottomSheetNativeEventRuntimeArgs = {
  visible: boolean;
  initialSnapPoint: Exclude<BottomSheetSnap, 'hidden'>;
  runtime: BottomSheetRuntimeModel | BottomSheetProgrammaticRuntimeModel;
  resolveSnapTargetY?: (snap: BottomSheetSnap) => number | undefined;
  onHidden?: () => void;
  onSnapStart?: (event: BottomSheetNativeSnapEvent) => void;
  onSnapChange?: (event: BottomSheetNativeSnapEvent) => void;
  onDragStateChange?: (isActive: boolean) => void;
  onSettleStateChange?: (isActive: boolean) => void;
};

export type BottomSheetNativeEventRuntime = {
  hostEventProps: Pick<BottomSheetNativeHostProps, 'onHostEvent' | 'pointerEvents'>;
};
