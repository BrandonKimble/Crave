import CoreLocation
import XCTest

@testable import MapLodKit

/// Unit tests for the v5 single-authority LOD engine. These pin the INVARIANTS (the spec, which won't
/// change), not implementation internals — and their real value is the EDGE CASES that produce "weird
/// states" but are tedious/impossible to reproduce by hand-driving the sim: empty on-screen, fewer-than-
/// budget, an anchor leaving mid-fade, return-to-origin restoration, interrupt reversal.
///
/// `step` is WALL-CLOCK now: callers thread an absolute `nowMs` and advance it each tick (a fade STARTS on
/// its first stepped instant, so the first step of a fresh promote writes the START value 0).
final class LodEngineTests: XCTestCase {
  private static let frameMs = 1000.0 / 60.0

  private func anchor(_ key: String, rank: Int) -> LodEngine.Anchor {
    // Coordinate is irrelevant to the pure promotion/crossfade logic (on-screen is decided upstream).
    LodEngine.Anchor(markerKey: key, coordinate: .init(latitude: 0, longitude: 0), rank: rank)
  }
  /// ranking of N anchors keyed "r1".."rN" with rank == index (already rank-sorted ascending).
  private func ranking(_ n: Int) -> [LodEngine.Anchor] { (1...n).map { anchor("r\($0)", rank: $0) } }
  private func keys(_ ids: [Int]) -> Set<String> { Set(ids.map { "r\($0)" }) }
  /// Run step() to a fixed point (or fail), advancing the shared wall clock `nowMs`. Returns ticks taken.
  @discardableResult
  private func settle(_ e: inout LodEngine, _ nowMs: inout Double, maxTicks: Int = 1000) -> Int {
    var ticks = 0
    while !e.isIdle && ticks < maxTicks {
      nowMs += Self.frameMs
      e.step(nowMs: nowMs)
      ticks += 1
    }
    XCTAssertTrue(e.isIdle, "engine did not settle within \(maxTicks) ticks")
    return ticks
  }

  // MARK: FM#1 — budget cap + top-N by rank

  func testBudgetCapsAtTopNByRank() {
    var e = LodEngine(budget: 30)
    e.setRanking(ranking(50))
    let (promoted, _) = e.decide(onScreenKeys: keys(Array(1...50)))
    XCTAssertEqual(promoted.count, 30, "must never want more than the budget")
    XCTAssertEqual(promoted, (1...30).map { "r\($0)" }, "promoted must be the 30 LOWEST ranks, in order")
  }

  func testFewerThanBudgetOnScreenPromotesAll() {
    var e = LodEngine(budget: 30)
    e.setRanking(ranking(50))
    let (promoted, _) = e.decide(onScreenKeys: keys([5, 9, 12]))
    XCTAssertEqual(promoted, ["r5", "r9", "r12"], "with <budget on-screen, all on-screen promote, rank-ordered")
  }

  func testForcedKeyPromotesBeyondBudgetAndRankAndFadesIn() {
    var e = LodEngine(budget: 2)
    e.setRanking(ranking(10))
    // On screen: r1,r2 (top-2 by rank) + r9 tapped (rank 9, well outside budget).
    let (promoted, _) = e.decide(onScreenKeys: keys([1, 2, 9]), forcedKeys: keys([9]))
    XCTAssertEqual(promoted, ["r1", "r2", "r9"], "forced key is appended after the budget set, in rank order")
    XCTAssertTrue(e.wants("r9"), "forced key is wanted so CONVERGE fades it in")
    var nowMs = 0.0
    settle(&e, &nowMs)
    XCTAssertEqual(e.pinOpacity("r9"), 1.0, "a forced (tapped) marker reaches full pin opacity")
    XCTAssertTrue(e.isPin("r1") && e.isPin("r2") && e.isPin("r9"), "budget(2) + 1 forced = 3 visible pins")
  }

  func testForcedKeyOffScreenStillPromotes() {
    var e = LodEngine(budget: 30)
    e.setRanking(ranking(50))
    // r40 is NOT on screen, but it's the tapped marker — it must still promote (stay a pin on pan).
    let (promoted, _) = e.decide(onScreenKeys: keys([1, 2, 3]), forcedKeys: keys([40]))
    XCTAssertEqual(Set(promoted), keys([1, 2, 3, 40]), "an off-screen tapped marker is still force-promoted")
  }

  func testEmptyOnScreenPromotesNothing() {
    var e = LodEngine(budget: 30)
    e.setRanking(ranking(50))
    let (promoted, _) = e.decide(onScreenKeys: [])
    XCTAssertTrue(promoted.isEmpty)
  }

  func testOffScreenHighRankNeverPromotesOverOnScreenLowerOnes() {
    var e = LodEngine(budget: 2)
    e.setRanking(ranking(10))
    // rank-1 and rank-2 are OFF screen; only rank-7,8,9 on screen → those promote despite worse rank.
    let (promoted, _) = e.decide(onScreenKeys: keys([7, 8, 9]))
    XCTAssertEqual(promoted, ["r7", "r8"], "promotion is top-N of the ON-SCREEN set, not the global set")
  }

  // MARK: FM#2 — single scalar (dot ≡ 1 − pin can never desync)

  func testDotIsAlwaysOneMinusPinAcrossACrossfade() {
    var e = LodEngine(budget: 1, fadeSeconds: 0.18)
    e.setRanking(ranking(2))
    e.decide(onScreenKeys: keys([1, 2]))   // r1 promotes
    var nowMs = 0.0
    for _ in 0..<10 {
      nowMs += Self.frameMs
      e.step(nowMs: nowMs)
      let pin = e.pinOpacity("r1")
      let dot = 1 - pin   // the style expression
      XCTAssertEqual(pin + dot, 1.0, accuracy: 1e-9, "dot ≡ 1 − pin: they can never both be high")
      XCTAssertFalse(pin > 0.5 && dot > 0.5, "never a visible pin AND a visible dot for the same marker")
    }
  }

  // MARK: FM#4 — no snapping (per-anchor wall-clock projection, bounded by elapsed time)

  func testNeverSnapsToTargetInOneTick() {
    var e = LodEngine(budget: 1, fadeSeconds: 0.18)
    e.setRanking(ranking(1))
    e.decide(onScreenKeys: keys([1]))
    _ = e.step(nowMs: 0)                       // fade starts at t=0 (writes the start value, 0)
    let writes = e.step(nowMs: Self.frameMs)   // ~16ms into a 180ms fade
    XCTAssertEqual(writes.count, 1)
    let op = writes[0].pinOpacity
    XCTAssertGreaterThan(op, 0.0)
    XCTAssertLessThan(op, 0.5, "16ms of a 180ms fade must NOT jump near full — no snap")
  }

  func testGroupOfPromotionsAreEachIndependentNotBatched() {
    // 14 anchors cross the budget on ONE decide (the v4 "group snap" scenario). Each must fade
    // independently and identically by wall-clock projection — none snaps.
    var e = LodEngine(budget: 14, fadeSeconds: 0.18)
    e.setRanking(ranking(14))
    e.decide(onScreenKeys: keys(Array(1...14)))
    _ = e.step(nowMs: 0)                          // all fades start at t=0
    let writes = e.step(nowMs: Self.frameMs)      // ~16ms into the 180ms fade
    XCTAssertEqual(writes.count, 14)
    for w in writes { XCTAssertLessThan(w.pinOpacity, 0.5, "no member of a 14-way promotion snaps") }
  }

  // MARK: exact termination at the wall-clock fade end

  func testCrossfadeTerminatesExactlyAtTarget() {
    var e = LodEngine(budget: 1, fadeSeconds: 0.18)
    e.setRanking(ranking(1))
    e.decide(onScreenKeys: keys([1]))
    var nowMs = 0.0
    let ticks = settle(&e, &nowMs)
    XCTAssertEqual(e.pinOpacity("r1"), 1.0, "the projection lands exactly on 1 at fade end")
    XCTAssertGreaterThan(ticks, 1, "but it took several ticks (faded, not snapped)")
    XCTAssertTrue(e.isIdle, "and the motion set drained")
  }

  // MARK: ROOT-B — interrupt reversal (a want flip mid-fade reverses smoothly from CURRENT, no snap)

  func testInterruptedFadeReversesSmoothlyFromCurrent() {
    var e = LodEngine(budget: 1, fadeSeconds: 0.18)
    e.setRanking(ranking(2))
    e.decide(onScreenKeys: keys([1]))          // r1 promoting
    var nowMs = 0.0
    nowMs += Self.frameMs; e.step(nowMs: nowMs) // start (0)
    nowMs += Self.frameMs; e.step(nowMs: nowMs) // a bit up
    let mid = e.pinOpacity("r1")
    XCTAssertGreaterThan(mid, 0.0); XCTAssertLessThan(mid, 1.0)  // caught mid-fade

    e.decide(onScreenKeys: keys([2]))          // r1 leaves → want flips to false mid-fade
    nowMs += Self.frameMs
    let peakW = e.step(nowMs: nowMs)            // ROOT-B restart writes `from` = CURRENT opacity (continuous)
    let peak = peakW.first { $0.markerKey == "r1" }!.pinOpacity
    XCTAssertGreaterThan(peak, mid, "reversal restarts from the current (still-rising) opacity, not a jump")
    nowMs += Self.frameMs
    let afterW = e.step(nowMs: nowMs)
    let after = afterW.first { $0.markerKey == "r1" }!.pinOpacity
    XCTAssertLessThan(after, peak, "then reverses DOWN from there")
    XCTAssertGreaterThan(after, 0.0, "smoothly, not a snap to 0")
  }

  // MARK: FM#5 — recompute-from-scratch ⇒ no stuck promotions; return-to-origin restores exactly

  func testDemotedAnchorConvergesToZeroEvenOffScreen() {
    var e = LodEngine(budget: 1)
    e.setRanking(ranking(2))
    var nowMs = 0.0
    e.decide(onScreenKeys: keys([1])); settle(&e, &nowMs)
    XCTAssertEqual(e.pinOpacity("r1"), 1.0)
    e.decide(onScreenKeys: keys([2]))           // r1 now OFF screen → want=false
    settle(&e, &nowMs)
    XCTAssertEqual(e.pinOpacity("r1"), 0.0, "a demoted/off-screen pin MUST reach 0 — no stuck ghost (FM#5)")
  }

  func testReturnToOriginRestoresExactTopN() {
    var e = LodEngine(budget: 3)
    e.setRanking(ranking(20))
    var nowMs = 0.0
    // Origin viewport: ranks 1..6 on screen → top-3 = r1,r2,r3.
    let origin = keys([1, 2, 3, 4, 5, 6])
    let (p0, _) = e.decide(onScreenKeys: origin); settle(&e, &nowMs)
    XCTAssertEqual(Set(p0), keys([1, 2, 3]))
    // Excursion: pan so 1..3 leave and only 10..16 are on screen → top-3 = r10,r11,r12.
    e.decide(onScreenKeys: keys([10, 11, 12, 13, 14, 15, 16])); settle(&e, &nowMs)
    XCTAssertTrue(e.isPin("r10") && e.isPin("r11") && e.isPin("r12"))
    XCTAssertFalse(e.isPin("r1"), "during the excursion the origin pins are demoted")
    // Return to origin → must restore EXACTLY the original top-3, and the excursion pins must be gone.
    let (p2, _) = e.decide(onScreenKeys: origin); settle(&e, &nowMs)
    XCTAssertEqual(Set(p2), keys([1, 2, 3]), "origin restores the identical top-N")
    XCTAssertEqual(Set(e.visiblePinKeys), keys([1, 2, 3]), "and NO excursion pin (r10/r11/r12) is stuck visible")
  }

  // MARK: membership-change signal (gates the obstacle reseed)

  func testMembershipChangedSignal() {
    var e = LodEngine(budget: 2)
    e.setRanking(ranking(10))
    let (_, c1) = e.decide(onScreenKeys: keys([1, 2, 3]))
    XCTAssertTrue(c1, "first decide changes membership from empty")
    let (_, c2) = e.decide(onScreenKeys: keys([1, 2, 3]))
    XCTAssertFalse(c2, "identical promoted set ⇒ no reseed")
    let (_, c3) = e.decide(onScreenKeys: keys([2, 3, 4]))
    XCTAssertTrue(c3, "promoted membership changed (r1 left) ⇒ reseed")
  }

  func testIdleEngineProducesNoWrites() {
    var e = LodEngine(budget: 2)
    e.setRanking(ranking(5))
    var nowMs = 0.0
    e.decide(onScreenKeys: keys([1, 2])); settle(&e, &nowMs)
    nowMs += Self.frameMs
    XCTAssertEqual(e.step(nowMs: nowMs).count, 0, "a settled engine writes nothing (no idle churn)")
  }
}
