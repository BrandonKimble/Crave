// THE ENGINE FACTS' falsifiers — the arithmetic the engine took back from JS.
// Same regime as TrackDomainRangeTests.c: pure C header, host clang, no
// simulator, compiled from the SAME source the app compiles.
//
// Two laws are under test, and both used to live on the other side of the
// bridge where nothing could falsify them:
//   • the hidden depth (was: Dimensions.get('window') at command time);
//   • the settle reading (was: a two-frame τ-stability sampler that could only
//     ever speak about detents).

#include "../Sources/TrackEngineFacts.h"

#include <stdio.h>

static int gFailures = 0;
static int gChecks = 0;

static void expectNear(const char *what, double actual, double expected)
{
  gChecks++;
  const double delta = actual - expected;
  if (delta > 0.5 || delta < -0.5) {
    gFailures++;
    printf("  FAIL %-58s got %.2f want %.2f\n", what, actual, expected);
  }
}

static void expectInt(const char *what, int actual, int expected)
{
  gChecks++;
  if (actual != expected) {
    gFailures++;
    printf("  FAIL %-58s got %d want %d\n", what, actual, expected);
  }
}

// ── THE HIDDEN DEPTH ────────────────────────────────────────────────────────
static void testHiddenDepth(void)
{
  printf("hidden depth from live bounds\n");
  // A 844pt screen, sheet expanded top 100, track 600 ⇒ collapsedTop 700.
  expectNear("depth is the band below collapsed",
             TrackHiddenDepthForBounds(100, 600, 844), 144);
  expectNear("the posture target is the depth, below collapsed",
             TrackHiddenPostureTargetForBounds(100, 600, 844), -144);
  // THE LAW THE JS COPY COULD NOT HOLD: the depth follows the bounds. A
  // rotation (or any bounds change) that a module-scope screen snapshot would
  // have missed lands exactly on the new edge here.
  expectNear("a taller screen deepens the excursion",
             TrackHiddenDepthForBounds(100, 600, 926), 226);
  expectNear("a shorter screen shallows it",
             TrackHiddenDepthForBounds(100, 600, 780), 80);
  // A collapsedTop already at or below the screen edge has nothing left to
  // travel — never a positive target, never a negative depth.
  expectNear("collapsed exactly at the edge needs no excursion",
             TrackHiddenDepthForBounds(100, 744, 844), 0);
  expectNear("collapsed already off-screen clamps to 0",
             TrackHiddenDepthForBounds(100, 900, 844), 0);
  expectNear("a zero depth commands a zero target",
             TrackHiddenPostureTargetForBounds(100, 900, 844), 0);
  // σ is deliberately absent: snapTo input is posture-space and native adds σ
  // back, so the same geometry yields the same depth whatever the stash is.
  expectNear("depth is geometry only (σ cancels downstream)",
             TrackHiddenDepthForBounds(0, 700, 844), 144);
}

// ── THE SETTLE READING ──────────────────────────────────────────────────────
static void testSettleReading(void)
{
  printf("settle reading\n");
  const double detents[3] = { 0.0, 300.0, 600.0 };

  // A rest ON a detent: posture is τ − σ and the detent is named.
  TrackSettleReading r = TrackResolveSettleReading(601.0, 0.0, detents, 3, 2.0);
  expectNear("posture is tau - sigma", r.posture, 601.0);
  expectInt("a rest on a detent is at a detent", r.atDetent, 1);
  expectNear("the named detent is the one it rests on", r.detentTau, 600.0);

  // THE FIRST HOLE THE SAMPLER HAD: a rest that is NOT at a detent. It is still
  // a settle — the fact is emitted, atDetent is simply 0. Under the sampler
  // this produced NOTHING and the episode rode the 700ms deadline.
  r = TrackResolveSettleReading(450.0, 0.0, detents, 3, 2.0);
  expectInt("a rest between detents still reads", r.atDetent, 0);
  expectNear("...and still reports its posture", r.posture, 450.0);

  // THE HIDDEN REST: off-screen, below every detent. Same verdict — a real
  // rest, at no detent.
  r = TrackResolveSettleReading(-144.0, 0.0, detents, 3, 2.0);
  expectInt("an off-screen rest is not at a detent", r.atDetent, 0);
  expectNear("...and reports the negative posture", r.posture, -144.0);

  // σ IS SUBTRACTED, not ignored: a stashed header drag rests at τ = detent+σ.
  r = TrackResolveSettleReading(340.0, 40.0, detents, 3, 2.0);
  expectInt("a stashed rest still finds its detent", r.atDetent, 1);
  expectNear("the detent is posture-space", r.detentTau, 300.0);

  // NEAREST, not first-within-epsilon: order of the detent array must not
  // decide which detent a rest belongs to.
  const double crowded[3] = { 302.0, 300.0, 0.0 };
  r = TrackResolveSettleReading(300.4, 0.0, crowded, 3, 3.0);
  expectNear("the nearest detent wins, not the first", r.detentTau, 300.0);

  // Outside the tolerance is outside, on both sides.
  r = TrackResolveSettleReading(303.0, 0.0, detents, 3, 2.0);
  expectInt("just past the tolerance is not at a detent", r.atDetent, 0);
  r = TrackResolveSettleReading(298.5, 0.0, detents, 3, 2.0);
  expectInt("just inside the tolerance is at a detent", r.atDetent, 1);

  // A track with no detents configured still reports a rest.
  r = TrackResolveSettleReading(120.0, 0.0, NULL, 0, 2.0);
  expectInt("no detents configured is not an error", r.atDetent, 0);
  expectNear("...the posture is still the fact", r.posture, 120.0);
}

// ── THE CONTRACT VERSION ────────────────────────────────────────────────────
static void testContractVersion(void)
{
  printf("contract version\n");
  // The handshake is worthless if the constant drifts silently: this pins the
  // number the JS side expects (track-native-contract.ts). Bumping one without
  // the other is RED here and in the JS falsifier.
  expectInt("the binary states contract version 2", TRACK_SCROLL_CONTRACT_VERSION, 2);
}

int main(void)
{
  testHiddenDepth();
  testSettleReading();
  testContractVersion();
  printf("\n%d checks, %d failures\n", gChecks, gFailures);
  return gFailures == 0 ? 0 : 1;
}
