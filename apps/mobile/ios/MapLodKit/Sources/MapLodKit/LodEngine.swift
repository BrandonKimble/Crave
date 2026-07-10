import CoreLocation
import Foundation

/// Map-LOD v5 — the PURE single-authority promotion + crossfade engine.
///
/// The entire LOD model is ONE crossfade per anchor whose projected pin opacity is the truth. The rendered
/// dot opacity is `1 − opacity` and the label opacity is `opacity` — both are STYLE EXPRESSIONS off this same
/// scalar (this engine never produces them), so a marker can never be simultaneously a visible dot and a
/// visible pin. The promotion decision (`want`) is recomputed FROM SCRATCH every camera frame from
/// (on-screen set, ranking) and never persisted — so stale/stuck promotions are structurally impossible and
/// returning to a viewport recomputes the identical top-N.
///
/// Two decoupled steps the caller drives:
///   `decide(onScreenKeys:)` — per camera frame: recompute `want` (the top-`budget` on-screen anchors by
///                             rank are pins). Pure of opacity; writes nothing visible.
///   `step(nowMs:)`          — per display-link tick: project each in-motion fade toward `want ? 1 : 0`
///                             on an ABSOLUTE WALL CLOCK and RETURN the writes `[(markerKey, pinOpacity)]`.
///
/// WALL-CLOCK FADE (ROOT-B commit-invariant): each in-flight crossfade is a `Fade` (from/target/startMs/
/// fadeMs) and its opacity is a PURE projection of `nowMs` — `from + (target−from)·clamp((now−start)/fade)`.
/// Convergence is therefore independent of frame-delivery jitter: a starved 12fps link lands on the SAME
/// curve as a 60fps link (no dt-rate staircase). A fade is (re)started ONLY when its target CHANGES; a
/// stable target leaves the in-flight fade untouched, so a `want` flip mid-fade reverses smoothly from the
/// CURRENT opacity (never re-aims from 0/1, never ping-pongs at the budget boundary).
///
/// This type is dependency-free (CoreLocation only) so it unit-tests via `swift test` — no simulator, no
/// Mapbox, no React. It is the testable half of the v5 brain; the Mapbox wiring (screen-space on-screen
/// test, feature-state writer, obstacle reseed) stays in the controller and is injected.
public struct LodEngine {
  public struct Anchor: Equatable {
    public let markerKey: String
    public let coordinate: CLLocationCoordinate2D
    /// Crave-score rank within the viewport; lower = better. Governs BOTH promotion and the badge.
    public let rank: Int
    /// World-camera L1 (§3.1): the entity GROUP this anchor belongs to (restaurantId). Anchors
    /// sharing a groupId compete for ONE budget slot — a multi-location restaurant can never eat
    /// multiple slots. nil = its own group (back-compat: every pre-group caller behaves as today).
    public let groupId: String?
    /// World-camera L4 (§3.4): an out-of-searched-bounds group sibling. Resident in the
    /// ranking (so forcedKeys promotion reaches it) but NEVER rank-promoted and NEVER a
    /// visible dot — role 'invisible' until its group is selected.
    public let isInvisibleResident: Bool
    public init(markerKey: String, coordinate: CLLocationCoordinate2D, rank: Int, groupId: String? = nil, isInvisibleResident: Bool = false) {
      self.markerKey = markerKey
      self.coordinate = coordinate
      self.rank = rank
      self.groupId = groupId
      self.isInvisibleResident = isInvisibleResident
    }
    public static func == (l: Anchor, r: Anchor) -> Bool {
      l.markerKey == r.markerKey && l.rank == r.rank && l.groupId == r.groupId
        && l.isInvisibleResident == r.isInvisibleResident
        && l.coordinate.latitude == r.coordinate.latitude
        && l.coordinate.longitude == r.coordinate.longitude
    }
  }

  /// A single crossfade as a PURE projection of wall-clock time. `opacity(nowMs)` is deterministic and
  /// frame-rate-independent; a SETTLED fade (now ≥ start+fade) projects to `target` forever, so it doubles
  /// as the persistent "current opacity" truth — it is never pruned on settle (only by `setRanking`).
  struct Fade: Equatable {
    let from: Double
    let target: Double
    let startMs: Double
    let fadeMs: Double
    func opacity(nowMs: Double) -> Double {
      guard fadeMs > 0 else { return target }
      let p = min(1.0, max(0.0, (nowMs - startMs) / fadeMs))
      return from + (target - from) * p
    }
    func isSettled(nowMs: Double) -> Bool { nowMs - startMs >= fadeMs }
  }

  /// The budget: at most this many pins, ever.
  public let budget: Int
  /// Seconds for a full 0→1 (or 1→0) crossfade.
  public let fadeSeconds: Double
  /// Motion-admission slop: a fade within this of its target is treated as "already there" by `decide`
  /// (not re-admitted to motion). The wall-clock projection settles EXACTLY at `fadeMs`, so no ε-snap.
  public let epsilon: Double
  /// Crossfade duration in ms (derived from `fadeSeconds`; the wall-clock projection unit).
  private var fadeMs: Double { fadeSeconds * 1000 }

  // ── Resident ranking (rebuilt wholesale per result set; never mutated by promote/demote) ──
  public private(set) var ranking: [Anchor] = []

  // ── The ONLY per-frame mutable state ──
  /// Per-anchor crossfade. `fades[key]?.opacity(lastSetNowMs)` IS the current pin opacity (the TRUTH;
  /// "is a pin" == opacity > 0.5). Absent ⇒ 0 (everyone starts a dot). Pruned ONLY by `setRanking` (a
  /// vanished key), NEVER on settle — a settled fade projects to its target forever and is the persistent
  /// opacity a later demote/promote reverses from. (Dropping it would lose that truth → stuck/snapping.)
  private var fades: [String: Fade] = [:]
  /// want[key] = should this be a pin now. Recomputed from scratch each `decide`; never persisted.
  private var want: [String: Bool] = [:]
  /// Anchors whose opacity != target — the only ones `step` projects. Drained when a fade settles
  /// (NEVER by on-screen, so a demoting straggler still converges to 0 off-screen).
  private var motion: Set<String> = []
  /// The most recent `step(nowMs:)` clock — the instant `decide` / the accessors project fades at.
  private var lastSetNowMs: Double = 0
  /// Promoted membership from the last `decide`, in rank order — to detect obstacle-reseed need.
  public private(set) var lastPromotedInOrder: [String] = []

  public init(budget: Int = 30, fadeSeconds: Double = 0.18, epsilon: Double = 0.01) {
    self.budget = budget
    self.fadeSeconds = fadeSeconds
    self.epsilon = epsilon
  }

  // MARK: - Pure helpers (also used directly by tests)

  /// The promoted set: the top-`budget` on-screen anchors by rank, in rank order. PURE.
  /// `ranking` must be sorted ascending by rank; filtering preserves order so `prefix` == the true top-N.
  public static func promotedInOrder(ranking: [Anchor], onScreenKeys: Set<String>, budget: Int) -> [String] {
    var out: [String] = []
    var seenGroups: Set<String> = []
    out.reserveCapacity(budget)
    for a in ranking where onScreenKeys.contains(a.markerKey) {
      // L4: invisible residents never rank-promote (forcedKeys is their only door) and never
      // consume their group's slot.
      if a.isInvisibleResident { continue }
      // L1 group competition: one slot per group, occupied by its best-ranked on-screen anchor.
      if let group = a.groupId {
        if seenGroups.contains(group) { continue }
        seenGroups.insert(group)
      }
      out.append(a.markerKey)
      if out.count == budget { break }
    }
    return out
  }

  // MARK: - Stateful driver

  /// Full, atomic rebuild on a new result set. New keys start as dots (no fade ⇒ opacity 0). Surviving keys
  /// keep their in-flight/settled fade so a data refresh doesn't interrupt a crossfade; vanished keys drop.
  public mutating func setRanking(_ next: [Anchor]) {
    ranking = next
    let valid = Set(next.map { $0.markerKey })
    fades = fades.filter { valid.contains($0.key) }
    want = want.filter { valid.contains($0.key) }
    motion = motion.filter { valid.contains($0) }
  }

  /// DECIDE — recompute `want` from scratch. Returns the promoted set in rank order and whether its
  /// MEMBERSHIP changed (the caller reseeds the invisible obstacle source only then).
  ///
  /// `forcedKeys` (selected/tapped markers) are promoted REGARDLESS of rank or on-screen status, appended
  /// after the budget set in rank order, so a tapped restaurant stays a pin when you pan even if its rank
  /// falls outside the top-`budget` (mirrors v4's collectSelectedEntries / forcedPromote). The visible pin
  /// count may therefore be `budget + |forcedKeys|`; that is intentional (a tap is a deliberate exception).
  @discardableResult
  public mutating func decide(onScreenKeys: Set<String>, forcedKeys: Set<String> = [])
    -> (promotedInOrder: [String], membershipChanged: Bool) {
    // On-screen anchors in rank order (ranking is sorted ascending by rank); promote the strict
    // top-N of GROUPS (L1: one slot per group — Self.promotedInOrder owns the dedupe rule).
    var promoted = Self.promotedInOrder(ranking: ranking, onScreenKeys: onScreenKeys, budget: budget)
    if !forcedKeys.isEmpty {
      let already = Set(promoted)
      // Append forced keys in rank order (only those present in the ranking), after the budget set.
      for a in ranking where forcedKeys.contains(a.markerKey) && !already.contains(a.markerKey) {
        promoted.append(a.markerKey)
      }
    }
    let promotedSet = Set(promoted)
    var nextWant: [String: Bool] = [:]
    nextWant.reserveCapacity(ranking.count)
    for a in ranking {
      let w = promotedSet.contains(a.markerKey)
      nextWant[a.markerKey] = w
      let target: Double = w ? 1 : 0
      // Admit to motion if the marker's CURRENT projected opacity is not already at the target.
      let current = fades[a.markerKey]?.opacity(nowMs: lastSetNowMs) ?? 0
      if abs(current - target) > epsilon { motion.insert(a.markerKey) }
    }
    want = nextWant
    let membershipChanged = promoted != lastPromotedInOrder
    lastPromotedInOrder = promoted
    return (promoted, membershipChanged)
  }

  /// CONVERGE — project every in-motion anchor's fade toward its want-target at wall-clock `nowMs`. Returns
  /// `[(markerKey, pinOpacity)]` for the caller to apply as feature-state (the engine performs no I/O).
  /// A fade is (re)started ONLY on a target CHANGE (ROOT-B): `from` = the CURRENT projected opacity, so an
  /// interrupted fade reverses smoothly from where it is — never a snap, never a re-aim from 0/1.
  @discardableResult
  public mutating func step(nowMs: Double) -> [(markerKey: String, pinOpacity: Double)] {
    lastSetNowMs = nowMs
    guard !motion.isEmpty else { return [] }
    var writes: [(String, Double)] = []
    var settled: [String] = []
    for key in motion {
      let target: Double = (want[key] ?? false) ? 1 : 0
      let current = fades[key]?.opacity(nowMs: nowMs) ?? 0
      // ROOT-B: (re)start ONLY when the target changed (or no fade yet). A stable target is left untouched.
      if fades[key]?.target != target {
        fades[key] = Fade(from: current, target: target, startMs: nowMs, fadeMs: fadeMs)
      }
      let next = fades[key]!.opacity(nowMs: nowMs)
      writes.append((key, next))
      if fades[key]!.isSettled(nowMs: nowMs) { settled.append(key) }
    }
    // Settled fades leave `motion` but STAY in `fades` (they project to target forever and are the
    // persistent opacity a later flip reverses from). Pruning here would resurrect the stuck/snap bug.
    for key in settled { motion.remove(key) }
    return writes.map { (markerKey: $0.0, pinOpacity: $0.1) }
  }

  /// SNAP-SETTLED — collapse every in-flight crossfade to its want-target INSTANTLY (0-duration fade) and
  /// drain `motion`. Used by the unified-fade TOGGLE lane: a toggle is one global presentation-opacity
  /// fade, so the engine must contribute a CONSTANT per-marker opacity (pin=1 / dot=0 at its settled role)
  /// for the fade's duration — otherwise a residual 180ms role crossfade races the presentation ramp (the
  /// desync). After this, `pinOpacity(key)` projects the target forever (the Fade is settled), so the only
  /// moving curve is the presentation scalar. Call AFTER the new `decide` (so `want` is the new set's
  /// targets) to seed incoming pins at opacity 1 / dots at 0 under cover, before the fade-in ramp.
  public mutating func snapSettled(nowMs: Double) {
    lastSetNowMs = nowMs
    for (key, w) in want {
      let target: Double = w ? 1 : 0
      if fades[key]?.target != target || fades[key]?.fadeMs != 0 {
        fades[key] = Fade(from: target, target: target, startMs: nowMs, fadeMs: 0)
      }
    }
    motion.removeAll()
  }

  // MARK: - Read accessors (for the harness / tests; never a control authority)

  public func pinOpacity(_ key: String) -> Double { fades[key]?.opacity(nowMs: lastSetNowMs) ?? 0 }
  public func isPin(_ key: String) -> Bool { (fades[key]?.opacity(nowMs: lastSetNowMs) ?? 0) > 0.5 }
  public var visiblePinKeys: [String] {
    fades.filter { $0.value.opacity(nowMs: lastSetNowMs) > 0.5 }.map { $0.key }
  }
  public var isIdle: Bool { motion.isEmpty }
  public func wants(_ key: String) -> Bool { want[key] ?? false }

  /// PROBE (perceptibility measurement, not a control authority): at a tile reparse the GL dot's
  /// feature-state clears and the dot momentarily paints the DISCRETE literal floor instead of the
  /// continuous 1-p. For every in-flight marker (0<p<1), the flash magnitude = |literalFloor - (1-p)|,
  /// where literalFloor = 0 if promoted (in the decide target) else 1. Returns how many dots are exposed
  /// and the worst magnitude — the quantitative answer to "is the residual bloom perceptible?".
  public func inFlightReparseExposure() -> (count: Int, maxMag: Double) {
    let promoted = Set(lastPromotedInOrder)
    var count = 0
    var maxMag = 0.0
    for (key, fade) in fades {
      let p = fade.opacity(nowMs: lastSetNowMs)
      guard p > 0.02, p < 0.98 else { continue }
      count += 1
      let literalFloor = promoted.contains(key) ? 0.0 : 1.0
      maxMag = Swift.max(maxMag, abs(literalFloor - (1.0 - p)))
    }
    return (count, maxMag)
  }

  // MARK: - LEA membership authority (keyed to the STABLE decide target)

  /// The promoted set the controller last wrote into the reparse-immune membership literal.
  private var lastReportedPromotedRole: Set<String> = []

  /// If the DECIDE-PROMOTED set changed since the last call, return it (rank-ordered) and record it; else nil.
  ///
  /// RETARGET (supersedes FIX-A's lagged >0.5-opacity role): keyed to `lastPromotedInOrder` — the decide
  /// TARGET, a pure function of (ranking, on-screen, budget), NOT of per-marker opacity. This is the set the
  /// CA pin overlay renders pins for, so the dot/label literal is its exact complement and cannot churn
  /// mid-crossfade. Why FIX-A's lagged `visiblePinKeys` (>0.5 role) was WRONG post-CA: pin opacity moved to
  /// the reparse-immune CA overlay while the dot stayed GL (feature-state clears on reparse -> falls to this
  /// literal). The >0.5 role oscillates as pins dip below 0.5 mid-fade (measured 30->26->31 while the target
  /// held 30), so on a reparse a still-promoted marker fell out of the set and its dot painted 1 = the motion
  /// flash; and at a reveal (fades from ~0) `visiblePinKeys` is empty/partial so the swap fired nil or wrong,
  /// leaving a stale literal = the intermittent reveal dot no-show. The stable target fixes both.
  ///
  /// Still called on the STEP clock (the continuously-running converge tick covers all 4 decide paths:
  /// camera/toggle/reveal/tap-promote) AND synchronously at the reveal/toggle re-decide entry points
  /// (commitSettledLeaAuthorityUnderCover) to beat the presentation ramp. Because the returned set == the
  /// swapped set == `lastPromotedInOrder`, the baseline can never desync a direct commit.
  /// INVARIANT: `lastPromotedInOrder` is only updated by `decide` (NOT `setRanking`), so this must only be
  /// consumed AFTER a fresh decide — every current caller runs decide first.
  public mutating func takeSettledRoleChangeIfAny() -> [String]? {
    let now = Set(lastPromotedInOrder)
    guard now != lastReportedPromotedRole else { return nil }
    lastReportedPromotedRole = now
    return lastPromotedInOrder
  }
}
