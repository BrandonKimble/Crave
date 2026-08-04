// ─── THE INTERRUPT AXIS (G-INTERRUPT, R6 / amendment A5) ─────────────────────
//
// A5's finding: promoteAtLeast must resolve against the SPRING TARGET, not the
// instantaneous posture. Mid-flight, τ is between detents and a ±2pt read
// misclassifies — an in-flight expand read as 'collapsed' lets promoteAtLeast
// issue a second (redundant or DEMOTING) command against a sheet already on
// its way. The rules, pure and falsifiable:
//
//   • FINGER FIRST (THE FINGER OWNS TAU): while the user is dragging there is
//     no machine target — any prior in-flight target is dead the moment the
//     finger lands, and reads answer from the live posture.
//   • IN-FLIGHT: a live programmatic spring's TARGET is the answer. The sheet
//     WILL be there; policy composed against anything else double-commands.
//   • AT REST: classify the instantaneous posture against the detents.
//   • BETWEEN DETENTS at rest (no target, no drag): the sheet is mid-rubber or
//     recovering — report the NEAREST detent below the read tolerance rule
//     used everywhere else ('collapsed' fallback preserved from the host's
//     original read, so promoteAtLeast still promotes from an indeterminate
//     posture rather than refusing).

export type TrackSnapTargetRead = 'expanded' | 'middle' | 'collapsed';

export const classifyRestingPosture = (args: {
  posture: number;
  trackH: number;
  middleTau: number;
  epsilon?: number;
}): TrackSnapTargetRead => {
  const epsilon = args.epsilon ?? 2;
  if (Math.abs(args.posture - args.trackH) <= epsilon) {
    return 'expanded';
  }
  if (Math.abs(args.posture - args.middleTau) <= epsilon) {
    return 'middle';
  }
  return 'collapsed';
};

/** The one read policy consults (resolveCurrentSnapTarget). */
export const resolveSnapTargetForRead = (args: {
  /** The live programmatic spring's destination, null when none is in flight. */
  inFlightTarget: TrackSnapTargetRead | null;
  /** True while a finger owns τ — kills any machine target for this read. */
  dragging: boolean;
  posture: number;
  trackH: number;
  middleTau: number;
}): TrackSnapTargetRead => {
  if (!args.dragging && args.inFlightTarget != null) {
    return args.inFlightTarget;
  }
  return classifyRestingPosture(args);
};
