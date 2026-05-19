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
  previousPrewarmedSceneVisibilityValue: SharedValue<number> | null,
  displayedSceneVisibilityValue: SharedValue<number> | null,
  prewarmedSceneVisibilityValue: SharedValue<number> | null,
  activeTabIndex: number,
  shouldClearPreviousScene: boolean,
  shouldClearPreviousPrewarmedScene: boolean
): void => {
  'worklet';
  activeTabIndexValue.value = activeTabIndex;
  if (shouldClearPreviousScene && previousSceneVisibilityValue != null) {
    previousSceneVisibilityValue.value = 0;
  }
  if (shouldClearPreviousPrewarmedScene && previousPrewarmedSceneVisibilityValue != null) {
    previousPrewarmedSceneVisibilityValue.value = 0;
  }
  if (displayedSceneVisibilityValue != null) {
    displayedSceneVisibilityValue.value = 1;
  }
  if (prewarmedSceneVisibilityValue != null) {
    prewarmedSceneVisibilityValue.value = 1;
  }
};

export const syncRouteOverlayDisplaySharedValues = (
  values: RouteOverlayDisplaySharedValueTargets,
  snapshot: RouteOverlayDisplaySnapshot,
  previousDisplayedSceneKey: OverlayKey | null = null,
  previousPrewarmedSceneKey: OverlayKey | null = null
): void => {
  const shouldClearPreviousScene =
    previousDisplayedSceneKey != null &&
    previousDisplayedSceneKey !== snapshot.displayedSceneKey &&
    previousDisplayedSceneKey !== snapshot.prewarmedSceneKey;
  const shouldClearPreviousPrewarmedScene =
    previousPrewarmedSceneKey != null &&
    previousPrewarmedSceneKey !== snapshot.displayedSceneKey &&
    previousPrewarmedSceneKey !== snapshot.prewarmedSceneKey;
  const previousSceneVisibilityValue = shouldClearPreviousScene
    ? values.getSceneVisibilityValue(previousDisplayedSceneKey)
    : undefined;
  const previousPrewarmedSceneVisibilityValue = shouldClearPreviousPrewarmedScene
    ? values.getSceneVisibilityValue(previousPrewarmedSceneKey)
    : undefined;
  const displayedSceneVisibilityValue =
    snapshot.displayedSceneKey != null
      ? values.getSceneVisibilityValue(snapshot.displayedSceneKey)
      : undefined;
  const prewarmedSceneVisibilityValue =
    snapshot.prewarmedSceneKey != null
      ? values.getSceneVisibilityValue(snapshot.prewarmedSceneKey)
      : undefined;
  runOnUI(syncRouteOverlayDisplaySharedValuesOnUI)(
    values.activeTabIndexValue,
    previousSceneVisibilityValue ?? null,
    previousPrewarmedSceneVisibilityValue ?? null,
    displayedSceneVisibilityValue ?? null,
    prewarmedSceneVisibilityValue ?? null,
    resolveRouteOverlayBottomNavIndex(snapshot.displayedRootOverlayKey),
    shouldClearPreviousScene,
    shouldClearPreviousPrewarmedScene
  );
};
