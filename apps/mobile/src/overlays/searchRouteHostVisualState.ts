import type { SnapPoints } from './bottomSheetMotionTypes';
import type { DerivedValue, SharedValue } from 'react-native-reanimated';

type AnimatedNumberLike = { value: number };

export type SearchRouteHostVisualState = {
  sheetTranslateY: SharedValue<number>;
  resultsScrollOffset: SharedValue<number>;
  resultsMomentum: SharedValue<boolean>;
  overlayHeaderActionProgress: SharedValue<number>;
  navBarHeight: number;
  navBarTopForSnaps: number;
  searchBarTop: number;
  snapPoints: SnapPoints;
  closeVisualHandoffProgress: AnimatedNumberLike;
  navBarCutoutHeight: number;
  navBarCutoutProgress: SharedValue<number> | DerivedValue<number>;
  bottomNavHiddenTranslateY: number;
  navBarCutoutIsHiding: boolean;
};
