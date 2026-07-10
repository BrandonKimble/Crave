import type { DerivedValue, SharedValue } from 'react-native-reanimated';

export const SEARCH_BOTTOM_NAV_MOTION_DURATION_MS = 360;

export type SearchBottomNavMotionTarget = 'hide' | 'show';

export type SearchBottomNavMotionRuntime = {
  navOpacity: SharedValue<number> | DerivedValue<number>;
  navTranslateY: SharedValue<number> | DerivedValue<number>;
};

// S-C.4 item 3b: the external command sink is DELETED — nav motion has ONE writer, the
// derivation layout effect in use-search-foreground-bottom-nav-visual-runtime. This module
// keeps only the shared constants/types.
