// THE DOMAIN AUTHORITY's falsifiers. The header is pure C arithmetic, so it is
// compiled and executed HERE, on the host, against the SAME source the app
// compiles — the MapLodKit precedent (a pure engine gets a host test; no
// simulator, no fiction). Run: ../Tests/run.sh (or yarn test:track-domain).
//
// Every assertion below is stated as a DOMAIN fact (minOffset / maxOffset), not
// as an inset value: the insets are the authority's output, but the law is
// about where τ is allowed to be.

#include "../Sources/TrackDomainRange.h"

#include <stdio.h>
#include <string.h>

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

static void expectAtLeast(const char *what, double actual, double floorValue)
{
  gChecks++;
  if (actual < floorValue - 0.5) {
    gFailures++;
    printf("  FAIL %-58s got %.2f want >= %.2f\n", what, actual, floorValue);
  }
}

static double maxOffset(TrackDomainState s, TrackDomainInsets i)
{
  return s.contentH + i.insetBottom - s.viewport;
}

static double minOffset(TrackDomainInsets i) { return -i.insetTop; }

/// A track mid-drag on the header: boundary 300, viewport 800, content 2000.
static TrackDomainState baseState(void)
{
  TrackDomainState s;
  memset(&s, 0, sizeof(s));
  s.contentH = 2000;
  s.viewport = 800;
  s.trackH = 300;
  s.boundary = 300;
  s.sigma = 0;
  s.tau = 120;
  s.insetTopNow = 0;
  s.insetBottomNow = 0;
  s.externalBottomBaseline = 0;
  s.hiddenTargetTau = 0;
  s.postureDragActive = 0;
  s.hiddenEngaged = 0;
  s.shellEnabled = 1;
  s.phase = TrackDomainPhaseSettled;
  return s;
}

// ── F4a: mid-drag content GROWTH does not move the ceiling ──────────────────
// The recycler grows contentH while the finger holds the header. maxOffset must
// stay pinned to the boundary — the escape the ceiling exists to close must not
// re-open through the other term of the sum.
static void testCeilingSurvivesGrowth(void)
{
  printf("F4a mid-drag content growth does not move the ceiling\n");
  TrackDomainState s = baseState();
  s.postureDragActive = 1;
  s.tau = 260;
  const double heights[] = { 2000, 2600, 3400, 9000 };
  for (int i = 0; i < 4; i++) {
    s.contentH = heights[i];
    s.insetBottomNow = i == 0 ? 0 : 12345; // a stale inset must not survive
    const TrackDomainInsets out = TrackDomainLegalRange(s);
    expectNear("maxOffset == boundary under growth", maxOffset(s, out), s.boundary);
  }
}

// ── F4b: mid-drag content SHRINK does not build a phantom wall ──────────────
// The mirrored direction: a shrinking recycler must not drag maxOffset BELOW
// the boundary, which would both wall the drag short of the boundary and clamp
// τ down mid-gesture.
static void testNoPhantomWallOnShrink(void)
{
  printf("F4b mid-drag content shrink does not build a phantom wall\n");
  TrackDomainState s = baseState();
  s.postureDragActive = 1;
  s.tau = 260;
  const double heights[] = { 9000, 3400, 1400, 400 };
  for (int i = 0; i < 4; i++) {
    s.contentH = heights[i];
    const TrackDomainInsets out = TrackDomainLegalRange(s);
    expectNear("maxOffset == boundary under shrink", maxOffset(s, out), s.boundary);
    expectAtLeast("boundary remains reachable", maxOffset(s, out), s.boundary);
  }
}

// ── F4c: the PRIOR phase never lowers the ceiling ───────────────────────────
// The one phase that cannot know the new contentH must be pure prevention:
// grow-only, and covering the current τ against any new height.
static void testPriorPhaseIsGrowOnly(void)
{
  printf("F4c the prior phase is grow-only and covers tau\n");
  TrackDomainState s = baseState();
  s.phase = TrackDomainPhasePrior;
  s.tau = 640;
  s.insetBottomNow = 1500;
  TrackDomainInsets out = TrackDomainLegalRange(s);
  expectAtLeast("prior never shrinks the inset", out.insetBottom, 1500);
  s.insetBottomNow = 0;
  out = TrackDomainLegalRange(s);
  expectAtLeast("prior covers tau against any new height",
                out.insetBottom, s.tau + s.viewport);
  // ...including while a posture drag holds the ceiling: prevention outranks
  // the ceiling for the length of one KVO transaction (no touch is delivered
  // between the paired notifications), and the settled phase re-tightens.
  s.postureDragActive = 1;
  out = TrackDomainLegalRange(s);
  expectAtLeast("prior protects tau during a posture drag too",
                out.insetBottom, s.tau + s.viewport);
}

// ── F7: the external bottom baseline is never clobbered ─────────────────────
static void testExternalBaselineSurvives(void)
{
  printf("F7 the external bottom baseline is never clobbered\n");
  TrackDomainState s = baseState();
  s.externalBottomBaseline = 340; // e.g. a keyboard on an input-bearing page
  s.contentH = 6000;              // engine need is 0 here: tall content
  TrackDomainInsets out = TrackDomainLegalRange(s);
  expectAtLeast("settled honors the baseline", out.insetBottom, 340);
  // ...through a contentSize change (the exact moment the old range law
  // overwrote it), in both phases.
  s.phase = TrackDomainPhasePrior;
  out = TrackDomainLegalRange(s);
  expectAtLeast("prior honors the baseline", out.insetBottom, 340);
  // ...including where the prior phase's own prevention term is SMALLER than
  // the baseline (τ below 0 mid-excursion): prevention must not be allowed to
  // define the inset downward past a claim it does not own.
  s.tau = -700;
  s.insetBottomNow = 0;
  out = TrackDomainLegalRange(s);
  expectAtLeast("prior prevention never undercuts the baseline",
                out.insetBottom, 340);
  s.tau = 120;
  // ...and when the engine needs MORE, the engine wins without erasing it.
  s.phase = TrackDomainPhaseSettled;
  s.contentH = 200;
  out = TrackDomainLegalRange(s);
  expectAtLeast("engine need composes over the baseline", out.insetBottom, 340);
  expectAtLeast("engine need is still met", maxOffset(s, out), s.trackH);
  // ...and it survives a posture drag: the ceiling owns the scalar during the
  // drag, but drag end (settled, no drag) restores the baseline in one call.
  s.postureDragActive = 0;
  s.contentH = 6000;
  out = TrackDomainLegalRange(s);
  expectAtLeast("drag end restores the baseline", out.insetBottom, 340);
}

// ── R4: the excursion floor is present iff an excursion is engaged ──────────
static void testExcursionFloor(void)
{
  printf("R4 the excursion floor is present iff the excursion is engaged\n");
  TrackDomainState s = baseState();
  TrackDomainInsets out = TrackDomainLegalRange(s);
  expectNear("no excursion: collapsed is the floor", minOffset(out), 0);

  s.hiddenEngaged = 1;
  s.hiddenTargetTau = -820;
  out = TrackDomainLegalRange(s);
  expectNear("engaged: the floor is the excursion depth", minOffset(out), -820);

  // Mid-flight, τ below 0: still exactly the target's depth.
  s.tau = -400;
  out = TrackDomainLegalRange(s);
  expectNear("mid-flight floor is the target", minOffset(out), -820);

  // Closing the excursion while τ is still off-screen must NOT clamp the sheet
  // back on screen in one frame — the floor holds τ regardless of engagement.
  s.hiddenEngaged = 0;
  s.hiddenTargetTau = 0;
  s.tau = -400;
  out = TrackDomainLegalRange(s);
  expectAtLeast("a closed excursion never clamps an off-screen tau",
                -minOffset(out), 400);

  // Back on screen, disengaged: the domain collapses to collapsed-is-tau-0.
  s.tau = 0;
  out = TrackDomainLegalRange(s);
  expectNear("collapsed is tau 0 again", minOffset(out), 0);

  // An UNCONFIGURED track has no floor to state — and must not zero one it
  // does not own (the other edge of the same F7 law).
  s.shellEnabled = 0;
  s.insetTopNow = 44;
  out = TrackDomainLegalRange(s);
  expectNear("no shell, no claim on the top inset", out.insetTop, 44);
}

// ── The range law: every posture legal, and tau never becomes illegal ───────
static void testRangeLaw(void)
{
  printf("RANGE every posture legal; a content swap never moves the sheet\n");
  TrackDomainState s = baseState();
  const double heights[] = { 60, 400, 1400, 12000 };
  for (int i = 0; i < 4; i++) {
    s.contentH = heights[i];
    s.tau = 290;
    const TrackDomainInsets out = TrackDomainLegalRange(s);
    expectAtLeast("expanded posture reachable", maxOffset(s, out), s.trackH);
    expectAtLeast("current tau stays legal", maxOffset(s, out), s.tau);
  }
  // THE τ-INVARIANCE CASE the reach term cannot cover: τ deep inside a list
  // whose body just got shorter. reach is 0 here (content still exceeds the
  // viewport by more than H), so only the keep term stands between a content
  // swap and the sheet jumping — this is the "snaps to a weird mid-high".
  s.contentH = 1400;
  s.tau = 900;
  const TrackDomainInsets deep = TrackDomainLegalRange(s);
  expectNear("reach is not what saves a deep tau",
             TrackDomainMax(0.0, s.viewport - (s.contentH - s.trackH)), 0);
  expectAtLeast("a deep tau survives a content swap", maxOffset(s, deep), s.tau);
}

int main(void)
{
  testCeilingSurvivesGrowth();
  testNoPhantomWallOnShrink();
  testPriorPhaseIsGrowOnly();
  testExternalBaselineSurvives();
  testExcursionFloor();
  testRangeLaw();
  printf("\n%d checks, %d failures\n", gChecks, gFailures);
  return gFailures == 0 ? 0 : 1;
}
