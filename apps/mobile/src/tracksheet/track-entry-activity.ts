// ─── THE ACTIVITY AXIS (G-ACTIVITY, R2 / amendment A7) ───────────────────────
//
// "Body activity derived from (presented, …) — no all-true." The track host
// used to hand every mounted body a hardcoded all-true activity object; hidden
// retained legs would run their full data lanes. Activity is now a pure
// DERIVATION from presentation, in one place, falsifiable:
//
//   presented → the full production activity (attach + run + subscribe + render)
//   hidden    → RETAINED but SUSPENDED: the body stays attached (the whole
//               point of depth-K retention — hook state, drafts, segment
//               selection survive) while the expensive lanes the host controls
//               (data-lane run/subscribe, expanded-content render) are off.
//
// hasActivatedExpandedContent stays TRUE while hidden: activation is a fact
// about the past, and resetting it would replay the activation choreography
// (scroll/segment restore consumers key off the false→true edge) on every
// re-presentation of an already-activated body.
//
// STRUCTURAL NOTE (honest scope): on today's page only the presented leg's
// rows render in the one FlashList, so a hidden mounted body is UNMOUNTED —
// suspension is structural there. This derivation is the axis those bodies
// read whenever they ARE mounted (and the contract's falsifier home), so a
// future hidden-mount can never regress to all-true.

import type { BottomSheetSceneStackBodyDataActivity } from '../overlays/BottomSheetSceneStackBodyActivityContext';

export const deriveTrackEntryBodyActivity = (
  sceneKey: string,
  isPresented: boolean
): BottomSheetSceneStackBodyDataActivity => ({
  sceneKey,
  // Retention: hidden bodies stay attached — state survives re-presentation.
  shouldAttachMountedContent: true,
  // The gated lanes: run/subscribe only while presented.
  shouldRunDataLane: isPresented,
  shouldSubscribeDataLane: isPresented,
  shouldRenderExpandedContent: isPresented,
  // Activation is history, never revoked by hiding (see header).
  hasActivatedExpandedContent: true,
});
