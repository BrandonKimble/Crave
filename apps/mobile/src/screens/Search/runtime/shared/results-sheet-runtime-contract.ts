import type React from 'react';

import { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { calculateSnapPoints, type SheetPosition } from '../../../../overlays/sheetUtils';
import type { BottomSheetRuntimeModel } from '../../../../overlays/useBottomSheetRuntime';

export type ResultsSheetRuntimeOwner = {
  snapPoints: ReturnType<typeof calculateSnapPoints>;
  panelVisible: boolean;
  sheetState: SheetPosition;
  sheetTranslateY: SharedValue<number>;
  resultsScrollOffset: SharedValue<number>;
  resultsMomentum: SharedValue<boolean>;
  resultsSheetRuntimeModel: BottomSheetRuntimeModel;
  shouldRenderResultsSheet: boolean;
  shouldRenderResultsSheetRef: React.MutableRefObject<boolean>;
  headerDividerAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  resultsContainerAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  animateSheetTo: (position: SheetPosition, velocity?: number) => void;
  resetResultsSheetToHidden: () => void;
  prepareShortcutSheetTransition: () => boolean;
  handleSheetSnapChange: (nextSnap: SheetPosition | 'hidden') => void;
};
