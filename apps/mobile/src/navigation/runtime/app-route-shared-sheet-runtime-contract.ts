import type React from 'react';

import { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { calculateSnapPoints, type SheetPosition } from '../../overlays/sheetUtils';
import type { BottomSheetRuntimeModel } from '../../overlays/useBottomSheetRuntime';

export type AppRouteSharedSheetRuntimeOwner = {
  snapPoints: ReturnType<typeof calculateSnapPoints>;
  panelVisible: boolean;
  sheetState: SheetPosition;
  sheetTranslateY: SharedValue<number>;
  sheetScrollOffset: SharedValue<number>;
  sheetMomentum: SharedValue<boolean>;
  sharedSheetRuntimeModel: BottomSheetRuntimeModel;
  shouldRenderMountedSharedSheet: boolean;
  shouldRenderMountedSharedSheetRef: React.MutableRefObject<boolean>;
  sharedSheetContainerAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  markSharedSheetHidden: () => void;
  prepareSharedSheetForSearchPresentation: () => boolean;
};

export type AppRouteSharedSheetVisualBinding = Pick<
  AppRouteSharedSheetRuntimeOwner,
  'snapPoints' | 'sheetTranslateY' | 'sheetScrollOffset' | 'sheetMomentum'
> & {
  getCurrentSheetSnap: () => SheetPosition;
};
