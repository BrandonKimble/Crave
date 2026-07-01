// Transition Engine — the HOST-OWNED SETTLE-RAMP PLAYER.
//
// IMPORTANT (degenerate-player reality, read before tuning the spring): this player no longer
// drives any visible MOTION. The reveals are HARD-SWAPS gated on a single paint-ack — the body and
// header both flip in ONE frame the moment the incoming scene paints (resolveContentLaneOpacities /
// resolveHeaderSwap gate ONLY on `paintAck`, never on the ramp value). The `settleRamp` spring
// drives ZERO visible pixels; its sole job is to TIME the `onSettle` callback (it fires from the
// withSpring `onFinish`). So:
//   • Tuning the spring config changes settle TIMING (when onSettle fires), NOT motion/feel.
//   • All three ContentModes are degenerate hard-swaps (held-dissolve == hard — the cross-dissolve
//     was retired in favor of skeleton-first hard-swap). The union is kept for descriptor shape
//     stability; behavior is identical across modes.
//   • The sheet-Y translate stays authoritatively driven by the kept spring runtime (NOT this
//     player — no double-driver); map/chrome are 'preserve' (the player never moves them).
//
// This player is the live reveal driver: BottomSheetSceneStackHost owns one instance and
// token-triggers `start(descriptor, 0, onSettle)` on each forward open / dismiss. The host wires
// resolveContentLaneOpacities (body) + resolveHeaderSwap (header/plate) into the page-frame z-layers.

import * as React from 'react';
import {
  type SharedValue,
  cancelAnimation,
  runOnJS,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type {
  ContentMode,
  TransitionDescriptor,
  TransitionSpringConfig,
} from './transition-descriptor-contract';

// ── The single resolved spring config ─────────────────────────────────────────
// Near-critical damping + overshootClamping. Since the ramp drives no visible pixels this only
// affects HOW LONG until onSettle fires (the morph's nominal settle time), not feel.
export const DEFAULT_TRANSITION_SPRING_CONFIG: TransitionSpringConfig = {
  // Near-critical: damping ≈ 2·√(stiffness·mass) ≈ 2·√220 ≈ 29.7 → damping 28 is ~0.94 ratio,
  // with overshootClamping. Tunes settle TIMING only (the ramp is invisible).
  stiffness: 220,
  damping: 28,
  mass: 1,
  overshootClamping: true,
  energyThreshold: 6e-9,
};

// ── The content lane ───────────────────────────────────────────────────────────
// The two outputs are the OUTGOING and INCOMING BODY-region opacities, ALWAYS over the constant
// frost backing. A `paintAck` shared value (0 until the incoming emits its first real paint, 1
// after) gates the visible commit — and is the ONLY thing these lanes read.
//
// HEADER vs BODY SPLIT (sheet-frost-architecture, owner hard requirement). Each scene is two
// regions, treated DIFFERENTLY:
//   • HEADER region = the toggle strip + the close button + THEIR CUTOUTS. SWAP IMMEDIATELY between
//     scenes — NO fade, one frame (resolveHeaderSwap, gated on paintAck). It is always the REAL
//     current scene's header, so its cutouts are always correct and always reveal the constant
//     frosted-map — zero transition-cutout coordination, zero scroll-tracking.
//   • BODY region = everything below the header. Hard-swapped on the paint-ack over the constant
//     frost (resolveContentLaneOpacities).
// The content lane NEVER touches the CONSTANT FROST backing (opacity 1.0) NOR the per-scene WHITE
// PLATE WITH CUTOUTS (which stays opaque — hard-swapped between scenes, never dissolved).
// BottomSheetSceneStackPageFrame renders header / background-plate / body as distinct z-layers.
export type ContentLaneOpacities = {
  outgoing: number;
  incoming: number;
};

// Pure worklet: BODY-region hard-swap opacities. Applied ONLY to the body layer (NOT the header,
// NOT the plate, NOT the frost). Hold the OUTGOING body opaque until the paint-ack (no blank frame,
// no see-through to the map while the incoming's first frame paints), then swap to the incoming in
// ONE frame on the single ack. The incoming first frame is the scene's seeded shell / skeleton, so
// the swap lands on structure, never a blank list. All ContentModes behave identically (degenerate).
export const resolveContentLaneOpacities = (
  _ramp: number,
  paintAck: number,
  _mode: ContentMode
): ContentLaneOpacities => {
  'worklet';
  if (paintAck < 0.5) {
    return { outgoing: 1, incoming: 0 };
  }
  return { outgoing: 0, incoming: 1 };
};

// Pure worklet: HEADER-region instant swap. The header NEVER cross-dissolves — it is the real
// current scene's header (with its real cutouts). Before the paint-ack the OUTGOING header is shown
// (1/0); on the single ack it swaps to the INCOMING header in one frame (0/1). No intermediate
// opacity, ever — so the cutouts are always crisp and always reveal the frosted-map.
export const resolveHeaderSwap = (paintAck: number): ContentLaneOpacities => {
  'worklet';
  return paintAck < 0.5 ? { outgoing: 1, incoming: 0 } : { outgoing: 0, incoming: 1 };
};

// ── withSpring config bridge ───────────────────────────────────────────────────
// Reanimated withSpring accepts the structural fields directly; we pass through + inject velocity.
const toReanimatedSpringConfig = (
  config: TransitionSpringConfig,
  velocity: number
): Parameters<typeof withSpring>[1] => {
  'worklet';
  return {
    stiffness: config.stiffness,
    damping: config.damping,
    mass: config.mass,
    overshootClamping: config.overshootClamping,
    energyThreshold: config.energyThreshold,
    velocity,
  };
};

// ── The player hook ─────────────────────────────────────────────────────────────
// Owns ONE `settleRamp` shared value (the invisible 0→1 timer) + the `paintAck` gate, and exposes:
//   • `settleRamp` / `paintAck` (read by the lane worklets / derived styles a consumer composes).
//     NOTE: `settleRamp` drives NO visible pixels — it only times `onSettle` via withSpring onFinish.
//   • `start(descriptor, velocity, onSettle)` — the press-up fan-out: start the ONE ramp spring;
//     onSettle runs on ramp-end (the morph's nominal settle).
//   • `markPaintAck()` — the SINGLE paint-ack that gates the content/header visible-commit.
//   • `seize()` — interruption: cancel the live ramp so a new gesture re-targets from where it is.
export type TransitionLanePlayer = {
  settleRamp: SharedValue<number>;
  paintAck: SharedValue<number>;
  start: (descriptor: TransitionDescriptor, velocity: number, onSettle?: () => void) => void;
  markPaintAck: () => void;
  seize: () => void;
};

export const useTransitionLanePlayer = (): TransitionLanePlayer => {
  // The invisible settle timer. 0 = source state, 1 = target state. Drives NO pixels (see header).
  const settleRamp = useSharedValue(0);
  // The single paint-ack gate. 0 until the incoming scene emits its first real paint; 1 after.
  // Gates ONLY the content/header visible-commit; nothing reads the ramp for visuals.
  const paintAck = useSharedValue(0);

  const start = React.useCallback<TransitionLanePlayer['start']>(
    (descriptor, velocity, onSettle) => {
      // Press-up fan-out: reset the gate + ramp, then start the ONE spring whose ONLY effect is to
      // fire onSettle at ramp-end. The visible swap happens separately on the paint-ack.
      paintAck.value = 0;
      cancelAnimation(settleRamp);
      settleRamp.value = 0;
      const config = toReanimatedSpringConfig(descriptor.clock.config, velocity);
      const onFinished = onSettle;
      settleRamp.value = withSpring(1, config, (finished) => {
        'worklet';
        // Finalize on the morph's settle (ramp-end). A seize/restart cancels this animation
        // (finished=false), so a superseded ramp never finalizes.
        if (finished && onFinished != null) {
          runOnJS(onFinished)();
        }
      });
    },
    [settleRamp, paintAck]
  );

  const markPaintAck = React.useCallback(() => {
    // Flip the gate so the content + header lanes commit the incoming in one frame.
    paintAck.value = 1;
  }, [paintAck]);

  const seize = React.useCallback(() => {
    // Interruption: freeze the live ramp so a new gesture re-targets from the current value rather
    // than the nominal endpoints. cancelAnimation leaves `settleRamp.value` where it is.
    cancelAnimation(settleRamp);
  }, [settleRamp]);

  return { settleRamp, paintAck, start, markPaintAck, seize };
};
