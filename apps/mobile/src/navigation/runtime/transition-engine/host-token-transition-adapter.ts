// Transition Engine — HOST TOKEN ADAPTER (Phase 2 live cutover, step 2).
//
// The four-lane player (transition-lane-player.ts) is built to be driven IMPERATIVELY from a reveal
// call site with a velocity. But this codebase's transition system is SNAPSHOT/TOKEN-driven: the
// reveal call sites mutate route state; app-route-sheet-host-authority-controller computes
// outgoing/incoming/contentTransitionToken; the host's layout-effect reacts to the token bump. The
// host therefore does NOT know the rich call-site Intent — it only has the (outgoing, incoming)
// scene-key pair.
//
// This adapter bridges that gap: it derives a TransitionDescriptor for the host-owned player from
// just the (outgoing, incoming) scene keys + the live source detent. It is intentionally MINIMAL —
// for the live cutover the player drives ONLY the content + header lanes (NOT sheet-Y, which stays
// authoritatively driven by the kept spring runtime — no double-driver; NOT the camera, Phase 4).
// So the only descriptor fields the host-owned player actually reads are content.swap (the content
// mode) and (for the lane styles) the leg roles. sheet.from/to are set equal (the player's sheet-Y
// lane is NOT mounted), and map/chrome are 'preserve' so the player never moves them.
//
// The content mode is the owner's default (relayed): HARD (immediate swap, paint-ack-gated) for the
// sliding/seeded reveals (the slide masks it) — pollDetail / profile / restaurant; HELD-DISSOLVE for
// the non-seedable results scene (search) — hold the outgoing opaque until the incoming paints, then
// dissolve. This is the per-INCOMING-scene mode map; it matches the §4 permutation table's "mode"
// column for the 5 key reveals routed in this phase.

import {
  PRESERVE_ROUTE_SCENE_SWITCH_CAMERA_INTENT,
  PRESERVE_ROUTE_SCENE_SWITCH_CHROME_TARGET,
} from '../app-overlay-route-transition-contract';
import { DEFAULT_TRANSITION_SPRING_CONFIG } from './transition-lane-player';
import type { OverlayKey } from '../../../overlays/types';
import type {
  ContentMode,
  TransitionDescriptor,
  TransitionDetent,
} from './transition-descriptor-contract';

const HELD_DISSOLVE: ContentMode = { mode: 'held-dissolve', threshold: [0, 1] };
const HARD: ContentMode = { mode: 'hard' };

// Per-INCOMING-scene content mode. The non-seedable RESULTS scene ('search' — the results list, which
// cannot seed believable rows) holds-dissolves; every seedable destination (profile / restaurant /
// pollDetail) hard-swaps on paint-ack (the slide masks the swap, owner default). Any scene not listed
// falls back to HARD (immediate, paint-ack-gated) — the safe default (never a see-through fade,
// always gated on the incoming actually painting).
const CONTENT_MODE_BY_INCOMING_SCENE: Partial<Record<OverlayKey, ContentMode>> = {
  search: HELD_DISSOLVE, // results list (non-seedable) — hold outgoing, paint-gate, dissolve
  profile: HARD, // restaurant/dish profile (direct-seed) — immediate, gated
  restaurant: HARD,
  pollDetail: HARD, // poll-open / autocomplete-poll (skeleton frame-1) — immediate, gated
};

export const resolveHostTokenContentMode = (incomingSceneKey: OverlayKey): ContentMode =>
  CONTENT_MODE_BY_INCOMING_SCENE[incomingSceneKey] ?? HARD;

// Derive the descriptor the host-owned player plays from the (outgoing, incoming) pair the host has.
// sheet.from == sheet.to: the player's sheet-Y lane is NOT mounted in this phase (translateY stays
// with the kept spring runtime — no double-driver). map/chrome 'preserve': the player never moves
// them. Only content.swap (the mode) and the leg roles are load-bearing for the cutover.
export const deriveHostTokenDescriptor = (
  outgoingSceneKey: OverlayKey,
  incomingSceneKey: OverlayKey,
  liveDetent: TransitionDetent
): TransitionDescriptor => ({
  trigger: 'press-up',
  clock: { type: 'spring', config: DEFAULT_TRANSITION_SPRING_CONFIG },
  // sheet-Y lane NOT mounted this phase — from==to so even if read it is a no-op (kept spring owns Y).
  sheet: { from: liveDetent, to: liveDetent },
  content: {
    out: { sceneKey: outgoingSceneKey },
    in: { sceneKey: incomingSceneKey },
    swap: resolveHostTokenContentMode(incomingSceneKey),
  },
  map: {
    from: PRESERVE_ROUTE_SCENE_SWITCH_CAMERA_INTENT,
    to: PRESERVE_ROUTE_SCENE_SWITCH_CAMERA_INTENT,
  },
  chrome: {
    from: PRESERVE_ROUTE_SCENE_SWITCH_CHROME_TARGET,
    to: PRESERVE_ROUTE_SCENE_SWITCH_CHROME_TARGET,
    threshold: [0, 1],
  },
  origin: {
    sceneKey: outgoingSceneKey,
    snap: liveDetent,
    camera: PRESERVE_ROUTE_SCENE_SWITCH_CAMERA_INTENT,
    chrome: PRESERVE_ROUTE_SCENE_SWITCH_CHROME_TARGET,
  },
});
