#ifndef TrackDomainRange_h
#define TrackDomainRange_h

#include <math.h>

// ─── THE DOMAIN AUTHORITY ────────────────────────────────────────────────────
//
// τ has exactly ONE legal domain: [-insetTop, contentH + insetBottom − viewport].
// Five partial writers used to compute fragments of it — the contentSize
// prior-grow, the range law, the posture ceiling, and the two clamp filters —
// each holding partial knowledge of the state the domain depends on. Partial
// knowledge is why they disagreed: the ceiling froze insetBottom at drag begin
// while maxOffset depends on the SUM contentH + insetBottom, so a recycler
// growing content mid-drag re-opened the escape the ceiling exists to close;
// and the range law SET insetBottom, so any external owner of that scalar was
// clobbered by a writer that never knew it existed.
//
// This function is the domain. It is pure (numbers in, insets out), it takes
// COMPLETE state, and it is invoked synchronously from every input that can
// change the domain: contentSize (both KVO phases), drag begin/end, excursion
// arm/close, sigma stash/dissolve, shell configuration, external-baseline
// registration, and the clamp backstops' repair. Nothing else may write
// contentInset on the track's scroll view.
//
// Two constraints are structural rather than guarded:
//   (1) under a posture drag the ceiling is recomputed from the LIVE contentH,
//       so maxOffset ≡ boundary for the whole drag in both directions;
//   (2) the external bottom baseline is an INPUT composed by max(), never
//       inferred and never overwritten — the engine states its own need and
//       the larger of the two wins.

typedef enum {
  /// The contentSize KVO PRIOR notification: contentH is about to change and
  /// its new value is unknowable here. UIKit clamps τ WHILE processing the
  /// change, so this phase is PREVENTION only — grow the bottom inset to cover
  /// the current τ against ANY new content height, never shrink it. The
  /// settled phase that follows the same transaction tightens to the exact
  /// domain.
  TrackDomainPhasePrior = 0,
  /// Every other input change: contentH is truth and the domain is exact.
  TrackDomainPhaseSettled = 1,
} TrackDomainPhase;

typedef struct {
  double contentH;
  double viewport;
  /// The shell's track height H — the reach term's geometry.
  double trackH;
  /// The EFFECTIVE list-top boundary in τ-space (ballisticEdge + σ). Passed
  /// rather than derived: the ceiling is the boundary the drag law uses, and
  /// the reach term is the shell's geometry — conflating the two would make
  /// the ceiling depend on which of the two H's the caller happened to hold.
  double boundary;
  /// The stash σ, retained for callers that reason about it; the boundary
  /// above already includes it.
  double sigma;
  double tau;
  double insetTopNow;
  double insetBottomNow;
  /// Registered by the owner of the bottom inset outside the engine (keyboard
  /// avoidance, a reachability baseline). 0 when nobody has registered.
  double externalBottomBaseline;
  /// τ-space excursion target (negative); meaningful only while engaged.
  double hiddenTargetTau;
  int postureDragActive;
  int hiddenEngaged;
  int shellEnabled;
  TrackDomainPhase phase;
} TrackDomainState;

typedef struct {
  double insetTop;
  double insetBottom;
} TrackDomainInsets;

static inline double TrackDomainMax(double a, double b) { return a > b ? a : b; }

static inline TrackDomainInsets TrackDomainLegalRange(TrackDomainState s)
{
  TrackDomainInsets out;

  // ── THE FLOOR (the hidden domain, R4) ────────────────────────────────────
  // UIScrollView cannot rest below −insetTop, so the excursion's depth IS the
  // top inset for the excursion's lifetime. The floor is present iff an
  // excursion is engaged — with ONE addition the old per-path writers each had
  // to remember separately: a τ that is already negative keeps its own floor
  // regardless of engagement, because collapsing the domain under a sheet that
  // is off-screen clamps it back on screen in a single frame.
  const double excursionNeed = s.hiddenEngaged ? -s.hiddenTargetTau : 0.0;
  const double belowNeed = s.tau < -0.5 ? -s.tau : 0.0;
  const double floorNeed = TrackDomainMax(excursionNeed, belowNeed);
  // The engine claims the top inset only where it has a domain reason to. An
  // unconfigured track (no shell, τ on screen, no excursion) has no floor to
  // state, and stating one anyway would silently zero an inset somebody else
  // owns — the very failure this authority exists to end, mirrored to the
  // other edge.
  const int engineOwnsFloor = s.shellEnabled || s.hiddenEngaged || s.tau < -0.5;
  out.insetTop = engineOwnsFloor ? (floorNeed > 0.0 ? ceil(floorNeed) : 0.0)
                                 : s.insetTopNow;

  // ── THE CEILING ──────────────────────────────────────────────────────────
  if (s.phase == TrackDomainPhasePrior) {
    // Grow-only: τ + viewport covers τ against any new content height.
    out.insetBottom = TrackDomainMax(
        s.insetBottomNow,
        TrackDomainMax(ceil(s.tau + s.viewport), s.externalBottomBaseline));
    return out;
  }

  if (s.postureDragActive) {
    // THE POSTURE CEILING. A header drag moves the SHEET only, so maxOffset
    // must equal the effective boundary exactly: maxOffset = contentH +
    // insetBottom − viewport ⇒ insetBottom = boundary + viewport − contentH.
    // Signed on purpose (negative for tall content). Recomputed from the live
    // contentH on every input change, which is the whole reason mid-drag
    // content growth can no longer lift the ceiling and mid-drag shrink can no
    // longer build a wall below it.
    // The external baseline is NOT composed here: while the engine holds a
    // ceiling it owns the scalar outright, and drag end re-enters this function
    // in the settled phase, which restores the baseline in the same call.
    out.insetBottom = s.boundary + s.viewport - s.contentH;
    return out;
  }

  if (!s.shellEnabled) {
    // No engine need is expressible without the shell geometry; the baseline
    // still is.
    out.insetBottom = TrackDomainMax(s.insetBottomNow, s.externalBottomBaseline);
    return out;
  }

  // THE RANGE LAW. The domain must cover [0, trackH] — every posture legal ⇒
  // every seat reachable by construction — AND the current τ, so a content
  // swap can never move the sheet.
  const double reach = TrackDomainMax(0.0, s.viewport - (s.contentH - s.trackH));
  const double keep = TrackDomainMax(0.0, s.tau - (s.contentH - s.viewport));
  out.insetBottom =
      TrackDomainMax(ceil(TrackDomainMax(reach, keep)), s.externalBottomBaseline);
  return out;
}

#endif /* TrackDomainRange_h */
