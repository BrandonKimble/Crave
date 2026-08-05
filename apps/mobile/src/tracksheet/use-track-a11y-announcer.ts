// ─── G-A11Y — THE ADAPTER (the only part that touches AccessibilityInfo) ─────
//
// The decision is pure (track-a11y-plan.ts). This is the thin half: run it
// once per commit against the PAINTED entry, and when it says announce, state
// the screen change to assistive tech the two ways RN exposes —
//
//   • announceForAccessibility(name)  — the navigation event itself: the user
//     hears WHERE they now are, the way a pushed screen would have told them.
//   • setAccessibilityFocus(header)   — the cursor moves to the destination's
//     header instead of being stranded on the row it was reading in the page
//     that just left. The host owns the ref; TrackSheetPage attaches it to the
//     PRESENTED chrome layer (the header that is actually painted this commit).
//
// AFTER PAINT, not before: this runs in a passive effect, so the announcement
// and the focus move name a header that is already on screen. Both calls are
// no-ops when no screen reader is running, so there is no capability gate to
// keep in sync (and therefore no way for the gate to go stale and silence the
// track).

import React from 'react';
import { AccessibilityInfo, findNodeHandle } from 'react-native';

import { resolveSceneA11yName } from '../navigation/runtime/scene-foundation-spec';
import type { OverlayKey } from '../overlays/types';
import { TrackA11yAnnouncementLedger } from './track-a11y-plan';
import type { TrackEntryKey } from './track-entry-identity';

export type TrackA11yAnnouncerArgs = {
  /** The PAINTED entry key (the host's presentation truth). */
  presentedEntryKey: TrackEntryKey;
  /** The PAINTED scene — its declared name is what gets said. */
  scene: OverlayKey;
  /** The presented chrome layer, attached by TrackSheetPage. */
  headerFocusRef: React.MutableRefObject<unknown>;
};

export const useTrackA11yAnnouncer = ({
  presentedEntryKey,
  scene,
  headerFocusRef,
}: TrackA11yAnnouncerArgs): void => {
  const ledgerRef = React.useRef<TrackA11yAnnouncementLedger | null>(null);
  if (ledgerRef.current == null) {
    ledgerRef.current = new TrackA11yAnnouncementLedger();
  }
  // EVERY COMMIT, on purpose — no dependency array. A dep list of
  // [presentedEntryKey] would make the effect itself the suppressor, and the
  // LEDGER (the thing the falsifiers mutate) would become unfalsifiable
  // decoration: skeleton→rows would look correct because the effect never
  // re-ran, not because the decision said silent. The decision is one string
  // compare per commit; the latch is where the law lives, so the law is where
  // the RED lands.
  React.useEffect(() => {
    const decision = ledgerRef.current!.decide({
      presentedEntryKey,
      destinationName: resolveSceneA11yName(scene),
    });
    if (decision.kind !== 'announce') {
      return;
    }
    AccessibilityInfo.announceForAccessibility(decision.message);
    const handle = findNodeHandle(headerFocusRef.current as never);
    if (handle != null) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  });
};
