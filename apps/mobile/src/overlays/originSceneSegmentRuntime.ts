// Return-to-origin foundation (plans/return-to-origin-foundation-design.md §Restore / P5).
//
// The SEGMENT axis for a segmented scene (profile's created|contributed|favorites sub-tab).
// Mirrors overlayScrollOffsetRuntime's one-shot pending pattern: the dismiss restore stages a
// PENDING segment for the scene (keyed by sceneIdentityKey == sceneKey) BEFORE the scene
// re-roots; the scene's segment owner (the profile body-model runtime) consumes the flag
// EXACTLY ONCE on its first activation and applies it via its own segment setter, as the SOLE
// writer that frame. A later organic re-open finds no pending flag and keeps its default
// segment — no surprise sub-tab jump.
//
// SEGMENT-SELECT runs BEFORE scroll-restore on a profile-origin restore (design §Restore §5):
// the captured offset only makes sense against the captured segment's row extent, so the right
// segment's rows must be in place before the deep scrollTo lands.
const originSceneSegmentRestorePending = new Map<string, string>();

export const stageOriginSceneSegmentRestore = (
  sceneIdentity: string,
  segment: string | null | undefined
): void => {
  if (segment == null) {
    // A null/absent segment means "no segment to restore" — clear any stale pending so a
    // later restore for the same scene can't apply a previous run's sub-tab.
    originSceneSegmentRestorePending.delete(sceneIdentity);
    return;
  }
  originSceneSegmentRestorePending.set(sceneIdentity, segment);
};

export const consumePendingOriginSceneSegmentRestore = (
  sceneIdentity: string
): string | null => {
  const pending = originSceneSegmentRestorePending.get(sceneIdentity);
  if (pending == null) {
    return null;
  }
  originSceneSegmentRestorePending.delete(sceneIdentity);
  return pending;
};
