import { runOnUI, type SharedValue } from 'react-native-reanimated';

import type { OverlayKey } from '../../overlays/types';
import type { RouteOverlayDisplaySnapshot } from './route-overlay-display-snapshot-contract';

export type RouteOverlayDisplaySharedValueTargets = {
  activeTabIndexValue: SharedValue<number>;
};

export const resolveRouteOverlayBottomNavIndex = (
  overlayKey: OverlayKey | null | undefined
): number => {
  switch (overlayKey) {
    case 'bookmarks':
      return 1;
    case 'profile':
      return 2;
    case 'search':
    case 'polls':
    default:
      return 0;
  }
};

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
