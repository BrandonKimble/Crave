import type { DerivedValue, SharedValue } from 'react-native-reanimated';
import type { AppRouteNavSilhouetteSheetExclusionModeValue } from './app-route-nav-silhouette-authority';

type AnimatedNumberLike = { value: number };

export type AppRouteHostVisualRuntime = {
  navBarHeight: number;
  navBarTop: number;
  bottomNavHiddenTranslateY: number;
  searchSurfacePageBundleProgress: AnimatedNumberLike;
  navBarCutoutProgress: SharedValue<number> | DerivedValue<number>;
  navBarCutoutHidingProgress: SharedValue<number> | DerivedValue<number>;
  navBarCutoutIsHiding: boolean;
  navTranslateY: SharedValue<number> | DerivedValue<number>;
  navSilhouetteSheetBodyExclusionHeight: SharedValue<number> | DerivedValue<number>;
  navSilhouetteSheetMaskHeight: SharedValue<number> | DerivedValue<number>;
  navSilhouetteSheetExclusionModeValue:
    | SharedValue<AppRouteNavSilhouetteSheetExclusionModeValue>
    | DerivedValue<AppRouteNavSilhouetteSheetExclusionModeValue>;
};
