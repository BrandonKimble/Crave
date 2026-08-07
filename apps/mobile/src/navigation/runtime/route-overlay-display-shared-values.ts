import { runOnUI, type SharedValue } from 'react-native-reanimated';

import type { RouteOverlayDisplaySnapshot } from './route-overlay-display-snapshot-contract';

export type RouteOverlayDisplaySharedValueTargets = {
  activeTabIndexValue: SharedValue<number>;
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
  // F5400: the index arrives already resolved — the authority is its ONE derivation home.
  // This site used to re-derive it from `displayedRootOverlayKey`, one of three copies of the
  // same formula that were free to disagree.
  runOnUI(syncRouteOverlayDisplaySharedValuesOnUI)(
    values.activeTabIndexValue,
    snapshot.activeTabIndex
  );
};
