import { makeMutable, type SharedValue } from 'react-native-reanimated';

// §8.11 edit-lock: while a scene is in EDIT MODE the shared sheet is pinned to the
// expanded snap — swipe-down is disabled but RUBBER-BANDS (drag resists elastically and
// springs back) instead of hard-clamping. Mechanism: the shared gesture/snap runtimes
// read this UI-thread flag and, when set, collapse the elastic `upperBound` (and the
// release destination) to the expanded snap — the exact `applyElasticBounds` behavior
// that already guards the sheet's top edge, now applied to the bottom.
//
// Same registry ethos as sceneScrollStateRegistry: module-scope, panel-settable
// at runtime (edit mode toggles it on/off dynamically — this is NOT static per scene),
// token-keyed so overlapping acquire/release can't strand the lock, and INERT when
// unset (value 0 ⇒ every read site falls through to its pre-existing expression).
// Panels acquire from an effect keyed on their edit state so the effect CLEANUP clears
// the lock on both edit-exit and scene unmount.

// F1484: was `new Set<string>()`, so two acquisitions of the SAME token yielded two
// releases and the FIRST release dropped the key — silently unlocking the surviving
// holder mid-edit. `edit-session-liveness-contract.ts`'s parity claim ("COUNTED per
// scene ... exactly like the edit-lock tokens") stated this refcount behavior as
// already true; it was not. Latent today only because `ListsPanel.tsx` passes
// `entryId: null` so only one token exists in practice — but stacked `listDetail`
// entries (an explicitly supported shape) will collide the moment they key
// distinctly. Refcounted by token, same pattern as the liveness registry above.
const activeLockCountsByKey = new Map<string, number>();

/** UI-thread flag: 1 while any scene holds the edit lock, else 0. Worklet-readable. */
export const overlaySheetEditLockValue: SharedValue<number> = makeMutable(0);

export const acquireOverlaySheetEditLock = (lockKey: string): (() => void) => {
  const previousCount = activeLockCountsByKey.get(lockKey) ?? 0;
  activeLockCountsByKey.set(lockKey, previousCount + 1);
  overlaySheetEditLockValue.value = 1;
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    const count = activeLockCountsByKey.get(lockKey) ?? 0;
    if (count <= 1) {
      activeLockCountsByKey.delete(lockKey);
    } else {
      activeLockCountsByKey.set(lockKey, count - 1);
    }
    overlaySheetEditLockValue.value = activeLockCountsByKey.size > 0 ? 1 : 0;
  };
};
