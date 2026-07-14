import type { SnapPoints } from './bottomSheetMotionTypes';
import type { DerivedValue, SharedValue } from 'react-native-reanimated';
import type { AppRouteNavSilhouetteSheetExclusionModeValue } from '../navigation/runtime/app-route-nav-silhouette-authority';

type AnimatedNumberLike = { value: number };

export type SearchRouteHostVisualState = {
  sheetTranslateY: SharedValue<number>;
  sheetScrollOffset: SharedValue<number>;
  sheetMomentum: SharedValue<boolean>;
  navBarHeight: number;
  navBarTopForSnaps: number;
  searchBarTop: number;
  snapPoints: SnapPoints;
  searchSurfacePageBundleProgress: AnimatedNumberLike;
  navBarCutoutHeight: number;
  navBarCutoutProgress: SharedValue<number> | DerivedValue<number>;
  navBarCutoutHidingProgress: SharedValue<number> | DerivedValue<number>;
  bottomNavHiddenTranslateY: number;
  navBarCutoutIsHiding: boolean;
  navTranslateY: SharedValue<number> | DerivedValue<number>;
  navSilhouetteSheetExclusionModeValue:
    | SharedValue<AppRouteNavSilhouetteSheetExclusionModeValue>
    | DerivedValue<AppRouteNavSilhouetteSheetExclusionModeValue>;
};
