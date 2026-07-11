import { makeMutable, type SharedValue } from 'react-native-reanimated';

import type { SceneFoundationSpec } from '../navigation/runtime/scene-foundation-spec';

// Scene snap lock (scene-foundation `snapLock` literal): a scene declaring
// `snapLock: 'expanded'` (settings is the first consumer) rides the STANDARD child shell —
// identical snap points, so page switches never move the sheet — but is PINNED to the
// expanded snap: drags rubber-band back (elastic upperBound) and every release resolves to
// expanded. Static per scene, BY CONSTRUCTION: the sheet-host authority controller syncs this
// UI-thread flag from the PRESENTED scene's foundation spec on every runtime-config recompute
// (no acquire/release token — the compile-time table is the source of truth; contrast
// overlaySheetEditLockRuntime, which is the DYNAMIC token-keyed variant of the same pin).
// Both flags feed the SAME two gates: the gesture runtimes' elastic `upperBound`
// (useBottomSheetSharedGestureRuntime) and the release destination
// (useBottomSheetSharedSnapExecutionRuntime.resolveDestination). Inert when 0.

/** UI-thread flag: 1 while the presented scene declares snapLock:'expanded', else 0. */
export const overlaySheetSceneSnapLockValue: SharedValue<number> = makeMutable(0);

export const setOverlaySheetSceneSnapLock = (snapLock: SceneFoundationSpec['snapLock']): void => {
  const nextValue = snapLock === 'expanded' ? 1 : 0;
  if (overlaySheetSceneSnapLockValue.value !== nextValue) {
    overlaySheetSceneSnapLockValue.value = nextValue;
  }
};
