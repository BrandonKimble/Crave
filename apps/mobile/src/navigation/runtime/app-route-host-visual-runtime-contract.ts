import type { DerivedValue, SharedValue } from 'react-native-reanimated';

type AnimatedNumberLike = { value: number };

export type AppRouteHostVisualRuntime = {
  navBarHeight: number;
  navBarTop: number;
  overlayHeaderActionProgress: SharedValue<number>;
  closeVisualHandoffProgress: AnimatedNumberLike;
  navBarCutoutProgress: SharedValue<number> | DerivedValue<number>;
  navBarCutoutIsHiding: boolean;
};
