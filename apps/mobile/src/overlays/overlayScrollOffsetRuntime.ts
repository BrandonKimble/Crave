const overlayScrollOffsets = new Map<string, number>();

export const setOverlayScrollOffset = (overlayIdentity: string, offset: number): void => {
  const nextOffset = Math.max(0, offset);
  const existing = overlayScrollOffsets.get(overlayIdentity);
  if (existing != null && Math.abs(existing - nextOffset) < 1) {
    return;
  }
  if (__DEV__ && nextOffset > 0 && (existing ?? 0) === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[SCROLLDBG] offset captured scene=${overlayIdentity} offset=${Math.round(nextOffset)}`
    );
  }
  overlayScrollOffsets.set(overlayIdentity, nextOffset);
};

export const getOverlayScrollOffset = (overlayIdentity: string): number =>
  overlayScrollOffsets.get(overlayIdentity) ?? 0;

// Return-to-origin foundation (plans/return-to-origin-foundation-design.md §Restore / P3).
//
// A scene's stored scroll offset above persists for the session, but P3 scroll RESTORE must be
// a one-shot dismiss-return — NOT general scroll-persistence on every organic tab re-open. So
// the restore path stages a PENDING restore for the lane (offset + a consume-once flag); the
// scene's cold re-mount consumes the flag exactly once, gated on its first non-skeleton commit,
// and scrolls to the offset as the sole writer that frame. A later organic re-open finds no
// pending flag and starts at the top — no surprise scroll jump.
const overlayScrollRestorePending = new Map<string, number>();

export const stageOverlayScrollRestore = (overlayIdentity: string, offset: number): void => {
  const nextOffset = Math.max(0, offset);
  setOverlayScrollOffset(overlayIdentity, nextOffset);
  overlayScrollRestorePending.set(overlayIdentity, nextOffset);
};

export const consumePendingOverlayScrollRestore = (overlayIdentity: string): number | null => {
  const pending = overlayScrollRestorePending.get(overlayIdentity);
  if (pending == null) {
    return null;
  }
  overlayScrollRestorePending.delete(overlayIdentity);
  return pending;
};
