// ─── THE HANDOFF RELEASE DECISION (strip choreography fix 2b, 2026-08-08) ────
//
// The press-up handoff (track-entry-handoff.ts) withholds the destination's real
// body from the flip commit. WHEN the withheld body is allowed to replace the
// handoff frame's skeleton/frozen paint used to be a bare "next rAF" — a CLOCK,
// not a fact. The reveal law (transition-endstate-contract.md, OA9/OA11 era)
// states the fact that actually governs it: the skeleton persists until the
// commit that can paint the destination's content; the rAF exists ONLY to
// guarantee the flip frame reached the screen first.
//
// Two facts, both required:
//
//   flipHasPainted           — the paint boundary after the flip commit passed
//                              (the rAF fired). Releasing earlier would render
//                              the expensive body inside the finger's frame —
//                              the exact defect the handoff exists to prevent,
//                              and the expensive-body falsifier's subject.
//   destinationResolutionReady — the destination has a concrete body resolution
//                              THIS commit (isResolutionReady). The handoff only
//                              ever arms when the destination had real rows, but
//                              a publication can be withdrawn inside the handoff
//                              window (staleTime-0 refetch churn); releasing
//                              into a 'none' resolution would swap the armed
//                              handoff paint for the resolver's equivalent — a
//                              pointless identity change at best, a seam at
//                              worst. Ready-with-zero-rows still releases: a
//                              declared empty face is the scene SPEAKING
//                              (track-entry-readiness.ts), i.e. content.
//
// RN-free on purpose (pure jest lane).

export type TrackHandoffReleaseFacts = {
  /** The rAF scheduled at the flip commit has fired — the flip frame painted. */
  flipHasPainted: boolean;
  /** isResolutionReady(destination resolution) at release-attempt time. */
  destinationResolutionReady: boolean;
};

/** True exactly when the deferred real body may replace the handoff paint. */
export const planTrackHandoffRelease = (facts: TrackHandoffReleaseFacts): boolean =>
  facts.flipHasPainted && facts.destinationResolutionReady;
