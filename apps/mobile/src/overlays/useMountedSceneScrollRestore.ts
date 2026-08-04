import React from 'react';
import { captureHandledError } from '../observability/crash-reporting';
import type { ScrollView } from 'react-native';

import { consumePendingOverlayScrollRestore } from './sceneScrollStateRegistry';

// Return-to-origin foundation (plans/return-to-origin-foundation-design.md §Restore step 5/6).
//
// Scroll RESTORE for a MOUNTED-SCROLL scene (lists). The dismiss restore path stages a
// one-shot pending scroll offset for the scene's lane (keyed by sceneIdentityKey == sceneKey
// for the static mounted tabs) BEFORE the scene re-roots. This hook applies it:
//
//   • GATED ON `contentReady` = the scene is ACTIVE again AND its real (non-skeleton) content
//     has committed. The static tabs are RETAINED (never unmounted once bootstrapped) so the
//     return is not a cold re-mount; the active-transition is the trigger, and the real-content
//     gate guarantees the list has full extent (else a deep scrollTo clamps to 0 → jump-to-top).
//     Never applied on a bare/skeleton frame.
//   • SOLE WRITER that frame — it consumes the pending flag exactly once (consume-once), so no
//     organic re-activation re-triggers it and nothing else writes the offset on this frame.
//   • Belt-and-suspenders re-apply on the next frame (rAF), mirroring the list runtime: the
//     first scrollTo can land before the content height is final; the rAF pass re-pins it.
//
// Returns the ref to attach to the scene's ScrollView. A no-op for scenes with no pending
// restore (the common organic-open case): the consume returns null and nothing scrolls.
export const useMountedSceneScrollRestore = ({
  sceneKey,
  contentReady,
}: {
  sceneKey: string;
  contentReady: boolean;
}): React.RefObject<ScrollView | null> => {
  const scrollViewRef = React.useRef<ScrollView | null>(null);

  React.useLayoutEffect(() => {
    if (!contentReady) {
      return undefined;
    }
    const pendingOffset = consumePendingOverlayScrollRestore(sceneKey);
    // The "don't restore a top-of-list origin" rule lives at the single CAPTURE chokepoint
    // (captureRichSceneOrigin filters lanes to offset > 0), so here we only need the no-pending
    // guard — any staged offset is already a meaningful (> 0) scroll.
    if (pendingOffset == null) {
      return undefined;
    }
    if (scrollViewRef.current == null) {
      // F979(c): the one-shot flag is ALREADY BURNED by the consume above, so the user's
      // scroll position is gone, not merely un-restored — and the old report was
      // dev-only. Release-visible now; the caller-must-remember trap (consume BEFORE
      // checking the ref) stays recorded here rather than silently swallowed.
      captureHandledError(
        new Error('[origin-restore] pending scroll offset consumed with no scroller attached'),
        { sceneKey, pendingOffset }
      );
    }
    if (__DEV__ && scrollViewRef.current == null) {
      // Consumed a one-shot pending offset but no scroller ref is attached — e.g. a list-surface
      // scene that publishes scroll yet never wires this hook's ref (content-runtime attaches it
      // only on the non-list mounted branch). The restore no-ops below; surface the
      // misconfiguration in dev instead of silently burning the flag.
      // eslint-disable-next-line no-console
      console.warn(
        `[origin-restore] consumed a pending scroll offset for "${sceneKey}" but no scroller ref is attached — restore will no-op. Wire useMountedSceneScrollRestore's ref, or don't publish scroll for a list surface.`
      );
    }

    const applyOffset = () => {
      scrollViewRef.current?.scrollTo({ y: pendingOffset, animated: false });
    };

    applyOffset();
    const frameId = requestAnimationFrame(applyOffset);
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [contentReady, sceneKey]);

  return scrollViewRef;
};
