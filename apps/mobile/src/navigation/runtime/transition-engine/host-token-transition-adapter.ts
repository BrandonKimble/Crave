// Transition Engine — HOST TOKEN ADAPTER (Phase 2 live cutover, step 2).
//
// The four-lane player (transition-lane-player.ts) is built to be driven IMPERATIVELY from a reveal
// call site with a velocity. But this codebase's transition system is SNAPSHOT/TOKEN-driven: the
// reveal call sites mutate route state; app-route-sheet-host-authority-controller computes
// outgoing/incoming/contentTransitionToken; the host's layout-effect reacts to the token bump. The
// host therefore does NOT know the rich call-site Intent — it only has the (outgoing, incoming)
// scene-key pair.
//
// This adapter bridges that gap. It is intentionally MINIMAL — for the live cutover the player
// drives ONLY the content + header lanes (NOT sheet-Y, which stays authoritatively driven by the
// kept spring runtime — no double-driver; NOT the camera, Phase 4).
//
// F906/F907, and the reason this file is now a handful of lines: it used to take
// (outgoing, incoming, liveDetent) and build a seven-field descriptor, of which the app read
// exactly two leaves. `liveDetent` was passed the literal 'middle' at both call sites. And the
// content mode came from `CONTENT_MODE_BY_INCOMING_SCENE`, a per-scene table whose every row was
// the SAME `{ mode: 'hard' }` object, consulted through a `?? HARD` fallback, feeding a player
// that ignored the parameter — a table that could not change an outcome, in front of a lookup
// that could not fail, in front of a consumer that did not look. Mutation-proven: delete it all
// and return HARD unconditionally, zero observable change. The content law lives in ONE place now
// (ContentMode in transition-descriptor-contract.ts), which is where a scene that genuinely needs
// different content behaviour would come to argue for a second variant — together with the player
// change that would make the variant mean something.

import { DEFAULT_TRANSITION_SPRING_CONFIG } from './transition-lane-player';
import type { ContentMode, TransitionDescriptor } from './transition-descriptor-contract';

/** THE content law: immediate swap, gated on the incoming scene's single paint-ack. A module
 *  constant, so its identity is stable for free — the host used to keep a `useRef` +
 *  `JSON.stringify` memo key alive purely to stop a freshly-allocated `{ mode: 'hard' }` from
 *  re-minting its ports context on every switch. */
export const HOST_TOKEN_CONTENT_MODE: ContentMode = { mode: 'hard' };

/** The descriptor the host-owned player plays. */
export const deriveHostTokenDescriptor = (): TransitionDescriptor => ({
  clock: { type: 'spring', config: DEFAULT_TRANSITION_SPRING_CONFIG },
  content: { swap: HOST_TOKEN_CONTENT_MODE },
});
