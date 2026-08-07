import type {
  OverlayKey,
  OverlayRouteParamsMap,
} from '../navigation/runtime/app-overlay-route-types';
import type { CameraSnapshot } from '../navigation/runtime/app-route-profile-transition-state-contract';

export type SearchOverlaySheetSnap = 'expanded' | 'middle' | 'collapsed' | 'hidden';

export type TabOverlaySnap = Exclude<SearchOverlaySheetSnap, 'hidden'>;

// Return-to-origin foundation (plans/return-to-origin-foundation-design.md).
// A reveal = PUSH from an origin; a dismiss = POP back to that EXACT origin. The
// snapshot carries ONLY stable IDs + query-key params (never data, never list
// indices) so restore can RECONSTRUCT a cold panel (skeleton-first, anchor resolves
// to index POST-fetch).
//
// P3 generalized scroll shape.
export type OriginScrollLane = {
  laneKey: string;
  /** offset = hint; the anchor wins. NEVER an index. */
  offset: number;
};

// OriginSnapshot REPLACES the old SearchSessionOriginContext ({rootOverlay, tabSnap,
// childAnchor?}). The field rename is a WIDENING, not a semantic change:
//   rootOverlay  → sceneKey
//   tabSnap      → detent
// The old `childAnchor` has NO successor here — see the note below the fields.
//
// `scroll`, `segment` and `sceneParams` each have a real publisher today; every field on
// this type is one a producer can write.
export type OriginSnapshot = {
  /** TRUE scene identity (search|polls|pollDetail|lists|profile) — NOT root-collapsed. */
  sceneKey: OverlayKey;
  /** {pollId} | {profileUserId,...} | null (home). REQUIRED — every producer writes it
   *  (null is the real "no params" value, never absent). F5408. */
  sceneParams: OverlayRouteParamsMap[OverlayKey] | null;
  /** LIVE snap at trigger (not hard-coded 'expanded'). */
  detent: TabOverlaySnap;
  /** active sub-tab for segmented scenes (profile); null when none. REQUIRED (F5408). */
  segment: string | null;
  /** nested-aware; EMPTY ([]) for home. REQUIRED — always an array (F5408). */
  scroll: OriginScrollLane[];
  // NO origin-anchor field. The old childAnchor slot-threading died with the re-push machinery
  // (entries survive pops now), and the replacement — a departing scene PUBLISHING its own anchor
  // via the origin live-state registry, the way `scroll` and `segment` do — has not landed. The
  // axis lives in the design doc (S-D/EntityLink) until it has a publisher: an optional field with
  // zero writers sat inside the dismiss RICHNESS gate, where any future producer setting it would
  // have silently flipped the golden-guarded degenerate home restore into the rich branch (F5407).
  // Re-add it WITH its publisher and WITH a richness-gate case, never ahead of them.
  // D56 — THE SEVENTH FIELD (findings F1500-F1516). "The map returns to the EXACT position
  // where the search flow was triggered" is the same law as "the sheet returns to the exact
  // presentation it departed from", one plane over — so it is the same snapshot, taken at the
  // same instant, at the same chokepoint. Before D56 the camera lived in FOUR uncoordinated
  // ledgers (a session slot keyed off committedBounds — null by design for list entries; the
  // profile `savedCamera`; a stale idle-only tracker; a dismiss-time capture) that unwound
  // OPPOSITE to the sheet. On the entry, the camera inherits the stack: nesting, per-pop
  // restore, and "add a source = captureOrigin + route/params" all fall out for free.
  //
  // Shape is the RICHER of the two dead ledgers (the profile's padded CameraSnapshot), so a
  // profile pop keeps its band-centering. `null` = no camera was knowable at capture (no
  // viewport event yet, or no port registered) — restore then does nothing, never guesses.
  //
  // CAPTURED ONLY AT PUSH COMMIT. A dismiss-time origin build (buildCurrentOriginSnapshot)
  // pins this to null on purpose: an origin is captured at DEPARTURE, never at RETURN, and a
  // camera on that lane would fly the map to the place it is already leaving. Pans AFTER the
  // trigger do NOT move the target (owner law, verbatim: "the exact position where the search
  // flow was triggered").
  camera?: CameraSnapshot | null;
};
