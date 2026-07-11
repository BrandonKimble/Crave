import { makeMutable, type SharedValue } from 'react-native-reanimated';

// §8.11 edit-lock: while a scene is in EDIT MODE the shared sheet is pinned to the
// expanded snap — swipe-down is disabled but RUBBER-BANDS (drag resists elastically and
// springs back) instead of hard-clamping. Mechanism: the shared gesture/snap runtimes
// read this UI-thread flag and, when set, collapse the elastic `upperBound` (and the
// release destination) to the expanded snap — the exact `applyElasticBounds` behavior
// that already guards the sheet's top edge, now applied to the bottom.
//
// Same registry ethos as overlaySceneScrollHandleRegistry: module-scope, panel-settable
// at runtime (edit mode toggles it on/off dynamically — this is NOT static per scene),
// token-keyed so overlapping acquire/release can't strand the lock, and INERT when
// unset (value 0 ⇒ every read site falls through to its pre-existing expression).
// Panels acquire from an effect keyed on their edit state so the effect CLEANUP clears
// the lock on both edit-exit and scene unmount.

const activeLockKeys = new Set<string>();

/** UI-thread flag: 1 while any scene holds the edit lock, else 0. Worklet-readable. */
export const overlaySheetEditLockValue: SharedValue<number> = makeMutable(0);

export const acquireOverlaySheetEditLock = (lockKey: string): (() => void) => {
  activeLockKeys.add(lockKey);
  overlaySheetEditLockValue.value = 1;
  return () => {
    activeLockKeys.delete(lockKey);
    overlaySheetEditLockValue.value = activeLockKeys.size > 0 ? 1 : 0;
  };
};
