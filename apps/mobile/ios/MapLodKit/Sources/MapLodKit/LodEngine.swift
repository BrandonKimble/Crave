import CoreLocation
import Foundation

/// Map-LOD v5 — the PURE single-authority promotion + crossfade engine.
///
/// The entire LOD model is ONE mutable scalar per anchor: `opacity` (pin opacity). The rendered dot
/// opacity is `1 − opacity` and the label opacity is `opacity` — both are STYLE EXPRESSIONS off this same
/// scalar (this engine never produces them), so a marker can never be simultaneously a visible dot and a
/// visible pin. The promotion decision (`want`) is recomputed FROM SCRATCH every camera frame from
/// (on-screen set, ranking) and never persisted — so stale/stuck promotions are structurally impossible and
/// returning to a viewport recomputes the identical top-N.
///
/// Two decoupled steps the caller drives:
///   `decide(onScreenKeys:)` — per camera frame: recompute `want` (the top-`budget` on-screen anchors by
///                             rank are pins). Pure of opacity; writes nothing visible.
///   `step(dtSeconds:)`      — per display-link tick: integrate each in-motion `opacity` toward `want ? 1 : 0`
///                             and RETURN the writes `[(markerKey, pinOpacity)]` for the caller to apply.
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
    public init(markerKey: String, coordinate: CLLocationCoordinate2D, rank: Int) {
      self.markerKey = markerKey
      self.coordinate = coordinate
      self.rank = rank
    }
    public static func == (l: Anchor, r: Anchor) -> Bool {
      l.markerKey == r.markerKey && l.rank == r.rank
        && l.coordinate.latitude == r.coordinate.latitude
        && l.coordinate.longitude == r.coordinate.longitude
    }
  }

  /// The budget: at most this many pins, ever.
  public let budget: Int
  /// Seconds for a full 0→1 (or 1→0) crossfade.
  public let fadeSeconds: Double
  /// Within this of the target, snap exactly — kills mid-fade limbo and guarantees termination.
  public let epsilon: Double

  // ── Resident ranking (rebuilt wholesale per result set; never mutated by promote/demote) ──
  public private(set) var ranking: [Anchor] = []

  // ── The ONLY per-frame mutable state ──
  /// pin opacity ∈ [0,1]; default 0 (everyone starts a dot). The TRUTH; "is a pin" == opacity > 0.5.
  private var opacity: [String: Double] = [:]
  /// want[key] = should this be a pin now. Recomputed from scratch each `decide`; never persisted.
  private var want: [String: Bool] = [:]
  /// Anchors whose opacity != target — the only ones `step` touches. Pruned only when opacity == target
  /// (NEVER by on-screen, so a demoting straggler still converges to 0 off-screen).
  private var motion: Set<String> = []
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
    out.reserveCapacity(budget)
    for a in ranking where onScreenKeys.contains(a.markerKey) {
      out.append(a.markerKey)
      if out.count == budget { break }
    }
    return out
  }

  /// Advance one opacity toward `target` by one tick. Eased (proportional) with an ε-snap so it always
  /// REACHES the target exactly. Never jumps the whole way in one tick (no snap) unless within ε. PURE.
  public static func advance(current: Double, target: Double, dtSeconds: Double,
                             fadeSeconds: Double, epsilon: Double) -> Double {
    let rate = fadeSeconds > 0 ? min(1.0, dtSeconds / fadeSeconds) : 1.0
    var next = current + (target - current) * rate
    if abs(next - target) < epsilon { next = target }
    return next
  }

  // MARK: - Stateful driver

  /// Full, atomic rebuild on a new result set. New keys start as dots (opacity 0). Surviving keys keep
  /// their in-flight opacity so a data refresh doesn't interrupt a crossfade; vanished keys are dropped.
  public mutating func setRanking(_ next: [Anchor]) {
    ranking = next
    let valid = Set(next.map { $0.markerKey })
    opacity = opacity.filter { valid.contains($0.key) }
    want = want.filter { valid.contains($0.key) }
    motion = motion.filter { valid.contains($0) }
    for key in valid where opacity[key] == nil { opacity[key] = 0 }
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
    // On-screen anchors in rank order (ranking is sorted ascending by rank); promote the strict top-N.
    let onScreenByRank = ranking.compactMap { onScreenKeys.contains($0.markerKey) ? $0.markerKey : nil }
    var promoted = Array(onScreenByRank.prefix(budget))
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
      if abs((opacity[a.markerKey] ?? 0) - target) > epsilon { motion.insert(a.markerKey) }
    }
    want = nextWant
    let membershipChanged = promoted != lastPromotedInOrder
    lastPromotedInOrder = promoted
    return (promoted, membershipChanged)
  }

  /// CONVERGE — integrate every in-motion anchor toward its want-target. Returns `[(markerKey, pinOpacity)]`
  /// for the caller to apply as feature-state (the engine performs no I/O).
  @discardableResult
  public mutating func step(dtSeconds: Double) -> [(markerKey: String, pinOpacity: Double)] {
    guard !motion.isEmpty else { return [] }
    var writes: [(String, Double)] = []
    var settled: [String] = []
    for key in motion {
      let target: Double = (want[key] ?? false) ? 1 : 0
      let next = Self.advance(current: opacity[key] ?? 0, target: target,
                              dtSeconds: dtSeconds, fadeSeconds: fadeSeconds, epsilon: epsilon)
      opacity[key] = next
      writes.append((key, next))
      if next == target { settled.append(key) }
    }
    for key in settled { motion.remove(key) }
    return writes.map { (markerKey: $0.0, pinOpacity: $0.1) }
  }

  // MARK: - Read accessors (for the harness / tests; never a control authority)

  public func pinOpacity(_ key: String) -> Double { opacity[key] ?? 0 }
  public func isPin(_ key: String) -> Bool { (opacity[key] ?? 0) > 0.5 }
  public var visiblePinKeys: [String] { opacity.filter { $0.value > 0.5 }.map { $0.key } }
  public var isIdle: Bool { motion.isEmpty }
  public func wants(_ key: String) -> Bool { want[key] ?? false }
}
