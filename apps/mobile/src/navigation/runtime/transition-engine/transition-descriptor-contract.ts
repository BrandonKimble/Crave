// Transition Engine — the DESCRIPTOR (§3.5 of plans/transition-engine-final-master-plan.md).
//
// A transition is DATA. The host-owned player (transition-lane-player.ts) plays a descriptor on a
// single token-driven settle ramp; the host reads the content mode. Those two facts are the WHOLE
// live contract, and this module is now exactly that size.
//
// WHAT WAS HERE AND IS GONE (F907, deletion by proof — repo-wide `grep -rn "descriptor\."` found
// exactly TWO reads anywhere: `descriptor.clock.config` in the player and
// `deriveHostTokenDescriptor(...).content.swap` in the host). The descriptor also declared
// trigger / sheet / map / chrome / origin: constructed on every transition, read by nobody. They
// were scaffolding for a Phase-2/4 plan (sheet-Y + camera lanes) that the plan itself records as
// never wired, and whose surrounding machinery had already been removed once. A descriptor carries
// what a player plays; when the sheet-Y or camera lanes are actually built, they come back WITH
// their player.
//
// `TransitionDetent` went with them — it existed only to type `sheet`/`origin`, and
// `deriveHostTokenDescriptor`'s third parameter, which BOTH call sites passed the literal
// 'middle' (a parameter that could never vary).

// ── THE CONTENT MODE (F906) ────────────────────────────────────────────────────────
// There is ONE content law: the paint-ack-gated HARD SWAP. Pre-mount the incoming offscreen and
// gate the VISIBLE swap on a single paint-ack; motion lanes are NOT gated (the sheet slides on
// press-up, content appears a frame later inside the already-moving opaque sheet). Drop-proof.
//
// This used to be a three-variant union (`hard` | `held-dissolve` | `instant-on-paint-ack`) with a
// per-incoming-scene lookup table selecting between them. Every row of that table resolved to the
// SAME `hard` object, the lookup fell back to `hard`, and the player ignored the mode parameter
// entirely — so deleting the whole apparatus and returning `hard` unconditionally was provably a
// zero-observable-change edit (each variant's behaviour was already identical: the cross-dissolve
// was retired in favour of skeleton-first hard-swap, see transition-lane-player.ts's header).
// A union whose variants cannot differ is not an extension point, it is three names for one thing.
// The real extension point is honest and cheap: if a scene ever needs non-hard content, the mode
// becomes a union again AT THE POINT a player can play it.
export type ContentMode = { mode: 'hard' };

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

// The descriptor: the ONE settle ramp the played lanes share, plus the content law.
export type TransitionDescriptor = {
  clock: { type: 'spring'; config: TransitionSpringConfig };
  content: { swap: ContentMode };
};
