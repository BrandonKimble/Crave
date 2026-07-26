import { runOnUI, type SharedValue } from 'react-native-reanimated';

import type { OverlayKey } from '../../overlays/types';
import type { RouteOverlayDisplaySnapshot } from './route-overlay-display-snapshot-contract';

export type RouteOverlayDisplaySharedValueTargets = {
  activeTabIndexValue: SharedValue<number>;
};

export { resolveRouteOverlayBottomNavIndex } from './route-overlay-bottom-nav-index';
import { resolveRouteOverlayBottomNavIndex } from './route-overlay-bottom-nav-index';

const syncRouteOverlayDisplaySharedValuesOnUI = (
  activeTabIndexValue: SharedValue<number>,
  activeTabIndex: number
): void => {
  'worklet';
  activeTabIndexValue.value = activeTabIndex;
};

export const syncRouteOverlayDisplaySharedValues = (
  values: RouteOverlayDisplaySharedValueTargets,
  snapshot: RouteOverlayDisplaySnapshot
): void => {
  runOnUI(syncRouteOverlayDisplaySharedValuesOnUI)(
    values.activeTabIndexValue,
    resolveRouteOverlayBottomNavIndex(snapshot.displayedRootOverlayKey)
  );
};
