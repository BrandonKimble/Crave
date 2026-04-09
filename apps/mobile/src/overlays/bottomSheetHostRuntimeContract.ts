import type { BottomSheetNativeHostProps } from './BottomSheetNativeHost';
import type { BottomSheetMotionCommand } from './bottomSheetMotionTypes';
import type {
  BottomSheetSnap,
  BottomSheetSnapChangeSource,
  BottomSheetSnapPoints,
} from './bottomSheetMotionTypes';
import type {
  BottomSheetProgrammaticRuntimeModel,
  BottomSheetRuntimeModel,
} from './useBottomSheetRuntime';

export type BottomSheetHostRuntimeArgs = {
  hostKey?: string;
  visible: boolean;
  snapPoints: BottomSheetSnapPoints;
  initialSnapPoint: Exclude<BottomSheetSnap, 'hidden'>;
  preservePositionOnSnapPointsChange: boolean;
  preventSwipeDismiss: boolean;
  interactionEnabled: boolean;
  animateOnMount: boolean;
  dismissThreshold?: number;
  style?: BottomSheetNativeHostProps['style'];
  runtime: BottomSheetRuntimeModel | BottomSheetProgrammaticRuntimeModel;
  resolveSnapTargetY?: (snap: BottomSheetSnap) => number | undefined;
  onHidden?: () => void;
  onSnapStart?: (event: { snap: BottomSheetSnap; source: BottomSheetSnapChangeSource }) => void;
  onSnapChange?: (event: { snap: BottomSheetSnap; source: BottomSheetSnapChangeSource }) => void;
  onDragStateChange?: (isActive: boolean) => void;
  onSettleStateChange?: (isActive: boolean) => void;
};

export type BottomSheetHostCommandRuntimeArgs = {
  runtime: BottomSheetRuntimeModel | BottomSheetProgrammaticRuntimeModel;
};

export type BottomSheetHostNativePropsRuntimeArgs = Omit<
  BottomSheetHostRuntimeArgs,
  | 'runtime'
  | 'resolveSnapTargetY'
  | 'onHidden'
  | 'onSnapStart'
  | 'onSnapChange'
  | 'onDragStateChange'
  | 'onSettleStateChange'
> & {
  hostEventProps: Pick<BottomSheetNativeHostProps, 'onHostEvent' | 'pointerEvents'>;
  sheetCommand: BottomSheetMotionCommand | null;
};
