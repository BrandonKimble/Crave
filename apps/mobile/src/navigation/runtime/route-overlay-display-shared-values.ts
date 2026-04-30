import { runOnUI, type SharedValue } from 'react-native-reanimated';

import type { OverlayKey } from '../../overlays/types';
import type { RouteOverlayDisplaySnapshot } from './route-overlay-display-snapshot-contract';

export type RouteOverlayDisplaySharedValueTargets = {
  activeTabIndexValue: SharedValue<number>;
  getSceneVisibilityValue: (sceneKey: OverlayKey) => SharedValue<number> | undefined;
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
  previousSceneVisibilityValue: SharedValue<number> | null,
  displayedSceneVisibilityValue: SharedValue<number> | null,
  activeTabIndex: number,
  shouldClearPreviousScene: boolean
): void => {
  'worklet';
  activeTabIndexValue.value = activeTabIndex;
  if (shouldClearPreviousScene && previousSceneVisibilityValue != null) {
    previousSceneVisibilityValue.value = 0;
  }
  if (displayedSceneVisibilityValue != null) {
    displayedSceneVisibilityValue.value = 1;
  }
};

export const syncRouteOverlayDisplaySharedValues = (
  values: RouteOverlayDisplaySharedValueTargets,
  snapshot: RouteOverlayDisplaySnapshot,
  previousDisplayedSceneKey: OverlayKey | null = null
): void => {
  const shouldClearPreviousScene =
    previousDisplayedSceneKey != null && previousDisplayedSceneKey !== snapshot.displayedSceneKey;
  const previousSceneVisibilityValue = shouldClearPreviousScene
    ? values.getSceneVisibilityValue(previousDisplayedSceneKey)
    : undefined;
  const displayedSceneVisibilityValue =
    snapshot.displayedSceneKey != null
      ? values.getSceneVisibilityValue(snapshot.displayedSceneKey)
      : undefined;
  runOnUI(syncRouteOverlayDisplaySharedValuesOnUI)(
    values.activeTabIndexValue,
    previousSceneVisibilityValue ?? null,
    displayedSceneVisibilityValue ?? null,
    resolveRouteOverlayBottomNavIndex(snapshot.displayedRootOverlayKey),
    shouldClearPreviousScene
  );
};
