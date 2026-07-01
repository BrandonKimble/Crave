// Transition Engine — the DESCRIPTOR (§3.5 of plans/transition-engine-final-master-plan.md).
//
// A transition is DATA: one descriptor row per flow. The host-owned player (transition-lane-player.ts)
// plays a descriptor's content + header lanes on a single token-driven settle ramp. The LIVE consumers
// of this module are only the host-token adapter (deriveHostTokenDescriptor) which builds a descriptor
// from the (outgoing, incoming) scene pair, and the player which reads content.swap + the leg roles.
//
// SCOPE: this module is trimmed to the types those two consumers actually use — `TransitionDetent`,
// `ContentMode`, `TransitionSpringConfig`, and `TransitionDescriptor` (with its sub-shapes inlined).
// The Phase-2 scaffolding (`inverse()`, `descriptorEmitsNoMotion()`, and the standalone
// TransitionSceneRef/TransitionCameraState/TransitionChromeState/TransitionOriginRef/
// TransitionChildAnchor type aliases) was never wired and has been removed; the dismiss path is the
// existing policy runtime's byte-identical idle commit, NOT a descriptor `inverse`.

import type { BottomSheetSnap } from '../../../overlays/bottomSheetMotionTypes';
import type { OverlayKey } from '../../../overlays/types';
import type {
  RouteSceneSwitchCameraIntent,
  RouteSceneSwitchChromeVisibilityTarget,
} from '../app-overlay-route-transition-contract';

// A detent is a snap target. We reuse the real BottomSheetSnap union (expanded|middle|collapsed|
// hidden). The descriptor never targets 'hidden' (I1 — never `{kind:'hide'}` to nothing); a
// dismiss targets the ORIGIN detent, not 'hidden'.
export type TransitionDetent = Exclude<BottomSheetSnap, 'hidden'>;

// The content lane has THREE modes (§3.4, red-team MUST-FIX A/B — not two):
//  - `hard`: seedable scene. Pre-mount the incoming offscreen; gate the VISIBLE swap on a single
//    paint-ack. Motion lanes are NOT gated — the sheet slides on press-up, content appears a frame
//    later inside the already-moving opaque sheet. Drop-proof.
//  - `held-dissolve`: non-seedable scene (results). Hold the OUTGOING content fully opaque until
//    the incoming emits its first paint-ack, THEN content-only dissolve incoming over the still-
//    opaque backing across `threshold` (~150–200ms). `preserveOutgoingUntilSettle` done correctly.
//  - `instant-on-paint-ack`: degenerate `hard` (no outgoing to hold). Same single paint-ack gate.
//
// NOTE: all three modes are TODAY degenerate hard-swaps (held-dissolve == hard) — the cross-dissolve
// was retired in favor of skeleton-first hard-swap (see transition-lane-player.ts header). The union
// is kept for descriptor shape stability; the player gates on paintAck regardless of mode.
export type ContentMode =
  | { mode: 'hard' }
  | { mode: 'held-dissolve'; threshold: [number, number] }
  | { mode: 'instant-on-paint-ack' };

// A near-critical spring config for the ONE settle-ramp driver. dampingRatio ~0.9 +
// overshootClamping so the ramp never overshoots (§3.4). Tunable per owner Q4.
export type TransitionSpringConfig = {
  // Reanimated withSpring PHYSICAL-variant config fields used by the player. Kept structural (not
  // importing the Reanimated type) so the descriptor module has no native dependency. This is the
  // {stiffness, damping, mass} variant (NOT the {duration, dampingRatio} variant — Reanimated's
  // SpringConfig is an XOR union of the two); near-critical damping is expressed via damping.
  stiffness?: number;
  damping?: number;
  mass?: number;
  overshootClamping?: boolean;
  energyThreshold?: number;
};

// The descriptor (§3.5). trigger is ALWAYS 'press-up' (I3 — the sole trigger). The clock is ONE
// settle ramp shared by the played lanes. sheet `from==to` ⇒ the sheet stays put (no-op; the player's
// sheet-Y lane is not mounted — the kept spring runtime owns translateY). map/chrome stay 'preserve'
// (the player never moves them in this phase). The sub-shapes are inlined (they have no other
// consumer) so the descriptor is self-contained.
export type TransitionDescriptor = {
  trigger: 'press-up';
  clock: { type: 'spring'; config: TransitionSpringConfig };
  sheet: { from: TransitionDetent; to: TransitionDetent };
  content: {
    out: { sceneKey: OverlayKey; seedParams?: unknown } | null;
    in: { sceneKey: OverlayKey; seedParams?: unknown };
    swap: ContentMode;
  };
  map: { from: RouteSceneSwitchCameraIntent; to: RouteSceneSwitchCameraIntent };
  chrome: {
    from: RouteSceneSwitchChromeVisibilityTarget;
    to: RouteSceneSwitchChromeVisibilityTarget;
    threshold: [number, number];
  };
  origin: {
    sceneKey: OverlayKey;
    snap: TransitionDetent;
    scrollOffset?: number;
    camera: RouteSceneSwitchCameraIntent;
    chrome: RouteSceneSwitchChromeVisibilityTarget;
  };
};
