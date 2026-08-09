import type { ProfileTransitionSnapshotCapture } from '../../../../navigation/runtime/app-route-profile-transition-state-contract';

// D56: the camera half of this capture is GONE (F1506) — the restaurant entry's
// OriginSnapshot.camera is the profile's return camera now, captured at the push commit that
// mints the entry rather than by a parallel ledger with its own timing. What is left is the
// results-scroll offset, which is genuinely this record's own axis.
export const resolveProfileTransitionSnapshotCapture = ({
  presentedListScroll,
}: {
  /** The presented entry's list scroll at capture time (track position authority). */
  presentedListScroll: number;
}): ProfileTransitionSnapshotCapture => {
  return {
    savedResultsScrollOffset: presentedListScroll,
  };
};
