import type {
  OverlayKey,
  OverlayRouteParamsMap,
} from '../navigation/runtime/app-overlay-route-types';
import type { LaunchIntentChildAnchor } from '../navigation/runtime/app-route-types';

export type SearchOverlaySheetSnap = 'expanded' | 'middle' | 'collapsed' | 'hidden';

export type TabOverlaySnap = Exclude<SearchOverlaySheetSnap, 'hidden'>;

// Return-to-origin foundation (plans/return-to-origin-foundation-design.md).
// A reveal = PUSH from an origin; a dismiss = POP back to that EXACT origin. The
// snapshot carries ONLY stable IDs + query-key params (never data, never list
// indices) so restore can RECONSTRUCT a cold panel (skeleton-first, anchor resolves
// to index POST-fetch).
//
// P3+ generalized scroll/anchor shapes. Defined now (the type), wired in later
// phases (P3 scroll, P4 anchor). For P0 these are forward-looking only.
export type OriginScrollLane = {
  laneKey: string;
  /** offset = hint; the anchor wins. NEVER an index. */
  offset: number;
};

// OriginSnapshot REPLACES the old SearchSessionOriginContext ({rootOverlay, tabSnap,
// childAnchor?}). The field rename is a WIDENING, not a semantic change:
//   rootOverlay  → sceneKey
//   tabSnap      → detent
//   childAnchor  → anchor
//
// P0 is pure scaffolding: every current consumer reads the mapped field under its new
// name and the captured origin is byte-equivalent to what createCurrentOriginContext
// produced before. The RICH per-scene providers (real scroll/segment/anchor capture)
// arrive in later phases; for P0 the `anchor` payload is still the existing launch
// child anchor (the only non-null anchor any current path produces), and `scroll` /
// `segment` / `sceneParams` are degenerate.
export type OriginSnapshot = {
  /** TRUE scene identity (search|polls|pollDetail|bookmarks|profile) — NOT root-collapsed. */
  sceneKey: OverlayKey;
  /** {pollId} | {profileUserId,...} | null (home). Degenerate (null) in P0. */
  sceneParams?: OverlayRouteParamsMap[OverlayKey] | null;
  /** LIVE snap at trigger (not hard-coded 'expanded'). */
  detent: TabOverlaySnap;
  /** active sub-tab for segmented scenes (profile). Degenerate (null) in P0. */
  segment?: string | null;
  /** nested-aware; EMPTY for home. Degenerate ([]) in P0. */
  scroll?: OriginScrollLane[];
  // Origin-anchor: the exact comment a cross-surface reveal launched from, threaded from
  // the restaurant/entity LaunchIntent through prepareSearchSessionEntry →
  // captureSearchSessionOrigin. The pollDetail child re-push (resolveChildOriginRePush)
  // reads anchor.sceneKey/pollId/commentId to restore scroll-to + flash. EMPTY for home.
  // Currently typed to the launch child anchor (pollDetail only); a future list-card /
  // comment anchor source widens LaunchIntentChildAnchor.sceneKey rather than this field.
  anchor?: LaunchIntentChildAnchor | null;
};
