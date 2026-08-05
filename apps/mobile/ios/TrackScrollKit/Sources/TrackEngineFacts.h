#ifndef TrackEngineFacts_h
#define TrackEngineFacts_h

#include <math.h>
#include <stddef.h>

// ─── THE ENGINE'S OWN FACTS ──────────────────────────────────────────────────
//
// Three pieces of arithmetic the ENGINE knows and JS was re-deriving. Each one
// was a copy of native state living on the other side of the bridge, and a copy
// is a thing that can be stale:
//
//   (1) WHEN MOTION ENDS. The spring has a closed form and knows the frame it
//       completes; JS INFERRED settle by sampling τ for two-frame stability
//       within 2pt of a detent. That inference had two structural holes — a
//       rest at a NON-detent (the hidden domain, a clamp, a content swap that
//       parked τ between detents) never produced a fact at all, and a return to
//       the SAME detent was suppressed by the one-shot the sampler needed to
//       avoid re-firing. Both holes are inference artifacts: the engine has no
//       trouble saying "I stopped".
//
//   (2) WHERE THE SCREEN EDGE IS. The hidden excursion's depth was computed in
//       JS from Dimensions.get('window') read at command time — a module-scope
//       snapshot on one side and live UIKit bounds on the other. That is
//       G-ROTATE's staleness with a specific address: a rotation (or any
//       bounds change) leaves JS commanding a pixel target derived from the
//       PREVIOUS screen. The engine holds the shell geometry it was bound with
//       and the live window; it can state the depth itself, so JS commands the
//       INTENT ('hidden') and never a pixel.
//
//   (3) WHAT CONTRACT THIS BINARY SPEAKS. A JS bundle newer than the installed
//       binary calls methods that are not there and waits on events that never
//       arrive — silently. The version below is the handshake; see the JS side
//       (track-native-contract.ts) for the verdict law.
//
// Pure by construction (numbers in, facts out) so the host-compiled C suite can
// falsify them without a simulator — the TrackDomainRange precedent.

/// THE NATIVE CONTRACT VERSION. BUMP THIS whenever the shape JS depends on
/// changes: a method's signature or resolve payload, an event name or body, a
/// capability added or removed. Version 1 is the historical UNVERSIONED
/// contract (promise-returning snapTo, generation-stamped edge events,
/// setExternalBottomInset) — a binary that predates the handshake exports no
/// version at all and is diagnosed by ABSENCE. Version 2 adds the settle event
/// and the hidden INTENT command.
#define TRACK_SCROLL_CONTRACT_VERSION 2

/// The τ excursion below collapsed that puts the sheet's top edge exactly on the
/// bottom screen edge. sheetTop(τ) = expandedTop + (trackH + σ − τ), so at
/// τ = 0 the sheet top is collapsedTop = expandedTop + trackH and the remaining
/// band is screenH − collapsedTop. Never negative: a collapsedTop already below
/// the screen has nothing left to travel. σ cancels by algebra — snapTo input is
/// posture-space and native adds σ back — so it is deliberately absent here.
static inline double TrackHiddenDepthForBounds(double expandedTop, double trackH, double screenH)
{
  const double depth = screenH - (expandedTop + trackH);
  return depth > 0.0 ? depth : 0.0;
}

/// The posture-space target of a hidden excursion: the depth, below collapsed.
static inline double TrackHiddenPostureTargetForBounds(double expandedTop,
                                                       double trackH,
                                                       double screenH)
{
  return -TrackHiddenDepthForBounds(expandedTop, trackH, screenH);
}

typedef struct {
  /// τ − σ: the sheet's posture, the space detents and seats are expressed in.
  double posture;
  /// 1 iff the rest landed within epsilon of a declared detent. A rest that is
  /// NOT at a detent is still a settle — it is simply not posture memory.
  int atDetent;
  /// The detent this rest belongs to; meaningless unless atDetent.
  double detentTau;
} TrackSettleReading;

/// Classify a rest. The engine reports the fact unconditionally; whether the
/// rest happens to sit on a detent is DATA in the fact, never a precondition
/// for emitting it — that conflation is exactly what made a hidden rest (and a
/// clamped rest, and a mid-detent park) invisible to JS.
static inline TrackSettleReading TrackResolveSettleReading(double tau,
                                                           double sigma,
                                                           const double *detents,
                                                           int detentCount,
                                                           double epsilon)
{
  TrackSettleReading out;
  out.posture = tau - sigma;
  out.atDetent = 0;
  out.detentTau = 0.0;
  if (detents == NULL || detentCount <= 0) {
    return out;
  }
  double bestDistance = 0.0;
  for (int i = 0; i < detentCount; i++) {
    const double distance = fabs(detents[i] - out.posture);
    if (distance > epsilon) {
      continue;
    }
    // NEAREST, not first-within-epsilon: two detents can be closer together
    // than the tolerance on a short track, and "the first one that matched"
    // would make the reported detent depend on array order.
    if (!out.atDetent || distance < bestDistance) {
      out.atDetent = 1;
      out.detentTau = detents[i];
      bestDistance = distance;
    }
  }
  return out;
}

#endif /* TrackEngineFacts_h */
