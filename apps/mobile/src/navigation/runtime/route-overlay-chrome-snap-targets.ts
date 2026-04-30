import { runOnUI, type SharedValue } from 'react-native-reanimated';

import type { RouteOverlayChromeModeSnapshot } from './route-overlay-display-snapshot-contract';

export type RouteOverlayChromeSnapConfig = {
  expanded: number;
  middle: number;
};

export type RouteOverlayChromeSnapSharedValueTargets = {
  chromeExpandedSnap: SharedValue<number>;
  chromeMiddleSnap: SharedValue<number>;
  resolveSnaps: (snapshot: RouteOverlayChromeModeSnapshot) => RouteOverlayChromeSnapConfig;
};

const syncRouteOverlayChromeSnapSharedValuesOnUI = (
  chromeExpandedSnap: SharedValue<number>,
  chromeMiddleSnap: SharedValue<number>,
  expanded: number,
  middle: number
): void => {
  'worklet';
  chromeExpandedSnap.value = expanded;
  chromeMiddleSnap.value = middle;
};

export const syncRouteOverlayChromeSnapSharedValues = (
  values: RouteOverlayChromeSnapSharedValueTargets,
  snapshot: RouteOverlayChromeModeSnapshot
): void => {
  const { expanded, middle } = values.resolveSnaps(snapshot);
  runOnUI(syncRouteOverlayChromeSnapSharedValuesOnUI)(
    values.chromeExpandedSnap,
    values.chromeMiddleSnap,
    expanded,
    middle
  );
};
