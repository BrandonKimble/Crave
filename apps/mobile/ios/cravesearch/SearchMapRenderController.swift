import Foundation
import CoreLocation
import MapboxMaps
import QuartzCore
import React
import Turf
import UIKit

private final class PresentationOpacityAnimator {
  weak var owner: SearchMapRenderController?
  let instanceId: String
  let reason: String
  let startOpacity: Double
  let targetOpacity: Double
  let durationMs: Double
  let startedAtMs: Double
  private var displayLink: CADisplayLink?

  init(
    owner: SearchMapRenderController,
    instanceId: String,
    reason: String,
    startOpacity: Double,
    targetOpacity: Double,
    durationMs: Double,
    startedAtMs: Double
  ) {
    self.owner = owner
    self.instanceId = instanceId
    self.reason = reason
    self.startOpacity = startOpacity
    self.targetOpacity = targetOpacity
    self.durationMs = durationMs
    self.startedAtMs = startedAtMs
  }

  func start() {
    let displayLink = CADisplayLink(target: self, selector: #selector(handleDisplayLink(_:)))
    if #available(iOS 15.0, *) {
      let preferredFps = Float(UIScreen.main.maximumFramesPerSecond)
      displayLink.preferredFrameRateRange = CAFrameRateRange(
        minimum: 60,
        maximum: preferredFps,
        preferred: preferredFps
      )
    } else {
      displayLink.preferredFramesPerSecond = UIScreen.main.maximumFramesPerSecond
    }
    displayLink.add(to: .main, forMode: .common)
    self.displayLink = displayLink
  }

  func stop() {
    displayLink?.invalidate()
    displayLink = nil
  }

  @objc
  private func handleDisplayLink(_ displayLink: CADisplayLink) {
    owner?.stepPresentationOpacityAnimation(
      instanceId: instanceId,
      timestampMs: displayLink.timestamp * 1000
    )
  }
}

@objc(SearchMapRenderController)
final class SearchMapRenderController: RCTEventEmitter {
  private let overlayZAnchorSourceId = "search-overlay-z-anchor-source"
  private let eventName = "searchMapRenderControllerEvent"
  private let enableVisualDiagnostics = false
  private let dismissSettleDelayMs = 300
  private let enterSettleDelayMs = 300
  private let lodVisibleDelayMs = 16
  private let mapResolveTimeoutMs = 10_000.0
  private let nativeViewportEventThrottleMs = 16.0
  private static let transientVisualPropertyKeys: Set<String> = [
    "nativeDotOpacity",
    "nativeHighlighted",
    "nativeLabelOpacity",
    "nativeLodOpacity",
    "nativeLodRankOpacity",
    "nativePresentationOpacity",
  ]
  private static let addGestureDelegateSelector = NSSelectorFromString("addGestureDelegate:")
  private static let removeGestureDelegateSelector = NSSelectorFromString("removeGestureDelegate:")

  private enum SourceLifecyclePhase {
    case uninitialized
    case incremental
  }

  private enum SourceMutationMode {
    case none
    case baselineReplace
    case incrementalPatch
  }

  private enum VisualSourceLifecycleState {
    case dismissed
    case preparingReveal
    case revealing
    case visible
    case dismissing
  }

  private struct SourceState {
    var lifecyclePhase: SourceLifecyclePhase
    var sourceRevision: String
    var featureStateRevision: String
    var featureStateEntryRevisionById: [String: String]
    var featureStateChangedIds: Set<String>
    var idsInOrder: [String]
    var featureIds: Set<String>
    var addedFeatureIdsInOrder: [String]
    var updatedFeatureIdsInOrder: [String]
    var removedFeatureIds: Set<String>
    var diffKeyById: [String: String]
    var markerKeyByFeatureId: [String: String]
    var featureStateById: [String: [String: Any]]
  }

  private final class NativeCameraGestureObserver: NSObject, GestureManagerDelegate {
    private var activeGestureCount: Int = 0

    var isGestureActive: Bool {
      activeGestureCount > 0
    }

    func gestureManager(_ gestureManager: GestureManager, didBegin gestureType: GestureType) {
      activeGestureCount += 1
    }

    func gestureManager(
      _ gestureManager: GestureManager,
      didEnd gestureType: GestureType,
      willAnimate: Bool
    ) {
      if !willAnimate {
        activeGestureCount = max(0, activeGestureCount - 1)
      }
    }

    func gestureManager(
      _ gestureManager: GestureManager,
      didEndAnimatingFor gestureType: GestureType
    ) {
      activeGestureCount = max(0, activeGestureCount - 1)
    }

    func reset() {
      activeGestureCount = 0
    }
  }

  private final class ViewLifecycleProbeView: UIView {
    let probeName: String
    var onEvent: ((String) -> Void)?

    init(probeName: String) {
      self.probeName = probeName
      super.init(frame: .zero)
      isHidden = true
      isUserInteractionEnabled = false
      accessibilityIdentifier = "search-map-probe-\(probeName)"
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
      fatalError("init(coder:) has not been implemented")
    }

    override func didMoveToWindow() {
      super.didMoveToWindow()
      onEvent?("didMoveToWindow")
    }

    override func didMoveToSuperview() {
      super.didMoveToSuperview()
      onEvent?("didMoveToSuperview")
    }
  }

  private final class ResolvedMapHandle {
    let rootView: UIView
    let gestureDelegateHostView: UIView?
    let mapView: MapView
    var sourceDataLoadedCancelable: AnyCancelable?
    var styleLoadedCancelable: AnyCancelable?
    var cameraChangedCancelable: AnyCancelable?
    var mapIdleCancelable: AnyCancelable?
    let gestureObserver = NativeCameraGestureObserver()
    var isGestureObserverRegistered = false
    var lastNativeCameraDiagAtMs: Double = 0
    var lastNativeCameraDiagSignature: String?
    var rootLifecycleProbeView: ViewLifecycleProbeView?
    var mapLifecycleProbeView: ViewLifecycleProbeView?

    init(rootView: UIView, gestureDelegateHostView: UIView?, mapView: MapView) {
      self.rootView = rootView
      self.gestureDelegateHostView = gestureDelegateHostView
      self.mapView = mapView
    }

    func cancelSubscriptions() {
      sourceDataLoadedCancelable?.cancel()
      sourceDataLoadedCancelable = nil
      styleLoadedCancelable?.cancel()
      styleLoadedCancelable = nil
      cameraChangedCancelable?.cancel()
      cameraChangedCancelable = nil
      mapIdleCancelable?.cancel()
      mapIdleCancelable = nil
      if isGestureObserverRegistered {
        if let gestureDelegateHostView {
          SearchMapRenderController.removeGestureDelegate(gestureObserver, from: gestureDelegateHostView)
        }
        isGestureObserverRegistered = false
      }
      gestureObserver.reset()
      rootLifecycleProbeView?.removeFromSuperview()
      rootLifecycleProbeView = nil
      mapLifecycleProbeView?.removeFromSuperview()
      mapLifecycleProbeView = nil
    }
  }

  private struct MutationSummary {
    var addCount: Int
    var updateCount: Int
    var removeCount: Int
    var dataId: String?
    var addedFeatureIds: [String]

    var hasMutations: Bool {
      addCount > 0 || updateCount > 0 || removeCount > 0
    }
  }

  private struct ParsedCollectionApplyPlan {
    var sourceId: String
    var next: ParsedFeatureCollection
    var previousSourceState: SourceState?
    var previousFeatureStateById: [String: [String: Any]]
    var previousFeatureStateRevision: String
  }

  private struct ResolvedParsedCollectionApplyPlan {
    var sourceId: String
    var next: ParsedFeatureCollection
    var previousSourceLifecyclePhase: SourceLifecyclePhase
    var previousSourceRevision: String
    var previousFeatureStateById: [String: [String: Any]]
    var previousFeatureStateRevision: String
    var nextSourceState: SourceState
  }

  private struct ResolvedSourceMutationPlan {
    var sourceId: String
    var previousSourceLifecyclePhase: SourceLifecyclePhase
    var previousSourceRevision: String
    var next: ParsedFeatureCollection
    var mutationMode: SourceMutationMode
    var mutationSummary: MutationSummary
    var dataId: String?
  }

  private struct PreparedDerivedPinAndLabelOutput {
    var plans: [ParsedCollectionApplyPlan]
    var pinSourceId: String
    var pinStartedAtMs: Double
  }

  private struct PreparedDerivedDotOutput {
    var plans: [ParsedCollectionApplyPlan]
    var dotSourceId: String
  }

  private struct DerivedFamilyState {
    var desiredCollection: ParsedFeatureCollection
    var collection: ParsedFeatureCollection
    var sourceState: SourceState
    var transientFeatureStateById: [String: [String: Any]]
    var pinRuntime: PinFamilyRuntimeState
    var dotRuntime: DotFamilyRuntimeState
    var labelObservation: LabelFamilyObservationState

    var lastDesiredPinSnapshot: DesiredPinSnapshotState {
      get { pinRuntime.lastDesiredSnapshot }
      set { pinRuntime.lastDesiredSnapshot = newValue }
    }

    var lastDesiredCollection: ParsedFeatureCollection {
      get { dotRuntime.lastDesiredCollection }
      set { dotRuntime.lastDesiredCollection = newValue }
    }

    var livePinTransitionsByMarkerKey: [String: LivePinTransition] {
      get { pinRuntime.liveTransitionsByMarkerKey }
      set { pinRuntime.liveTransitionsByMarkerKey = newValue }
    }

    var liveDotTransitionsByMarkerKey: [String: LiveDotTransition] {
      get { dotRuntime.liveTransitionsByMarkerKey }
      set { dotRuntime.liveTransitionsByMarkerKey = newValue }
    }

    var markerRenderStateByMarkerKey: [String: MarkerFamilyRenderState] {
      get { pinRuntime.markerRenderStateByMarkerKey }
      set { pinRuntime.markerRenderStateByMarkerKey = newValue }
    }

    var settledVisibleFeatureIds: Set<String> {
      get { labelObservation.settledVisibleFeatureIds }
      set { labelObservation.settledVisibleFeatureIds = newValue }
    }

  }

  private struct PinFamilyRuntimeState {
    var lastDesiredSnapshot: DesiredPinSnapshotState = DesiredPinSnapshotState()
    var markerRenderStateByMarkerKey: [String: MarkerFamilyRenderState] = [:]
    var liveTransitionsByMarkerKey: [String: LivePinTransition] = [:]
  }

  private struct DotFamilyRuntimeState {
    var lastDesiredCollection: ParsedFeatureCollection
    var liveTransitionsByMarkerKey: [String: LiveDotTransition] = [:]
  }

  private struct LabelFamilyObservationState {
    var settledVisibleFeatureIds: Set<String> = []
    var observationEnabled: Bool = false
    var allowFallback: Bool = false
    var commitInteractionVisibility: Bool = false
    var refreshMsIdle: Double = 0
    var refreshMsMoving: Double = 0
    var stickyEnabled: Bool = false
    var stickyLockStableMsMoving: Double = 0
    var stickyLockStableMsIdle: Double = 0
    var stickyUnlockMissingMsMoving: Double = 0
    var stickyUnlockMissingMsIdle: Double = 0
    var stickyUnlockMissingStreakMoving: Int = 1
    var configuredResetRequestKey: String? = nil
    var hasCommittedObservationForConfiguredRequest: Bool = false
    var lastVisibleLabelFeatureIds: [String] = []
    var lastLayerRenderedFeatureCount: Int = 0
    var lastEffectiveRenderedFeatureCount: Int = 0
    var stickyRevision: Int = 0
    var stickyCandidateByIdentity: [String: String] = [:]
    var stickyCommittedLastSeenAtMsByIdentity: [String: Double] = [:]
    var stickyCommittedMissingStreakByIdentity: [String: Int] = [:]
    var stickyProposedCandidateByIdentity: [String: String] = [:]
    var stickyProposedSinceAtMsByIdentity: [String: Double] = [:]
    var lastResetRequestKey: String? = nil
    var isRefreshInFlight: Bool = false
    var queuedRefreshDelayMs: Double? = nil
    var movingNoopRefreshStreak: Int = 0
    var movingAdaptiveRefreshMs: Double = 0
  }

  private struct RenderedPlacedLabelObservation {
    var markerKey: String
    var candidate: String
    var restaurantId: String?
  }

  private struct DesiredPinSnapshotState {
    var inputRevision: String = ""
    var pinIdsInOrder: [String] = []
    var pinFeatureRevisionByMarkerKey: [String: String] = [:]
    var pinInteractionFeatureRevisionByMarkerKey: [String: String] = [:]
    var pinLodZByMarkerKey: [String: Int] = [:]
    var labelFeatureRevisionByMarkerKey: [String: String] = [:]
    var labelCollisionFeatureRevisionByMarkerKey: [String: String] = [:]
  }

  private struct DesiredPinSnapshotDirtyState {
    var pinMarkerKeys: Set<String> = []
    var pinInteractionMarkerKeys: Set<String> = []
    var labelMarkerKeys: Set<String> = []
    var labelCollisionMarkerKeys: Set<String> = []
  }

  private struct DesiredMarkerFamilyPayloads {
    var pinFeatureByMarkerKey: [String: Feature] = [:]
    var pinInteractionFeatureByMarkerKey: [String: Feature] = [:]
    var labelFeaturesByMarkerKey: [String: [(id: String, feature: Feature)]] = [:]
    var labelCollisionFeatureByMarkerKey: [String: Feature] = [:]
  }

  private struct MarkerFamilyRenderState {
    var pinFeature: Feature
    var pinInteractionFeature: Feature?
    var labelFeatures: [(id: String, feature: Feature)]
    var labelCollisionFeature: Feature?
    var lodZ: Int
    var orderHint: Int
    var isDesiredPresent: Bool
    var currentOpacity: Double
    var targetOpacity: Double
  }

  private struct LivePinTransition {
    var startOpacity: Double
    var targetOpacity: Double
    var startedAtMs: Double
    var durationMs: Double
    var isAwaitingSourceCommit: Bool
    var awaitingSourceDataId: String?
    var lodZ: Int
    var orderHint: Int
  }

  private struct LiveDotTransition {
    var startOpacity: Double
    var targetOpacity: Double
    var startedAtMs: Double
    var durationMs: Double
    var isAwaitingSourceCommit: Bool
    var awaitingSourceDataId: String?
    var dotFeature: Feature
    var orderHint: Int
  }

  private struct LabelTapHitboxConfig {
    let textSize: CGFloat
    let radialXEm: CGFloat
    let radialYEm: CGFloat
    let radialTopEm: CGFloat
    let upShiftEm: CGFloat
    let charWidthFactor: CGFloat
    let lineHeightFactor: CGFloat
    let paddingPx: CGFloat
    let minWidthPx: CGFloat
    let maxWidthPx: CGFloat
  }

  private struct ExecutionBatchRef: Equatable {
    var requestKey: String
    var batchId: String
    var generationId: String
  }

  private struct EnterLaneState {
    var requestedRequestKey: String? = nil
    var mountedHidden: ExecutionBatchRef? = nil
    var armed: ExecutionBatchRef? = nil
    var entering: ExecutionBatchRef? = nil
    var liveBaseline: ExecutionBatchRef? = nil
  }

  private struct InstanceState {
    var mapTag: NSNumber
    var pinSourceId: String
    var pinInteractionSourceId: String
    var dotSourceId: String
    var dotInteractionSourceId: String
    var labelSourceId: String
    var labelInteractionSourceId: String
    var labelCollisionSourceId: String
    var lastPinCount: Int
    var lastDotCount: Int
    var lastLabelCount: Int
    var lastPresentationBatchPhase: String
    var lastEnterRequestKey: String?
    var enterLane: EnterLaneState
    var lastEnterStartToken: Double?
    var lastEnterStartedRequestKey: String?
    var lastEnterSettledRequestKey: String?
    var lastDismissRequestKey: String?
    var currentPresentationRenderPhase: String
    var visualSourceLifecycleState: VisualSourceLifecycleState
    var labelCollisionObstacleLayersVisible: Bool
    var labelPlacementLayersFadeOnly: Bool
    var dotPlacementLayersFadeOnly: Bool
    var lastPresentationStateJSON: String?
    var activeFrameGenerationId: String?
    var activeExecutionBatchId: String?
    var sourceReadyFrameGenerationId: String?
    var sourceReadyExecutionBatchId: String?
    var highlightedMarkerKey: String?
    var highlightedMarkerKeys: Set<String>
    var highlightedRestaurantId: String?
    var interactionMode: String
    var ownerEpoch: Int
    var isOwnerInvalidated: Bool
    var currentViewportIsMoving: Bool
    var keepSourcesHiddenUntilEnter: Bool
    var allowEmptyEnter: Bool
    var currentPresentationOpacityTarget: Double
    var currentPresentationOpacityValue: Double
    var nextSourceCommitSequence: Int
    var pendingPresentationSettleRequestKey: String?
    var pendingPresentationSettleKind: String?
    var blockedEnterStartRequestKey: String?
    var blockedEnterStartCommitFenceStartedAtMs: Double?
    var blockedPresentationSettleRequestKey: String?
    var blockedPresentationSettleKind: String?
    var blockedPresentationCommitFenceStartedAtMs: Double?
    var blockedEnterStartCommitFenceBySourceId: [String: Set<String>]
    var blockedPresentationCommitFenceBySourceId: [String: Set<String>]
    var pendingSourceCommitDataIdsBySourceId: [String: Set<String>]
    var derivedFamilyStates: [String: DerivedFamilyState]
    var residentDesiredSourceCacheBySourceId: [String: ParsedFeatureCollection]
    var isAwaitingSourceRecovery: Bool
    var isReplayingSourceRecovery: Bool
    var sourceRecoveryPausedAtMs: Double?
  }

  private struct SlowActionWindowState {
    var streak: Int = 0
    var startedAtMs: Double = 0
    var maxDurationMs: Double = 0
  }

  private struct NativeApplyAttributionBucket {
    let section: String
    let phase: String
    let source: String
    var count: Int = 0
    var totalMs: Double = 0
    var maxMs: Double = 0
    var operationCount: Int = 0

    mutating func record(durationMs: Double, operationCount: Int) {
      count += 1
      totalMs += durationMs
      maxMs = Swift.max(maxMs, durationMs)
      self.operationCount += operationCount
    }

    func dictionary() -> [String: Any] {
      [
        "section": section,
        "phase": phase,
        "source": source,
        "count": count,
        "totalMs": SearchMapRenderController.round1(totalMs),
        "maxMs": SearchMapRenderController.round1(maxMs),
        "operationCount": operationCount,
      ]
    }
  }

  private struct ResolvedMapHandleResolution {
    let handle: ResolvedMapHandle
    let didRefresh: Bool
  }

  private var hasListeners = false
  private var instances: [String: InstanceState] = [:]
  private var resolvedMapHandles: [String: ResolvedMapHandle] = [:]
  private var enterSettleWorkItems: [String: DispatchWorkItem] = [:]
  private var dismissSettleWorkItems: [String: DispatchWorkItem] = [:]
  private var deferredDismissSourceCleanupWorkItems: [String: DispatchWorkItem] = [:]
  private var revealFrameFallbackWorkItems: [String: DispatchWorkItem] = [:]
  private var dismissFrameFallbackWorkItems: [String: DispatchWorkItem] = [:]
  private var sourceRecoveryWorkItems: [String: DispatchWorkItem] = [:]
  private var nextOwnerEpoch: Int = 1
  private var labelObservationRefreshWorkItems: [String: DispatchWorkItem] = [:]
  private var presentationOpacityAnimators: [String: PresentationOpacityAnimator] = [:]
  private var livePinTransitionAnimators: [String: CADisplayLink] = [:]
  private var lastVisualDiagByInstance: [String: String] = [:]
  private var slowActionWindowsByInstanceAndScope: [String: SlowActionWindowState] = [:]
  private var lastViewCompositionProbeAtMsByInstance: [String: Double] = [:]
  private var lastViewCompositionProbeFrameByInstance: [String: String] = [:]
  private var lastHandleIdentitySignatureByMapTag: [String: String] = [:]
  private var nativeApplyAttributionEnabled = false
  private var nativeApplyAttributionStartedAtMs: Double?
  private var nativeApplyAttributionBuckets: [String: NativeApplyAttributionBucket] = [:]
  private let slowActionThresholdMs = 12.0
  private let viewCompositionProbeThrottleMs = 120.0
  private let frameSettleFallbackDelayMs = 96
  private let sourceRecoveryRetryDelayMs = 32
  private let deferredDismissSourceCleanupDelayMs = 760
  private let revealPrerollPlacementOpacity = 0.001
  private let labelCollisionObstacleLayerIds = [
    "restaurant-labels-pin-collision",
    "restaurant-labels-pin-collision-side-left",
    "restaurant-labels-pin-collision-side-right",
  ]
  private let labelPlacementLayerIds: [String] = {
    let candidatePriorityByPreference: [String: [String]] = [
      "bottom": ["bottom", "right", "top", "left"],
      "right": ["right", "top", "left", "bottom"],
      "top": ["top", "left", "bottom", "right"],
      "left": ["left", "bottom", "right", "top"],
    ]
    let preferredCandidates = ["bottom", "right", "top", "left"]
    return preferredCandidates.flatMap { preferredCandidate in
      (candidatePriorityByPreference[preferredCandidate] ?? []).reversed().map { candidate in
        "restaurant-labels-preferred-\(preferredCandidate)-candidate-\(candidate)"
      }
    }
  }()
  private let dotPlacementLayerIds = [
    "restaurant-dot-layer",
  ]
  // Keep native LOD enter/exit fades aligned with the shared pin fade contract in search-map.tsx.
  private let livePinTransitionDurationMs = 300.0

  @objc
  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    [eventName]
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  override func invalidate() {
    for instanceId in Array(presentationOpacityAnimators.keys) {
      cancelPresentationOpacityAnimation(instanceId: instanceId)
    }
    for instanceId in Array(livePinTransitionAnimators.keys) {
      cancelLivePinTransitionAnimation(instanceId: instanceId)
    }
    for instanceId in Array(labelObservationRefreshWorkItems.keys) {
      labelObservationRefreshWorkItems[instanceId]?.cancel()
      labelObservationRefreshWorkItems[instanceId] = nil
    }
    for instanceId in Array(deferredDismissSourceCleanupWorkItems.keys) {
      deferredDismissSourceCleanupWorkItems[instanceId]?.cancel()
      deferredDismissSourceCleanupWorkItems[instanceId] = nil
    }
    super.invalidate()
  }

  private func allocateOwnerEpoch() -> Int {
    defer { nextOwnerEpoch += 1 }
    return nextOwnerEpoch
  }

  private func nativeApplyAttributionKey(section: String, phase: String, source: String) -> String {
    "\(section)|\(phase)|\(source)"
  }

  private func recordNativeApply(
    section: String,
    phase: String,
    source: String = "all",
    durationMs: Double,
    operationCount: Int = 0
  ) {
    guard nativeApplyAttributionEnabled else {
      return
    }
    let key = nativeApplyAttributionKey(section: section, phase: phase, source: source)
    var bucket = nativeApplyAttributionBuckets[key] ?? NativeApplyAttributionBucket(
      section: section,
      phase: phase,
      source: source
    )
    bucket.record(durationMs: durationMs, operationCount: operationCount)
    nativeApplyAttributionBuckets[key] = bucket
  }

  private func nativeApplySourceFamily(sourceId: String, state: InstanceState) -> String {
    if sourceId == state.pinSourceId {
      return "pins"
    }
    if sourceId == state.pinInteractionSourceId {
      return "pinInteractions"
    }
    if sourceId == state.dotSourceId {
      return "dots"
    }
    if sourceId == state.dotInteractionSourceId {
      return "dotInteractions"
    }
    if sourceId == state.labelSourceId {
      return "labels"
    }
    if sourceId == state.labelInteractionSourceId {
      return "labelInteractions"
    }
    if sourceId == state.labelCollisionSourceId {
      return "labelCollisions"
    }
    return sourceId
  }

  private func flushNativeApplyAttributionSummary(reason: String, reset: Bool) -> [String: Any] {
    let flushedAtMs = Self.nowMs()
    let buckets = nativeApplyAttributionBuckets.values.sorted {
      if $0.totalMs == $1.totalMs {
        return $0.count > $1.count
      }
      return $0.totalMs > $1.totalMs
    }
    let summary: [String: Any] = [
      "reason": reason,
      "enabled": nativeApplyAttributionEnabled,
      "startedAtMs": nativeApplyAttributionStartedAtMs as Any,
      "flushedAtMs": Self.round1(flushedAtMs),
      "bucketCount": buckets.count,
      "topBuckets": buckets.prefix(120).map { $0.dictionary() },
    ]
    if reset {
      nativeApplyAttributionEnabled = false
      nativeApplyAttributionStartedAtMs = nil
      nativeApplyAttributionBuckets.removeAll(keepingCapacity: true)
    }
    return summary
  }

  @objc
  func resetNativeApplyAttribution(
    _ payload: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self else {
        reject("search_map_render_controller_unavailable", "controller deallocated", nil)
        return
      }
      self.nativeApplyAttributionEnabled = true
      self.nativeApplyAttributionStartedAtMs = Self.nowMs()
      self.nativeApplyAttributionBuckets.removeAll(keepingCapacity: true)
      resolve(nil)
    }
  }

  @objc
  func flushNativeApplyAttribution(
    _ payload: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self else {
        reject("search_map_render_controller_unavailable", "controller deallocated", nil)
        return
      }
      let reason = (payload["reason"] as? String) ?? "manual"
      let reset = (payload["reset"] as? NSNumber)?.boolValue ?? true
      resolve(self.flushNativeApplyAttributionSummary(reason: reason, reset: reset))
    }
  }

  private func invalidateRenderOwner(instanceId: String, state: inout InstanceState, reason: String) {
    guard !state.isOwnerInvalidated else {
      return
    }
    state.ownerEpoch = allocateOwnerEpoch()
    state.isOwnerInvalidated = true
    state.activeFrameGenerationId = nil
    state.activeExecutionBatchId = nil
    state.sourceReadyFrameGenerationId = nil
    state.sourceReadyExecutionBatchId = nil
    instances[instanceId] = state
    emit([
      "type": "render_owner_invalidated",
      "instanceId": instanceId,
      "ownerEpoch": state.ownerEpoch,
      "reason": reason,
      "invalidatedAtMs": Self.nowMs(),
    ])
  }

  @objc
  func attach(
    _ payload: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self else {
        reject("search_map_render_controller_unavailable", "controller deallocated", nil)
        return
      }
      guard
        let instanceId = payload["instanceId"] as? String,
        let mapTag = payload["mapTag"] as? NSNumber,
        let pinSourceId = payload["pinSourceId"] as? String,
        let pinInteractionSourceId = payload["pinInteractionSourceId"] as? String,
        let dotSourceId = payload["dotSourceId"] as? String,
        let dotInteractionSourceId = payload["dotInteractionSourceId"] as? String,
        let labelSourceId = payload["labelSourceId"] as? String,
        let labelInteractionSourceId = payload["labelInteractionSourceId"] as? String,
        let labelCollisionSourceId = payload["labelCollisionSourceId"] as? String
      else {
        reject("search_map_render_controller_attach_invalid", "invalid attach payload", nil)
        return
      }
      self.instances[instanceId] = InstanceState(
        mapTag: mapTag,
        pinSourceId: pinSourceId,
        pinInteractionSourceId: pinInteractionSourceId,
        dotSourceId: dotSourceId,
        dotInteractionSourceId: dotInteractionSourceId,
        labelSourceId: labelSourceId,
        labelInteractionSourceId: labelInteractionSourceId,
        labelCollisionSourceId: labelCollisionSourceId,
        lastPinCount: 0,
        lastDotCount: 0,
        lastLabelCount: 0,
        lastPresentationBatchPhase: "idle",
        lastEnterRequestKey: nil,
        enterLane: EnterLaneState(),
        lastEnterStartToken: nil,
        lastEnterStartedRequestKey: nil,
        lastEnterSettledRequestKey: nil,
        lastDismissRequestKey: nil,
        currentPresentationRenderPhase: "idle",
        visualSourceLifecycleState: .dismissed,
        labelCollisionObstacleLayersVisible: false,
        labelPlacementLayersFadeOnly: false,
        dotPlacementLayersFadeOnly: false,
        lastPresentationStateJSON: nil,
        activeFrameGenerationId: nil,
        activeExecutionBatchId: nil,
        sourceReadyFrameGenerationId: nil,
        sourceReadyExecutionBatchId: nil,
        highlightedMarkerKey: nil,
        highlightedMarkerKeys: [],
        highlightedRestaurantId: nil,
        interactionMode: "enabled",
        ownerEpoch: self.allocateOwnerEpoch(),
        isOwnerInvalidated: false,
        currentViewportIsMoving: false,
        keepSourcesHiddenUntilEnter: true,
        allowEmptyEnter: true,
        currentPresentationOpacityTarget: 0,
        currentPresentationOpacityValue: 0,
        nextSourceCommitSequence: 0,
        pendingPresentationSettleRequestKey: nil,
        pendingPresentationSettleKind: nil,
        blockedEnterStartRequestKey: nil,
        blockedEnterStartCommitFenceStartedAtMs: nil,
        blockedPresentationSettleRequestKey: nil,
        blockedPresentationSettleKind: nil,
        blockedPresentationCommitFenceStartedAtMs: nil,
        blockedEnterStartCommitFenceBySourceId: [:],
        blockedPresentationCommitFenceBySourceId: [:],
        pendingSourceCommitDataIdsBySourceId: [:],
        derivedFamilyStates: Self.makeInitialDerivedFamilyStates(
          pinSourceId: pinSourceId,
          pinInteractionSourceId: pinInteractionSourceId,
          dotSourceId: dotSourceId,
          dotInteractionSourceId: dotInteractionSourceId,
          labelSourceId: labelSourceId,
          labelInteractionSourceId: labelInteractionSourceId,
          labelCollisionSourceId: labelCollisionSourceId
        ),
        residentDesiredSourceCacheBySourceId: [:],
        isAwaitingSourceRecovery: false,
        isReplayingSourceRecovery: false,
        sourceRecoveryPausedAtMs: nil
      )
      self.lastViewCompositionProbeAtMsByInstance.removeValue(forKey: instanceId)
      self.lastViewCompositionProbeFrameByInstance.removeValue(forKey: instanceId)
      self.resolveMapHandle(for: mapTag, attemptCount: 0, startTimeMs: CACurrentMediaTime() * 1000) {
        [weak self] result in
        guard let self else {
          reject("search_map_render_controller_unavailable", "controller deallocated", nil)
          return
        }
        switch result {
        case .success(let handle):
          self.installMapSubscriptions(for: mapTag, handle: handle)
          self.resolvedMapHandles[mapTag.stringValue] = handle
          guard let ownerEpoch = self.instances[instanceId]?.ownerEpoch else {
            reject("search_map_render_controller_attach_missing_instance", "attach instance missing", nil)
            return
          }
          self.emit([
            "type": "attached",
            "instanceId": instanceId,
            "mapTag": mapTag,
            "ownerEpoch": ownerEpoch,
          ])
          resolve(nil)
        case .failure(let error):
          self.instances.removeValue(forKey: instanceId)
          self.slowActionWindowsByInstanceAndScope = self.slowActionWindowsByInstanceAndScope.filter {
            !$0.key.hasPrefix("\(instanceId)::")
          }
          self.lastViewCompositionProbeAtMsByInstance.removeValue(forKey: instanceId)
          self.lastViewCompositionProbeFrameByInstance.removeValue(forKey: instanceId)
          self.resolvedMapHandles.removeValue(forKey: mapTag.stringValue)
          reject("search_map_render_controller_attach_resolve_failed", error.localizedDescription, error)
        }
      }
    }
  }

  @objc
  func detach(
    _ instanceId: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      self?.enterSettleWorkItems[instanceId]?.cancel()
      self?.enterSettleWorkItems[instanceId] = nil
      self?.dismissSettleWorkItems[instanceId]?.cancel()
      self?.dismissSettleWorkItems[instanceId] = nil
      self?.deferredDismissSourceCleanupWorkItems[instanceId]?.cancel()
      self?.deferredDismissSourceCleanupWorkItems[instanceId] = nil
      self?.revealFrameFallbackWorkItems[instanceId]?.cancel()
      self?.revealFrameFallbackWorkItems[instanceId] = nil
      self?.dismissFrameFallbackWorkItems[instanceId]?.cancel()
      self?.dismissFrameFallbackWorkItems[instanceId] = nil
      self?.sourceRecoveryWorkItems[instanceId]?.cancel()
      self?.sourceRecoveryWorkItems[instanceId] = nil
      self?.labelObservationRefreshWorkItems[instanceId]?.cancel()
      self?.labelObservationRefreshWorkItems[instanceId] = nil
      self?.cancelPresentationOpacityAnimation(instanceId: instanceId)
      self?.cancelLivePinTransitionAnimation(instanceId: instanceId)
      let mapTag = self?.instances[instanceId]?.mapTag
      self?.instances.removeValue(forKey: instanceId)
      self?.slowActionWindowsByInstanceAndScope = self?.slowActionWindowsByInstanceAndScope.filter {
        !$0.key.hasPrefix("\(instanceId)::")
      } ?? [:]
      self?.lastViewCompositionProbeAtMsByInstance.removeValue(forKey: instanceId)
      self?.lastViewCompositionProbeFrameByInstance.removeValue(forKey: instanceId)
      if let mapTag {
        self?.cleanupMapHandleIfUnused(for: mapTag)
      }
      self?.emit([
        "type": "detached",
        "instanceId": instanceId,
      ])
      resolve(nil)
    }
  }

  @objc
  func setRenderFrame(
    _ payload: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let nativeModuleReceivedAtMs = CACurrentMediaTime() * 1000
    let nativeModuleReceivedAtEpochMs = Date().timeIntervalSince1970 * 1000
    DispatchQueue.main.async { [weak self] in
      let nativeMainStartedAtMs = CACurrentMediaTime() * 1000
      let nativeMainStartedAtEpochMs = Date().timeIntervalSince1970 * 1000
      guard let self else {
        reject("search_map_render_controller_unavailable", "controller deallocated", nil)
        return
      }
      guard let instanceId = payload["instanceId"] as? String else {
        reject("search_map_render_controller_frame_invalid", "invalid render frame payload: missing instanceId", nil)
        return
      }
      guard let ownerEpoch = payload["ownerEpoch"] as? NSNumber else {
        reject("search_map_render_controller_frame_invalid", "invalid render frame payload: missing ownerEpoch", nil)
        return
      }
      guard let attachedState = self.instances[instanceId] else {
        reject("search_map_render_controller_frame_invalid", "unknown instance or frame", nil)
        return
      }
      guard attachedState.ownerEpoch == ownerEpoch.intValue else {
        reject("search_map_render_controller_stale_owner_epoch", "stale owner epoch", nil)
        return
      }
      guard let frameGenerationId = payload["frameGenerationId"] as? String else {
        reject("search_map_render_controller_frame_invalid", "invalid render frame payload: missing frameGenerationId", nil)
        return
      }
      guard let executionBatchId = payload["executionBatchId"] as? String else {
        reject("search_map_render_controller_frame_invalid", "invalid render frame payload: missing executionBatchId", nil)
        return
      }
      guard let presentationStateJSON = payload["presentationStateJson"] as? String else {
        reject("search_map_render_controller_frame_invalid", "invalid render frame payload: missing presentationStateJson", nil)
        return
      }

      let sourceDeltas = payload["sourceDeltas"] as? [[String: Any]]
      let highlightedMarkerKey = payload["highlightedMarkerKey"] as? String
      let highlightedMarkerKeys =
        (payload["highlightedMarkerKeys"] as? [String]) ?? highlightedMarkerKey.map { [$0] } ?? []
      let highlightedRestaurantId = payload["highlightedRestaurantId"] as? String
      let interactionMode = (payload["interactionMode"] as? String) ?? "enabled"
      let actionStartedAt = CACurrentMediaTime() * 1000
      var attributionPhase = attachedState.lastPresentationBatchPhase
      var actionDurationMs: Double = 0
      var syncedFramePhase = attributionPhase
      do {
        let enterRequestKey = Self.readEnterRequestKey(fromJSON: presentationStateJSON)
        let dismissRequestKey = Self.readDismissRequestKey(fromJSON: presentationStateJSON)
        let hasSourcePayload = !(sourceDeltas?.isEmpty ?? true)
        let shouldBypassDismissSnapshotApply =
          dismissRequestKey != nil
        let hasPresentationOnlySourcePayload = !hasSourcePayload
        let shouldBypassEnterSnapshotApply =
          enterRequestKey != nil &&
          hasPresentationOnlySourcePayload &&
          Self.activeDesiredVisualSourceCount(state: attachedState) > 0
        let shouldDropDismissedHiddenSourcePayload =
          enterRequestKey == nil &&
          dismissRequestKey == nil &&
          hasSourcePayload &&
          attachedState.visualSourceLifecycleState == .dismissed &&
          attachedState.currentPresentationRenderPhase == "idle" &&
          attachedState.keepSourcesHiddenUntilEnter
        let shouldBypassSnapshotApply =
          shouldBypassDismissSnapshotApply || shouldBypassEnterSnapshotApply
        let didSyncResidentFrame: Bool
        if shouldDropDismissedHiddenSourcePayload {
          guard var state = self.instances[instanceId] else {
            throw NSError(
              domain: "SearchMapRenderController",
              code: 1,
              userInfo: [NSLocalizedDescriptionKey: "unknown instance"]
            )
          }
          state.activeFrameGenerationId = frameGenerationId
          state.activeExecutionBatchId = executionBatchId
          state.sourceReadyFrameGenerationId = frameGenerationId
          state.sourceReadyExecutionBatchId = executionBatchId
          self.instances[instanceId] = state
          let presentationStartedAt = CACurrentMediaTime() * 1000
          try self.applyPresentationPayload(
            instanceId: instanceId,
            presentationStateJSON: presentationStateJSON
          )
          if var currentState = self.instances[instanceId] {
            try self.clearDismissedResidentSourceState(
              instanceId: instanceId,
              state: &currentState,
              reason: "drop_hidden_dismissed_source_payload"
            )
            self.instances[instanceId] = currentState
          }
          attributionPhase = self.instances[instanceId]?.lastPresentationBatchPhase ?? attributionPhase
          self.recordNativeApply(
            section: "set_frame.drop_hidden_dismissed_source_payload",
            phase: attributionPhase,
            durationMs: CACurrentMediaTime() * 1000 - presentationStartedAt,
            operationCount: sourceDeltas?.count ?? 0
          )
          didSyncResidentFrame = true
        } else if shouldBypassSnapshotApply {
          guard var state = self.instances[instanceId] else {
            throw NSError(
              domain: "SearchMapRenderController",
              code: 1,
              userInfo: [NSLocalizedDescriptionKey: "unknown instance"]
            )
          }
          state.activeFrameGenerationId = frameGenerationId
          state.activeExecutionBatchId = executionBatchId
          state.sourceReadyFrameGenerationId = frameGenerationId
          state.sourceReadyExecutionBatchId = executionBatchId
          self.instances[instanceId] = state
          self.emitVisualDiag(
            instanceId: instanceId,
            message:
              "frame_snapshot_bypass reason=\(shouldBypassEnterSnapshotApply ? "enter_presentation_only" : "dismiss_presentation_only") phase=\(state.lastPresentationBatchPhase)"
          )
          let presentationStartedAt = CACurrentMediaTime() * 1000
          try self.applyPresentationPayload(
            instanceId: instanceId,
            presentationStateJSON: presentationStateJSON
          )
          attributionPhase = self.instances[instanceId]?.lastPresentationBatchPhase ?? attributionPhase
          self.recordNativeApply(
            section: "set_frame.apply_presentation",
            phase: attributionPhase,
            durationMs: CACurrentMediaTime() * 1000 - presentationStartedAt
          )
          didSyncResidentFrame = true
        } else {
          if enterRequestKey == nil {
            let presentationStartedAt = CACurrentMediaTime() * 1000
            try self.applyPresentationPayload(
              instanceId: instanceId,
              presentationStateJSON: presentationStateJSON
            )
            attributionPhase = self.instances[instanceId]?.lastPresentationBatchPhase ?? attributionPhase
            self.recordNativeApply(
              section: "set_frame.apply_presentation",
              phase: attributionPhase,
              durationMs: CACurrentMediaTime() * 1000 - presentationStartedAt
            )
            let snapshotStartedAt = CACurrentMediaTime() * 1000
            didSyncResidentFrame = try self.applyRenderFrameSnapshotPayload(
              instanceId: instanceId,
              generationId: frameGenerationId,
              executionBatchId: executionBatchId,
              sourceDeltas: sourceDeltas,
              allowResidentSourceCacheRestore: false
            )
            attributionPhase = self.instances[instanceId]?.lastPresentationBatchPhase ?? attributionPhase
            self.recordNativeApply(
              section: "set_frame.apply_snapshot",
              phase: attributionPhase,
              durationMs: CACurrentMediaTime() * 1000 - snapshotStartedAt,
              operationCount: sourceDeltas?.count ?? 0
            )
          } else {
            if var state = self.instances[instanceId] {
              state.activeFrameGenerationId = frameGenerationId
              state.activeExecutionBatchId = executionBatchId
              state.sourceReadyFrameGenerationId = nil
              state.sourceReadyExecutionBatchId = nil
              self.instances[instanceId] = state
            }
            let presentationStartedAt = CACurrentMediaTime() * 1000
            try self.applyPresentationPayload(
              instanceId: instanceId,
              presentationStateJSON: presentationStateJSON
            )
            attributionPhase = self.instances[instanceId]?.lastPresentationBatchPhase ?? attributionPhase
            self.recordNativeApply(
              section: "set_frame.apply_presentation",
              phase: attributionPhase,
              durationMs: CACurrentMediaTime() * 1000 - presentationStartedAt
            )
            let snapshotStartedAt = CACurrentMediaTime() * 1000
            didSyncResidentFrame = try self.applyRenderFrameSnapshotPayload(
              instanceId: instanceId,
              generationId: frameGenerationId,
              executionBatchId: executionBatchId,
              sourceDeltas: sourceDeltas,
              allowResidentSourceCacheRestore: true
            )
            attributionPhase = self.instances[instanceId]?.lastPresentationBatchPhase ?? attributionPhase
            self.recordNativeApply(
              section: "set_frame.apply_snapshot",
              phase: attributionPhase,
              durationMs: CACurrentMediaTime() * 1000 - snapshotStartedAt,
              operationCount: sourceDeltas?.count ?? 0
            )
          }
        }
        let interactionStartedAt = CACurrentMediaTime() * 1000
        try self.applyInteractionModePayload(
          instanceId: instanceId,
          interactionMode: interactionMode
        )
        attributionPhase = self.instances[instanceId]?.lastPresentationBatchPhase ?? attributionPhase
        self.recordNativeApply(
          section: "set_frame.apply_interaction_mode",
          phase: attributionPhase,
          durationMs: CACurrentMediaTime() * 1000 - interactionStartedAt
        )
        let highlightedStartedAt = CACurrentMediaTime() * 1000
        try self.applyHighlightedMarkerPayload(
          instanceId: instanceId,
          markerKey: highlightedMarkerKey,
          markerKeys: highlightedMarkerKeys,
          restaurantId: highlightedRestaurantId
        )
        attributionPhase = self.instances[instanceId]?.lastPresentationBatchPhase ?? attributionPhase
        self.recordNativeApply(
          section: "set_frame.apply_highlighted_marker",
          phase: attributionPhase,
          durationMs: CACurrentMediaTime() * 1000 - highlightedStartedAt
        )
        if didSyncResidentFrame, var state = self.instances[instanceId] {
          let emitStartedAt = CACurrentMediaTime() * 1000
          let sourceRevisions = self.currentMountedSourceRevisions(state: state)
          self.emit([
            "type": "render_frame_synced",
            "instanceId": instanceId,
            "frameGenerationId": frameGenerationId,
            "executionBatchId": executionBatchId,
            "ownerEpoch": state.ownerEpoch,
            "pinCount": state.lastPinCount,
            "dotCount": state.lastDotCount,
            "labelCount": state.lastLabelCount,
            "sourceRevisions": sourceRevisions,
          ])
          self.recordNativeApply(
            section: "set_frame.emit_synced",
            phase: state.lastPresentationBatchPhase,
            durationMs: CACurrentMediaTime() * 1000 - emitStartedAt
          )
          if let sourceDeltas,
             !sourceDeltas.isEmpty,
             state.visualSourceLifecycleState == .dismissed,
             state.currentPresentationRenderPhase == "idle",
             state.keepSourcesHiddenUntilEnter,
             let dismissRequestKey = state.lastDismissRequestKey {
            self.scheduleDeferredDismissSourceCleanup(
              instanceId: instanceId,
              requestKey: dismissRequestKey,
              reason: "dismiss_hidden_source_frame"
            )
          }
          self.maybeElectMountedHiddenExecutionBatch(instanceId: instanceId, state: &state)
          self.maybeEmitExecutionBatchArmed(instanceId: instanceId, state: &state)
          let totalDurationMs = CACurrentMediaTime() * 1000 - actionStartedAt
          actionDurationMs = totalDurationMs
          syncedFramePhase = state.lastPresentationBatchPhase
          self.recordNativeApply(
            section: "set_frame.total",
            phase: state.lastPresentationBatchPhase,
            durationMs: totalDurationMs,
            operationCount: sourceDeltas?.count ?? 0
          )
          self.recordSlowActionWindow(
            instanceId: instanceId,
            scope: "moving_native_set_render_frame",
            durationMs: totalDurationMs,
            thresholdMs: state.currentViewportIsMoving ? 90 : .greatestFiniteMagnitude,
            state: state,
            extra: "frame=\(frameGenerationId)"
          )
          self.recordSlowActionWindow(
            instanceId: instanceId,
            scope: "reveal_native_set_render_frame",
            durationMs: totalDurationMs,
            thresholdMs: state.lastPresentationBatchPhase == "entering" ? 120 : .greatestFiniteMagnitude,
            state: state,
            extra: "frame=\(frameGenerationId)"
          )
          if totalDurationMs >= self.slowActionThresholdMs {
            self.emit([
              "type": "error",
              "instanceId": "__native_diag__",
              "message":
                "slow_action action=setRenderFrame phase=\(state.lastPresentationBatchPhase) totalMs=\(Int(totalDurationMs.rounded())) pins=\(state.lastPinCount) dots=\(state.lastDotCount) labels=\(state.lastLabelCount)",
            ])
          }
        }
        let nativeResolveStartedAtMs = CACurrentMediaTime() * 1000
        let nativeResolveStartedAtEpochMs = Date().timeIntervalSince1970 * 1000
        resolve([
          "nativeModuleQueueWaitDurationMs": Self.round1(nativeMainStartedAtMs - nativeModuleReceivedAtMs),
          "nativeMainExecutionDurationMs": Self.round1(nativeResolveStartedAtMs - nativeMainStartedAtMs),
          "nativeSetFrameActionDurationMs": Self.round1(actionDurationMs),
          "nativeSetFramePhase": syncedFramePhase,
          "nativeDidSyncResidentFrame": didSyncResidentFrame,
          "nativeResolveStartedAtMs": Self.round1(nativeResolveStartedAtMs),
          "nativeModuleReceivedAtEpochMs": Self.round1(nativeModuleReceivedAtEpochMs),
          "nativeMainStartedAtEpochMs": Self.round1(nativeMainStartedAtEpochMs),
          "nativeResolveStartedAtEpochMs": Self.round1(nativeResolveStartedAtEpochMs),
        ])
      } catch {
        reject(
          "search_map_render_controller_frame_apply_failed",
          error.localizedDescription,
          error
        )
      }
    }
  }

  @objc
  func notifyFrameRendered(
    _ instanceId: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(nil)
  }

  private func applyRenderFrameSnapshotPayload(
    instanceId: String,
    generationId: String,
    executionBatchId: String,
    sourceDeltas: [[String: Any]]?,
    allowResidentSourceCacheRestore: Bool
  ) throws -> Bool {
    guard var state = self.instances[instanceId] else {
      throw NSError(
        domain: "SearchMapRenderController",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "unknown instance"]
      )
    }
    let actionStartedAt = CACurrentMediaTime() * 1000
    self.emitVisualDiag(
      instanceId: instanceId,
      message:
        "frame_begin phase=\(state.lastPresentationBatchPhase) opacity=\(state.currentPresentationOpacityTarget) revealRequest=\(state.lastEnterRequestKey ?? "nil") revealStarted=\(state.lastEnterStartedRequestKey ?? "nil") revealSettled=\(state.lastEnterSettledRequestKey ?? "nil") dismissRequest=\(state.lastDismissRequestKey ?? "nil")"
    )
    if let sourceDeltas {
      let parseStartedAt = CACurrentMediaTime() * 1000
      let parsedDeltas = try Self.parseSourceDeltas(sourceDeltas)
      self.recordNativeApply(
        section: "snapshot.parse_source_deltas",
        phase: state.lastPresentationBatchPhase,
        durationMs: CACurrentMediaTime() * 1000 - parseStartedAt,
        operationCount: parsedDeltas.count
      )
      for delta in parsedDeltas {
        let deltaStartedAt = CACurrentMediaTime() * 1000
        var familyState = Self.derivedFamilyState(sourceId: delta.sourceId, state: state)
        familyState.desiredCollection = try Self.applyParsedCollectionDelta(
          delta,
          to: familyState.desiredCollection
        )
        Self.setDerivedFamilyState(familyState, sourceId: delta.sourceId, state: &state)
        self.recordNativeApply(
          section: "snapshot.apply_parsed_delta",
          phase: state.lastPresentationBatchPhase,
          source: nativeApplySourceFamily(sourceId: delta.sourceId, state: state),
          durationMs: CACurrentMediaTime() * 1000 - deltaStartedAt,
          operationCount: delta.nextFeatureIdsInOrder.count
        )
      }
    }
    if allowResidentSourceCacheRestore && (sourceDeltas?.isEmpty ?? true) {
      let restoreStartedAt = CACurrentMediaTime() * 1000
      let didRestoreResidentSources = Self.restoreResidentDesiredSourceCacheForEnter(state: &state)
      if didRestoreResidentSources {
        self.recordNativeApply(
          section: "snapshot.restore_resident_source_cache",
          phase: state.lastPresentationBatchPhase,
          durationMs: CACurrentMediaTime() * 1000 - restoreStartedAt,
          operationCount: state.residentDesiredSourceCacheBySourceId.count
        )
        self.emitVisualDiag(
          instanceId: instanceId,
          message:
            "resident_source_cache_restored frame=\(generationId) cacheSources=\(state.residentDesiredSourceCacheBySourceId.count)"
        )
      }
    }
    state.lastPinCount =
      Self.derivedFamilyState(sourceId: state.pinSourceId, state: state).desiredCollection.idsInOrder.count
    state.lastDotCount =
      Self.derivedFamilyState(sourceId: state.dotSourceId, state: state).desiredCollection.idsInOrder.count
    state.lastLabelCount =
      Self.derivedFamilyState(sourceId: state.labelSourceId, state: state).desiredCollection.idsInOrder.count
    state.activeFrameGenerationId = generationId
    state.activeExecutionBatchId = executionBatchId
    state.sourceReadyFrameGenerationId = nil
    state.sourceReadyExecutionBatchId = nil
    self.instances[instanceId] = state
    let reconcileStartedAt = CACurrentMediaTime() * 1000
    try self.reconcileAndApplyCurrentFrameSnapshots(for: instanceId)
    state = self.instances[instanceId] ?? state
    self.recordNativeApply(
      section: "snapshot.reconcile_current_frame",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - reconcileStartedAt
    )
    if Self.isSourceRecoveryActive(state) {
      self.emitVisualDiag(
        instanceId: instanceId,
        message: "frame_apply_deferred reason=source_recovery phase=\(state.lastPresentationBatchPhase)"
      )
      self.instances[instanceId] = state
      return false
    }
    self.emitVisualDiag(
      instanceId: instanceId,
      message:
        "frame_after_reconcile phase=\(state.lastPresentationBatchPhase) opacity=\(state.currentPresentationOpacityTarget) revealRequest=\(state.lastEnterRequestKey ?? "nil") revealStarted=\(state.lastEnterStartedRequestKey ?? "nil") revealSettled=\(state.lastEnterSettledRequestKey ?? "nil") dismissRequest=\(state.lastDismissRequestKey ?? "nil")"
    )
    let highlightedStartedAt = CACurrentMediaTime() * 1000
    try self.applyHighlightedMarkerState(for: state, instanceId: instanceId)
    self.recordNativeApply(
      section: "snapshot.apply_highlighted_marker",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - highlightedStartedAt
    )
    if self.shouldSuppressInteractions(state: state) {
      let suppressionStartedAt = CACurrentMediaTime() * 1000
      try self.applyInteractionSuppression(for: &state, instanceId: instanceId)
      self.recordNativeApply(
        section: "snapshot.apply_interaction_suppression",
        phase: state.lastPresentationBatchPhase,
        durationMs: CACurrentMediaTime() * 1000 - suppressionStartedAt
      )
    }
    let opacityStartedAt = CACurrentMediaTime() * 1000
    try self.applyCurrentPresentationOpacity(
      for: &state,
      instanceId: instanceId,
      reason: "frame_apply"
    )
    self.recordNativeApply(
      section: "snapshot.apply_current_presentation_opacity",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - opacityStartedAt
    )
    let presentationOpacity = state.currentPresentationOpacityValue
    self.emitVisualDiag(
      instanceId: instanceId,
      message:
        "frame_apply phase=\(state.lastPresentationBatchPhase) opacity=\(presentationOpacity) pins=\(state.lastPinCount) dots=\(state.lastDotCount) labels=\(state.lastLabelCount) \(Self.phaseSummary(for: state))"
    )
    if let latestState = self.instances[instanceId],
       (latestState.lastPresentationBatchPhase != state.lastPresentationBatchPhase ||
         latestState.currentPresentationOpacityTarget != state.currentPresentationOpacityTarget ||
         latestState.lastEnterStartedRequestKey != state.lastEnterStartedRequestKey ||
         latestState.lastEnterSettledRequestKey != state.lastEnterSettledRequestKey) {
      self.emitVisualDiag(
        instanceId: instanceId,
        message:
          "frame_final_write_mismatch localPhase=\(state.lastPresentationBatchPhase) localOpacity=\(state.currentPresentationOpacityTarget) localRevealStarted=\(state.lastEnterStartedRequestKey ?? "nil") localRevealSettled=\(state.lastEnterSettledRequestKey ?? "nil") latestPhase=\(latestState.lastPresentationBatchPhase) latestOpacity=\(latestState.currentPresentationOpacityTarget) latestRevealStarted=\(latestState.lastEnterStartedRequestKey ?? "nil") latestRevealSettled=\(latestState.lastEnterSettledRequestKey ?? "nil")"
      )
    }
    state = self.instances[instanceId] ?? state
    let totalDurationMs = CACurrentMediaTime() * 1000 - actionStartedAt
    self.recordNativeApply(
      section: "snapshot.total",
      phase: state.lastPresentationBatchPhase,
      durationMs: totalDurationMs,
      operationCount: sourceDeltas?.count ?? 0
    )
    self.recordSlowActionWindow(
      instanceId: instanceId,
      scope: "moving_native_snapshot_apply",
      durationMs: totalDurationMs,
      thresholdMs: state.currentViewportIsMoving ? 90 : .greatestFiniteMagnitude,
      state: state,
      extra: "frame=\(generationId)"
    )
    self.recordSlowActionWindow(
      instanceId: instanceId,
      scope: "reveal_native_snapshot_apply",
      durationMs: totalDurationMs,
      thresholdMs: state.lastPresentationBatchPhase == "entering" ? 120 : .greatestFiniteMagnitude,
      state: state,
      extra: "frame=\(generationId)"
    )
    if totalDurationMs >= self.slowActionThresholdMs {
      self.emit([
        "type": "error",
        "instanceId": "__native_diag__",
        "message":
          "slow_action action=applyFrameSnapshot phase=\(state.lastPresentationBatchPhase) totalMs=\(Int(totalDurationMs.rounded())) pins=\(state.lastPinCount) dots=\(state.lastDotCount) labels=\(state.lastLabelCount)",
      ])
    }
    state.sourceReadyFrameGenerationId = generationId
    state.sourceReadyExecutionBatchId = executionBatchId
    self.instances[instanceId] = state
    return true
  }

  private func applyPresentationPayload(
    instanceId: String,
    presentationStateJSON: String
  ) throws {
    guard var state = self.instances[instanceId] else {
      throw NSError(
        domain: "SearchMapRenderController",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "unknown instance"]
      )
    }
    let actionStartedAt = CACurrentMediaTime() * 1000
    if state.lastPresentationStateJSON == presentationStateJSON {
      self.instances[instanceId] = state
      self.recordNativeApply(
        section: "presentation.apply_same_state",
        phase: state.lastPresentationBatchPhase,
        durationMs: CACurrentMediaTime() * 1000 - actionStartedAt
      )
      return
    }
    let previousPresentationBatchPhase = state.lastPresentationBatchPhase
    let previousPresentationOpacityTarget = state.currentPresentationOpacityTarget
    state.lastPresentationStateJSON = presentationStateJSON
    state.lastPresentationBatchPhase = Self.readPresentationBatchPhase(fromJSON: presentationStateJSON)
    let revealRequestKey = Self.readEnterRequestKey(fromJSON: presentationStateJSON)
    let revealStatus = Self.readEnterStatus(fromJSON: presentationStateJSON)
    let revealStartToken = Self.readEnterStartToken(fromJSON: presentationStateJSON)
    state.allowEmptyEnter = Self.readAllowEmptyEnter(fromJSON: presentationStateJSON)
    if revealRequestKey != state.lastEnterRequestKey {
      self.enterSettleWorkItems[instanceId]?.cancel()
      self.enterSettleWorkItems[instanceId] = nil
      state.lastEnterRequestKey = revealRequestKey
      state.enterLane = EnterLaneState()
      state.lastEnterStartToken = nil
      state.lastEnterStartedRequestKey = nil
      state.lastEnterSettledRequestKey = nil
      state.pendingPresentationSettleRequestKey = nil
      state.pendingPresentationSettleKind = nil
      state.blockedEnterStartRequestKey = nil
      state.blockedEnterStartCommitFenceStartedAtMs = nil
      state.blockedEnterStartCommitFenceBySourceId.removeAll()
      state.blockedPresentationCommitFenceBySourceId.removeAll()
      state.blockedPresentationSettleRequestKey = nil
      state.blockedPresentationSettleKind = nil
      state.blockedPresentationCommitFenceStartedAtMs = nil
      if let revealRequestKey {
        self.beginRevealVisualLifecycle(
          instanceId: instanceId,
          state: &state,
          reason: "new_reveal_request"
        )
        self.instances[instanceId] = state
        let reconcileStartedAt = CACurrentMediaTime() * 1000
        try self.reconcileAndApplyCurrentFrameSnapshots(for: instanceId)
        state = self.instances[instanceId] ?? state
        self.recordNativeApply(
          section: "presentation.reveal_preroll_reconcile",
          phase: state.lastPresentationBatchPhase,
          durationMs: CACurrentMediaTime() * 1000 - reconcileStartedAt
        )
        let opacityStartedAt = CACurrentMediaTime() * 1000
        try self.setPresentationOpacityImmediate(
          self.revealPrerollPlacementOpacity,
          for: &state,
          instanceId: instanceId,
          reason: "reveal_preroll"
        )
        self.recordNativeApply(
          section: "presentation.reveal_preroll_opacity",
          phase: state.lastPresentationBatchPhase,
          durationMs: CACurrentMediaTime() * 1000 - opacityStartedAt
        )
        let commitFence = self.capturePendingVisualSourceCommitFence(state: state)
        if self.hasPendingCommitFence(commitFence) {
          state.blockedEnterStartRequestKey = revealRequestKey
          state.blockedEnterStartCommitFenceStartedAtMs = Self.nowMs()
          state.blockedEnterStartCommitFenceBySourceId = commitFence
          state.currentPresentationRenderPhase = "enter_wait_commit"
          self.instances[instanceId] = state
          self.emitVisualDiag(
            instanceId: instanceId,
            message:
              "reveal_start_commit_fence_blocked pending=\(self.describeCommitFence(commitFence)) \(self.commitFenceWaitSummary(state: state))"
          )
        } else {
          state.blockedEnterStartCommitFenceStartedAtMs = nil
        }
        self.emitVisualDiag(
          instanceId: instanceId,
          message:
            "reveal_generation_ready frame=\(state.activeFrameGenerationId ?? "nil") renderPhase=\(state.currentPresentationRenderPhase)"
        )
      }
    }
    state.enterLane.requestedRequestKey = revealRequestKey
    maybeElectMountedHiddenExecutionBatch(instanceId: instanceId, state: &state)
    if
      let revealRequestKey,
      let revealStartToken,
      revealStatus == "entering",
      state.lastPresentationBatchPhase == "entering",
      state.enterLane.requestedRequestKey == revealRequestKey,
      state.enterLane.mountedHidden != nil,
      state.lastEnterStartToken != revealStartToken,
      state.lastEnterStartedRequestKey != revealRequestKey,
      state.blockedEnterStartRequestKey == nil
    {
      do {
        let enterStartedAt = CACurrentMediaTime() * 1000
        try self.startEnterPresentation(
          instanceId: instanceId,
          requestKey: revealRequestKey,
          revealStartToken: revealStartToken,
          previousPresentationBatchPhase: previousPresentationBatchPhase,
          previousPresentationOpacityTarget: previousPresentationOpacityTarget
        )
        state = self.instances[instanceId] ?? state
        self.recordNativeApply(
          section: "presentation.start_enter",
          phase: state.lastPresentationBatchPhase,
          durationMs: CACurrentMediaTime() * 1000 - enterStartedAt
        )
      } catch {
        self.emit([
          "type": "error",
          "instanceId": instanceId,
          "message": "reveal_start_opacity_apply_failed: \(error.localizedDescription)",
        ])
      }
    }
    let previousDismissRequestKey = state.lastDismissRequestKey
    let dismissRequestKey = Self.readDismissRequestKey(fromJSON: presentationStateJSON)
    if dismissRequestKey != state.lastDismissRequestKey {
      self.enterSettleWorkItems[instanceId]?.cancel()
      self.enterSettleWorkItems[instanceId] = nil
      self.revealFrameFallbackWorkItems[instanceId]?.cancel()
      self.revealFrameFallbackWorkItems[instanceId] = nil
      state.pendingPresentationSettleRequestKey = nil
      state.pendingPresentationSettleKind = nil
      state.blockedPresentationSettleRequestKey = nil
      state.blockedPresentationSettleKind = nil
      state.blockedPresentationCommitFenceBySourceId.removeAll()
      self.dismissSettleWorkItems[instanceId]?.cancel()
      self.dismissSettleWorkItems[instanceId] = nil
      self.dismissFrameFallbackWorkItems[instanceId]?.cancel()
      self.dismissFrameFallbackWorkItems[instanceId] = nil
      state.lastDismissRequestKey = dismissRequestKey
      if let dismissRequestKey {
        self.beginDismissVisualLifecycle(instanceId: instanceId, state: &state)
        self.instances[instanceId] = state
        let opacityStartedAt = CACurrentMediaTime() * 1000
        try self.animatePresentationOpacity(
          to: 0,
          for: &state,
          instanceId: instanceId,
          reason: "dismiss_start"
        )
        self.recordNativeApply(
          section: "presentation.dismiss_start_opacity",
          phase: state.lastPresentationBatchPhase,
          durationMs: CACurrentMediaTime() * 1000 - opacityStartedAt
        )
        let startedAtMs = Self.nowMs()
        self.emit([
          "type": "presentation_exit_started",
          "instanceId": instanceId,
          "requestKey": dismissRequestKey,
          "frameGenerationId": state.activeFrameGenerationId as Any,
          "pinCount": state.lastPinCount,
          "dotCount": state.lastDotCount,
          "labelCount": state.lastLabelCount,
          "startedAtMs": startedAtMs,
        ])
        self.emitVisualDiag(
          instanceId: instanceId,
          message:
            "presentation_transition previousPhase=\(previousPresentationBatchPhase) nextPhase=\(state.lastPresentationBatchPhase) previousOpacity=\(previousPresentationOpacityTarget) nextOpacity=\(state.currentPresentationOpacityTarget) revealRequest=\(state.lastEnterRequestKey ?? "nil") dismissRequest=\(dismissRequestKey)"
        )
        let workItem = DispatchWorkItem { [weak self] in
          guard let self else { return }
          self.dismissSettleWorkItems[instanceId] = nil
          guard var latestState = self.instances[instanceId] else { return }
          guard latestState.lastDismissRequestKey == dismissRequestKey else { return }
          let commitFence = self.capturePendingVisualSourceCommitFence(state: latestState)
          if self.hasPendingCommitFence(commitFence) {
            latestState.blockedPresentationSettleRequestKey = dismissRequestKey
            latestState.blockedPresentationSettleKind = "exit"
            latestState.blockedPresentationCommitFenceStartedAtMs = Self.nowMs()
            latestState.blockedPresentationCommitFenceBySourceId = commitFence
            latestState.currentPresentationRenderPhase = "exit_preroll"
            self.emitVisualDiag(
              instanceId: instanceId,
              message:
                "dismiss_commit_fence_blocked pending=\(self.describeCommitFence(commitFence)) \(self.commitFenceWaitSummary(state: latestState))"
            )
          } else {
            latestState.blockedPresentationCommitFenceStartedAtMs = nil
            latestState.currentPresentationRenderPhase = "exiting"
            latestState.pendingPresentationSettleRequestKey = dismissRequestKey
            latestState.pendingPresentationSettleKind = "exit"
            self.armNativeDismissSettle(instanceId: instanceId, requestKey: dismissRequestKey)
          }
          self.instances[instanceId] = latestState
        }
        self.dismissSettleWorkItems[instanceId] = workItem
        DispatchQueue.main.asyncAfter(
          deadline: .now() + .milliseconds(self.dismissSettleDelayMs),
          execute: workItem
        )
      } else if let previousDismissRequestKey {
        if state.visualSourceLifecycleState == .dismissed {
          state.currentPresentationRenderPhase = "idle"
          state.keepSourcesHiddenUntilEnter = true
          state.currentPresentationOpacityTarget = 0
          state.currentPresentationOpacityValue = 0
          self.instances[instanceId] = state
          self.emitVisualDiag(
            instanceId: instanceId,
            message: "dismiss_clear_already_dismissed request=\(previousDismissRequestKey)"
          )
        } else {
          state.currentPresentationRenderPhase = state.lastPresentationBatchPhase == "idle" ? "live" : "idle"
          state.visualSourceLifecycleState = .visible
          self.instances[instanceId] = state
          let reconcileStartedAt = CACurrentMediaTime() * 1000
          try self.reconcileAndApplyCurrentFrameSnapshots(for: instanceId)
          state = self.instances[instanceId] ?? state
          self.recordNativeApply(
            section: "presentation.dismiss_clear_reconcile",
            phase: state.lastPresentationBatchPhase,
            durationMs: CACurrentMediaTime() * 1000 - reconcileStartedAt
          )
          let restoredOpacity =
            state.keepSourcesHiddenUntilEnter
            ? 0.0
            : (state.lastPresentationBatchPhase == "idle" ? 1.0 : state.currentPresentationOpacityTarget)
          state.currentPresentationOpacityTarget = restoredOpacity
          self.instances[instanceId] = state
          let opacityStartedAt = CACurrentMediaTime() * 1000
          try self.setPresentationOpacityImmediate(
            restoredOpacity,
            for: &state,
            instanceId: instanceId,
            reason: "dismiss_clear"
          )
          self.recordNativeApply(
            section: "presentation.dismiss_clear_opacity",
            phase: state.lastPresentationBatchPhase,
            durationMs: CACurrentMediaTime() * 1000 - opacityStartedAt
          )
        }
      }
    }
    if let revealRequestKey {
      state.enterLane.requestedRequestKey = revealRequestKey
      maybeElectMountedHiddenExecutionBatch(instanceId: instanceId, state: &state)
      if
        let revealStartToken,
        revealStatus == "entering",
        state.lastPresentationBatchPhase == "entering",
        state.enterLane.requestedRequestKey == revealRequestKey,
        state.enterLane.mountedHidden != nil,
        state.lastEnterStartToken != revealStartToken,
        state.lastEnterStartedRequestKey != revealRequestKey,
        state.blockedEnterStartRequestKey == nil
      {
        do {
          let enterStartedAt = CACurrentMediaTime() * 1000
          try self.startEnterPresentation(
            instanceId: instanceId,
            requestKey: revealRequestKey,
            revealStartToken: revealStartToken,
            previousPresentationBatchPhase: previousPresentationBatchPhase,
            previousPresentationOpacityTarget: previousPresentationOpacityTarget
          )
          state = self.instances[instanceId] ?? state
          self.recordNativeApply(
            section: "presentation.start_enter_after_dismiss_clear",
            phase: state.lastPresentationBatchPhase,
            durationMs: CACurrentMediaTime() * 1000 - enterStartedAt
          )
        } catch {
          self.emit([
            "type": "error",
            "instanceId": instanceId,
            "message": "reveal_start_after_dismiss_clear_failed: \(error.localizedDescription)",
          ])
        }
      }
    }
    if
      state.lastDismissRequestKey == nil,
      state.lastEnterRequestKey == nil,
      Self.shouldHidePresentationWithoutActiveRequests(state.lastPresentationBatchPhase),
      state.currentPresentationOpacityTarget != 0
    {
      let startedAtMs = Self.nowMs()
      state.currentPresentationOpacityTarget = 0
      state.visualSourceLifecycleState = .dismissing
      self.instances[instanceId] = state
      let opacityStartedAt = CACurrentMediaTime() * 1000
      try self.animatePresentationOpacity(
        to: 0,
        for: &state,
        instanceId: instanceId,
        reason: "presentation_preroll"
      )
      self.recordNativeApply(
        section: "presentation.preroll_opacity",
        phase: state.lastPresentationBatchPhase,
        durationMs: CACurrentMediaTime() * 1000 - opacityStartedAt
      )
      self.emit([
        "type": "presentation_preroll_started",
        "instanceId": instanceId,
        "phase": state.lastPresentationBatchPhase,
        "coverState": Self.readCoverState(fromJSON: presentationStateJSON) as Any,
        "frameGenerationId": state.activeFrameGenerationId as Any,
        "pinCount": state.lastPinCount,
        "dotCount": state.lastDotCount,
        "labelCount": state.lastLabelCount,
        "startedAtMs": startedAtMs,
      ])
    }
    if previousPresentationBatchPhase != "idle", state.lastPresentationBatchPhase == "idle" {
      state.currentPresentationRenderPhase = "live"
      let idleOpacityTarget = state.keepSourcesHiddenUntilEnter ? 0.0 : 1.0
      if state.currentPresentationOpacityTarget != idleOpacityTarget {
        state.currentPresentationOpacityTarget = idleOpacityTarget
        self.instances[instanceId] = state
        let opacityStartedAt = CACurrentMediaTime() * 1000
        try? self.setPresentationOpacityImmediate(
          idleOpacityTarget,
          for: &state,
          instanceId: instanceId,
          reason: "presentation_idle"
        )
        state = self.instances[instanceId] ?? state
        self.recordNativeApply(
          section: "presentation.idle_opacity",
          phase: state.lastPresentationBatchPhase,
          durationMs: CACurrentMediaTime() * 1000 - opacityStartedAt
        )
      }
    }
    self.instances[instanceId] = state
    let totalDurationMs = CACurrentMediaTime() * 1000 - actionStartedAt
    self.recordNativeApply(
      section: "presentation.apply",
      phase: state.lastPresentationBatchPhase,
      durationMs: totalDurationMs
    )
    self.recordSlowActionWindow(
      instanceId: instanceId,
      scope: "moving_native_presentation_apply",
      durationMs: totalDurationMs,
      thresholdMs: state.currentViewportIsMoving ? 90 : .greatestFiniteMagnitude,
      state: state
    )
    self.recordSlowActionWindow(
      instanceId: instanceId,
      scope: "reveal_native_presentation_apply",
      durationMs: totalDurationMs,
      thresholdMs: state.lastPresentationBatchPhase == "entering" ? 120 : .greatestFiniteMagnitude,
      state: state
    )
    if totalDurationMs >= self.slowActionThresholdMs {
      self.emit([
        "type": "error",
        "instanceId": "__native_diag__",
        "message":
          "slow_action action=applyFramePresentation phase=\(state.lastPresentationBatchPhase) totalMs=\(Int(totalDurationMs.rounded())) revealKey=\(state.lastEnterRequestKey ?? "nil") dismissKey=\(state.lastDismissRequestKey ?? "nil")",
      ])
    }
  }

  private func applyHighlightedMarkerPayload(
    instanceId: String,
    markerKey: String?,
    markerKeys: [String],
    restaurantId: String?
  ) throws {
    guard var state = instances[instanceId] else {
      throw NSError(
        domain: "SearchMapRenderController",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "unknown instance"]
      )
    }
    let nextHighlightedMarkerKeys = Set(markerKeys)
    let nextHighlightedRestaurantId =
      restaurantId.flatMap { $0.isEmpty ? nil : $0 }
    if state.highlightedMarkerKey == markerKey &&
      state.highlightedMarkerKeys == nextHighlightedMarkerKeys &&
      state.highlightedRestaurantId == nextHighlightedRestaurantId {
      return
    }
    state.highlightedMarkerKey = markerKey
    state.highlightedMarkerKeys = nextHighlightedMarkerKeys
    state.highlightedRestaurantId = nextHighlightedRestaurantId
    instances[instanceId] = state
    try applyHighlightedMarkerState(for: state, instanceId: instanceId)
  }

  private func applyInteractionModePayload(
    instanceId: String,
    interactionMode: String
  ) throws {
    guard var state = instances[instanceId] else {
      throw NSError(
        domain: "SearchMapRenderController",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "unknown instance"]
      )
    }
    let nextMode = interactionMode == "suppressed" ? "suppressed" : "enabled"
    if state.interactionMode == nextMode {
      if nextMode == "suppressed" {
        var updatedState = state
        try applyInteractionSuppression(for: &updatedState, instanceId: instanceId)
        instances[instanceId] = updatedState
      }
      return
    }
    state.interactionMode = nextMode
    instances[instanceId] = state
    if shouldSuppressInteractions(state: state) {
      var updatedState = state
      try applyInteractionSuppression(for: &updatedState, instanceId: instanceId)
      instances[instanceId] = updatedState
    } else {
      try reconcileAndApplyCurrentFrameSnapshots(for: instanceId)
      if var updatedState = instances[instanceId] {
        try applyHighlightedMarkerState(for: updatedState, instanceId: instanceId)
        try applyCurrentPresentationOpacity(
          for: &updatedState,
          instanceId: instanceId,
          reason: "interaction_mode_apply"
        )
      }
    }
  }

  @objc
  func configureLabelObservation(
    _ payload: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self else {
        reject("search_map_render_controller_unavailable", "controller deallocated", nil)
        return
      }
      guard let instanceId = payload["instanceId"] as? String else {
        reject(
          "search_map_render_controller_configure_label_observation_invalid",
          "missing instanceId",
          nil
        )
        return
      }
      guard self.instances[instanceId] != nil else {
        reject(
          "search_map_render_controller_configure_label_observation_invalid",
          "unknown instance",
          nil
        )
        return
      }
      let observationEnabled = (payload["observationEnabled"] as? Bool) ?? false
      let allowFallback = (payload["allowFallback"] as? Bool) ?? false
      let commitInteractionVisibility = (payload["commitInteractionVisibility"] as? Bool) ?? false
      let enableStickyLabelCandidates = (payload["enableStickyLabelCandidates"] as? Bool) ?? false
      let stickyLockStableMsMoving = (payload["stickyLockStableMsMoving"] as? NSNumber)?.doubleValue ?? 0
      let stickyLockStableMsIdle = (payload["stickyLockStableMsIdle"] as? NSNumber)?.doubleValue ?? 0
      let stickyUnlockMissingMsMoving =
        (payload["stickyUnlockMissingMsMoving"] as? NSNumber)?.doubleValue ?? 0
      let stickyUnlockMissingMsIdle =
        (payload["stickyUnlockMissingMsIdle"] as? NSNumber)?.doubleValue ?? 0
      let stickyUnlockMissingStreakMoving =
        (payload["stickyUnlockMissingStreakMoving"] as? NSNumber)?.intValue ?? 1
      let labelResetRequestKey = payload["labelResetRequestKey"] as? String
      self.configureLabelObservation(
        instanceId: instanceId,
        observationEnabled: observationEnabled,
        allowFallback: allowFallback,
        commitInteractionVisibility: commitInteractionVisibility,
        enableStickyLabelCandidates: enableStickyLabelCandidates,
        refreshMsIdle: (payload["refreshMsIdle"] as? NSNumber)?.doubleValue ?? 0,
        refreshMsMoving: (payload["refreshMsMoving"] as? NSNumber)?.doubleValue ?? 0,
        stickyLockStableMsMoving: stickyLockStableMsMoving,
        stickyLockStableMsIdle: stickyLockStableMsIdle,
        stickyUnlockMissingMsMoving: stickyUnlockMissingMsMoving,
        stickyUnlockMissingMsIdle: stickyUnlockMissingMsIdle,
        stickyUnlockMissingStreakMoving: stickyUnlockMissingStreakMoving,
        labelResetRequestKey: labelResetRequestKey
      )
      if observationEnabled {
        self.scheduleLabelObservationRefresh(instanceId: instanceId, delayMs: 0)
      }
      resolve(nil)
    }
  }

  @objc
  func queryRenderedPressTarget(
    _ payload: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self else {
        reject("search_map_render_controller_unavailable", "controller deallocated", nil)
        return
      }
      guard let instanceId = payload["instanceId"] as? String else {
        reject(
          "search_map_render_controller_query_rendered_press_target_invalid",
          "missing instanceId",
          nil
        )
        return
      }
      guard let state = self.instances[instanceId] else {
        reject(
          "search_map_render_controller_query_rendered_press_target_invalid",
          "unknown instance",
          nil
        )
        return
      }
      guard state.interactionMode == "enabled",
            state.visualSourceLifecycleState != .dismissing,
            state.visualSourceLifecycleState != .dismissed
      else {
        self.emitVisualDiag(
          instanceId: instanceId,
          message:
            "press_target_probe stage=query_blocked reason=interaction_or_lifecycle interactionMode=\(state.interactionMode) lifecycle=\(state.visualSourceLifecycleState)"
        )
        resolve(NSNull())
        return
      }
      guard let point = payload["point"] as? [String: Any],
            let x = (point["x"] as? NSNumber)?.doubleValue,
            let y = (point["y"] as? NSNumber)?.doubleValue
      else {
        reject(
          "search_map_render_controller_query_rendered_press_target_invalid",
          "missing point",
          nil
        )
        return
      }
      let pinLayerIds = (payload["pinLayerIds"] as? [String]) ??
        ((payload["pinLayerIds"] as? [Any])?.compactMap { $0 as? String } ?? [])
      let labelLayerIds = (payload["labelLayerIds"] as? [String]) ??
        ((payload["labelLayerIds"] as? [Any])?.compactMap { $0 as? String } ?? [])
      let labelQueryBoxValues = (payload["labelQueryBox"] as? [NSNumber]) ??
        ((payload["labelQueryBox"] as? [Any])?.compactMap { $0 as? NSNumber } ?? [])
      let labelTapHitbox = Self.parseLabelTapHitboxConfig(payload["labelTapHitbox"])
      let dotLayerIds = (payload["dotLayerIds"] as? [String]) ??
        ((payload["dotLayerIds"] as? [Any])?.compactMap { $0 as? String } ?? [])
      let dotQueryBoxValues = (payload["dotQueryBox"] as? [NSNumber]) ??
        ((payload["dotQueryBox"] as? [Any])?.compactMap { $0 as? NSNumber } ?? [])
      let tapCoordinatePayload = payload["tapCoordinate"] as? [String: Any]
      let tapCoordinate: (lng: Double, lat: Double)?
      if let lng = (tapCoordinatePayload?["lng"] as? NSNumber)?.doubleValue,
         let lat = (tapCoordinatePayload?["lat"] as? NSNumber)?.doubleValue {
        tapCoordinate = (lng: lng, lat: lat)
      } else {
        tapCoordinate = nil
      }
      do {
        try self.withResolvedMapHandleResult(for: state.mapTag) { handle in
          let queryRect = CGRect(x: x - 0.5, y: y - 0.5, width: 1, height: 1)
          let dotQueryRect: CGRect
          if dotQueryBoxValues.count == 4 {
            let x1 = CGFloat(truncating: dotQueryBoxValues[0])
            let y1 = CGFloat(truncating: dotQueryBoxValues[1])
            let x2 = CGFloat(truncating: dotQueryBoxValues[2])
            let y2 = CGFloat(truncating: dotQueryBoxValues[3])
            dotQueryRect = CGRect(
              x: min(x1, x2),
              y: min(y1, y2),
              width: abs(x2 - x1),
              height: abs(y2 - y1)
            )
          } else {
            dotQueryRect = queryRect
          }
          let labelQueryRect: CGRect
          if labelQueryBoxValues.count == 4 {
            let x1 = CGFloat(truncating: labelQueryBoxValues[0])
            let y1 = CGFloat(truncating: labelQueryBoxValues[1])
            let x2 = CGFloat(truncating: labelQueryBoxValues[2])
            let y2 = CGFloat(truncating: labelQueryBoxValues[3])
            labelQueryRect = CGRect(
              x: min(x1, x2),
              y: min(y1, y2),
              width: abs(x2 - x1),
              height: abs(y2 - y1)
            )
          } else {
            labelQueryRect = queryRect
          }
          let labelSourceIds = Set([state.labelInteractionSourceId])
          self.emitVisualDiag(
            instanceId: instanceId,
            message:
              "press_target_probe stage=query_start x=\(Self.round1(x)) y=\(Self.round1(y)) lifecycle=\(state.visualSourceLifecycleState) phase=\(state.lastPresentationBatchPhase) pinLayers=\(pinLayerIds.count) labelLayers=\(labelLayerIds.count) dotLayers=\(dotLayerIds.count) pinSource=\(Self.derivedFamilyState(sourceId: state.pinInteractionSourceId, state: state).collection.idsInOrder.count) labelSource=\(Self.derivedFamilyState(sourceId: state.labelInteractionSourceId, state: state).collection.idsInOrder.count) dotSource=\(Self.derivedFamilyState(sourceId: state.dotInteractionSourceId, state: state).collection.idsInOrder.count)"
          )
          let queryDotTarget = {
            guard !dotLayerIds.isEmpty, dotQueryRect.width > 0, dotQueryRect.height > 0 else {
              self.emitVisualDiag(
                instanceId: instanceId,
                message:
                  "press_target_probe stage=dot_skipped reason=missing_layers_or_box dotLayers=\(dotLayerIds.count) boxWidth=\(Self.round1(Double(dotQueryRect.width))) boxHeight=\(Self.round1(Double(dotQueryRect.height)))"
              )
              resolve(NSNull())
              return
            }
            handle.mapView.mapboxMap.queryRenderedFeatures(
              with: dotQueryRect,
              options: RenderedQueryOptions(layerIds: dotLayerIds, filter: nil)
            ) { dotResult in
              DispatchQueue.main.async {
                switch dotResult {
                case .failure(let error):
                  reject(
                    "search_map_render_controller_query_rendered_press_target_failed",
                    error.localizedDescription,
                    error
                  )
                case .success(let dotFeatures):
                  if let dotTarget = Self.buildRenderedDotPressTarget(
                    from: dotFeatures,
                    requiredSourceId: state.dotInteractionSourceId,
                    tapCoordinate: tapCoordinate
                  ) {
                    self.emitVisualDiag(
                      instanceId: instanceId,
                      message:
                        "press_target_probe stage=dot_result result=hit queried=\(dotFeatures.count) restaurantId=\((dotTarget["restaurantId"] as? String) ?? "nil")"
                    )
                    resolve(dotTarget)
                  } else {
                    self.emitVisualDiag(
                      instanceId: instanceId,
                      message:
                        "press_target_probe stage=dot_result result=miss queried=\(dotFeatures.count) requiredSource=\(state.dotInteractionSourceId)"
                    )
                    resolve(NSNull())
                  }
                }
              }
            }
          }
          let queryLabelTarget = {
            guard !labelLayerIds.isEmpty else {
              self.emitVisualDiag(
                instanceId: instanceId,
                message:
                  "press_target_probe stage=label_skipped reason=no_label_layers"
              )
              queryDotTarget()
              return
            }
            handle.mapView.mapboxMap.queryRenderedFeatures(
              with: labelQueryRect,
              options: RenderedQueryOptions(layerIds: labelLayerIds, filter: nil)
            ) { labelResult in
              DispatchQueue.main.async {
                switch labelResult {
                case .failure(let error):
                  reject(
                    "search_map_render_controller_query_rendered_press_target_failed",
                    error.localizedDescription,
                    error
                  )
                case .success(let labelFeatures):
                  if let labelTarget = Self.buildRenderedLabelPressTarget(
                    from: labelFeatures,
                    requiredSourceIds: labelSourceIds,
                    tapPoint: CGPoint(x: x, y: y),
                    mapboxMap: handle.mapView.mapboxMap,
                    hitbox: labelTapHitbox
                  ) {
                    self.emitVisualDiag(
                      instanceId: instanceId,
                      message:
                        "press_target_probe stage=label_result result=hit queried=\(labelFeatures.count) restaurantId=\((labelTarget["restaurantId"] as? String) ?? "nil")"
                    )
                    resolve(labelTarget)
                  } else {
                    self.emitVisualDiag(
                      instanceId: instanceId,
                      message:
                        "press_target_probe stage=label_result result=miss queried=\(labelFeatures.count) requiredSource=\(state.labelInteractionSourceId)"
                    )
                    queryDotTarget()
                  }
                }
              }
            }
          }
          guard !pinLayerIds.isEmpty || !labelLayerIds.isEmpty || !dotLayerIds.isEmpty else {
            resolve(NSNull())
            return
          }
          let queryLabelAfterPin = {
            queryLabelTarget()
          }
          if pinLayerIds.isEmpty {
            self.emitVisualDiag(
              instanceId: instanceId,
              message:
                "press_target_probe stage=pin_skipped reason=no_pin_layers"
            )
            queryLabelAfterPin()
            return
          }
          handle.mapView.mapboxMap.queryRenderedFeatures(
            with: queryRect,
            options: RenderedQueryOptions(layerIds: pinLayerIds, filter: nil)
          ) { pinResult in
            DispatchQueue.main.async {
              switch pinResult {
              case .failure(let error):
                reject(
                  "search_map_render_controller_query_rendered_press_target_failed",
                  error.localizedDescription,
                  error
                )
              case .success(let pinFeatures):
                if let pinTarget = Self.buildRenderedPinPressTarget(
                  from: pinFeatures,
                  requiredSourceId: state.pinInteractionSourceId
                ) {
                  self.emitVisualDiag(
                    instanceId: instanceId,
                    message:
                      "press_target_probe stage=pin_result result=hit queried=\(pinFeatures.count) restaurantId=\((pinTarget["restaurantId"] as? String) ?? "nil")"
                  )
                  resolve(pinTarget)
                } else {
                  self.emitVisualDiag(
                    instanceId: instanceId,
                    message:
                      "press_target_probe stage=pin_result result=miss queried=\(pinFeatures.count) requiredSource=\(state.pinInteractionSourceId)"
                  )
                  queryLabelAfterPin()
                }
              }
            }
          }
        }
      } catch {
        reject(
          "search_map_render_controller_query_rendered_press_target_failed",
          error.localizedDescription,
          error
        )
      }
    }
  }

  @objc
  func reset(
    _ instanceId: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async { [weak self] in
      guard let self else {
        reject("search_map_render_controller_unavailable", "controller deallocated", nil)
        return
      }
      guard var state = self.instances[instanceId] else {
        resolve(nil)
        return
      }
      state.lastPinCount = 0
      state.lastDotCount = 0
      state.lastLabelCount = 0
      state.lastPresentationBatchPhase = "idle"
      state.lastEnterRequestKey = nil
      state.enterLane = EnterLaneState()
      state.lastEnterStartToken = nil
      state.lastEnterStartedRequestKey = nil
      state.lastEnterSettledRequestKey = nil
      state.lastDismissRequestKey = nil
      state.currentPresentationRenderPhase = "idle"
      state.visualSourceLifecycleState = .dismissed
      state.labelCollisionObstacleLayersVisible = false
      state.labelPlacementLayersFadeOnly = false
      state.dotPlacementLayersFadeOnly = false
      state.lastPresentationStateJSON = nil
      state.activeFrameGenerationId = nil
      state.activeExecutionBatchId = nil
      state.sourceReadyFrameGenerationId = nil
      state.sourceReadyExecutionBatchId = nil
      state.highlightedMarkerKey = nil
      state.highlightedMarkerKeys = []
      state.highlightedRestaurantId = nil
      state.interactionMode = "enabled"
      state.currentPresentationOpacityTarget = 1
      state.currentPresentationOpacityValue = 1
      state.nextSourceCommitSequence = 0
      state.pendingPresentationSettleRequestKey = nil
      state.pendingPresentationSettleKind = nil
      state.blockedEnterStartRequestKey = nil
      state.blockedEnterStartCommitFenceStartedAtMs = nil
      state.blockedPresentationSettleRequestKey = nil
      state.blockedPresentationSettleKind = nil
      state.blockedPresentationCommitFenceStartedAtMs = nil
      state.blockedEnterStartCommitFenceBySourceId = [:]
      state.blockedPresentationCommitFenceBySourceId = [:]
      state.pendingSourceCommitDataIdsBySourceId = [:]
      state.derivedFamilyStates = Self.makeInitialDerivedFamilyStates(
        pinSourceId: state.pinSourceId,
        pinInteractionSourceId: state.pinInteractionSourceId,
        dotSourceId: state.dotSourceId,
        dotInteractionSourceId: state.dotInteractionSourceId,
        labelSourceId: state.labelSourceId,
        labelInteractionSourceId: state.labelInteractionSourceId,
        labelCollisionSourceId: state.labelCollisionSourceId
      )
      state.isAwaitingSourceRecovery = false
      state.isReplayingSourceRecovery = false
      state.sourceRecoveryPausedAtMs = nil
      self.cancelPresentationOpacityAnimation(instanceId: instanceId)
      self.cancelLivePinTransitionAnimation(instanceId: instanceId)
      self.sourceRecoveryWorkItems[instanceId]?.cancel()
      self.sourceRecoveryWorkItems[instanceId] = nil
      self.labelObservationRefreshWorkItems[instanceId]?.cancel()
      self.labelObservationRefreshWorkItems[instanceId] = nil
      self.dismissSettleWorkItems[instanceId]?.cancel()
      self.dismissSettleWorkItems[instanceId] = nil
      self.deferredDismissSourceCleanupWorkItems[instanceId]?.cancel()
      self.deferredDismissSourceCleanupWorkItems[instanceId] = nil
      self.enterSettleWorkItems[instanceId]?.cancel()
      self.enterSettleWorkItems[instanceId] = nil
      self.instances[instanceId] = state
      resolve(nil)
    }
  }

  private func applySnapshots(
    instanceId: String?,
    _ snapshots: [(sourceId: String, json: String)],
    allowDuringRecovery: Bool = false,
    state: inout InstanceState
  ) throws {
    if Self.isSourceRecoveryActive(state) && !allowDuringRecovery {
      if let instanceId {
        cancelLivePinTransitionAnimation(instanceId: instanceId)
      }
      return
    }
    let diagnosticInstanceId =
      instanceId ?? self.instances.first(where: { $0.value.mapTag == state.mapTag })?.key ?? "__native_diag__"
    guard let mapboxMap = try readyMapboxMap(
      for: state.mapTag,
      instanceId: instanceId,
      state: &state,
      sourceIds: snapshots.map(\.sourceId),
      reason: "apply_snapshots"
    ) else {
      return
    }
    var plans: [ParsedCollectionApplyPlan] = []
    for snapshot in snapshots {
      let next = try Self.parseFeatureCollectionJSON(snapshot.json, sourceId: snapshot.sourceId)
      let previousSourceState = Self.mountedSourceState(sourceId: snapshot.sourceId, state: state)
      plans.append(
        ParsedCollectionApplyPlan(
          sourceId: snapshot.sourceId,
          next: next,
          previousSourceState: previousSourceState,
          previousFeatureStateById: previousSourceState?.featureStateById ?? [:],
          previousFeatureStateRevision: previousSourceState?.featureStateRevision ?? ""
        )
      )
    }
    _ = try applyParsedCollectionBatch(
      instanceId: diagnosticInstanceId,
      plans: plans,
      state: &state,
      mapboxMap: mapboxMap
    )
  }

  private func prepareDerivedPinAndLabelOutput(
    desiredPinSnapshot: DesiredPinSnapshotState,
    dirtyState: DesiredPinSnapshotDirtyState,
    desiredPayloads: DesiredMarkerFamilyPayloads,
    nowMs: Double,
    state: inout InstanceState
  ) throws -> PreparedDerivedPinAndLabelOutput {
    var pinFamilyState = Self.derivedFamilyState(sourceId: state.pinSourceId, state: state)
    var pinInteractionFamilyState = Self.derivedFamilyState(
      sourceId: state.pinInteractionSourceId,
      state: state
    )
    var labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    var labelCollisionFamilyState = Self.derivedFamilyState(
      sourceId: state.labelCollisionSourceId,
      state: state
    )
    let shouldAttributeLabelPrep = nativeApplyAttributionEnabled
    let labelPrepPhase = state.lastPresentationBatchPhase
    let orderMarkersStartedAt = shouldAttributeLabelPrep ? CACurrentMediaTime() * 1000 : 0
    let orderedMarkerStates = Self.orderedMarkerRenderStates(pinFamilyState.markerRenderStateByMarkerKey)
    let orderedMarkerKeys = orderedMarkerStates.map(\.markerKey)
    if shouldAttributeLabelPrep {
      self.recordNativeApply(
        section: "label_prep.order_markers",
        phase: labelPrepPhase,
        durationMs: CACurrentMediaTime() * 1000 - orderMarkersStartedAt,
        operationCount: orderedMarkerStates.count
      )
    }
    let dirtySetsStartedAt = shouldAttributeLabelPrep ? CACurrentMediaTime() * 1000 : 0
    let dirtyPinMarkerKeys =
      dirtyState.pinMarkerKeys
      .union(pinFamilyState.livePinTransitionsByMarkerKey.keys)
      .union(pinFamilyState.collection.groupOrder)
      .union(orderedMarkerKeys)
    let previousPinInteractionMarkerKeys = Set(pinInteractionFamilyState.collection.groupOrder)
    let nextPinInteractionMarkerKeys = Set(orderedMarkerKeys)
    let hasPinInteractionMembershipChange =
      previousPinInteractionMarkerKeys != nextPinInteractionMarkerKeys
    let dirtyPinInteractionMarkerKeys =
      dirtyState.pinInteractionMarkerKeys
      .union(
        hasPinInteractionMembershipChange
          ? previousPinInteractionMarkerKeys.union(nextPinInteractionMarkerKeys)
          : Set<String>()
      )
    let dirtyLabelMarkerKeys =
      dirtyState.labelMarkerKeys
      .union(pinFamilyState.livePinTransitionsByMarkerKey.keys)
      .union(labelFamilyState.collection.groupOrder)
      .union(orderedMarkerKeys)
    let dirtyLabelCollisionMarkerKeys =
      dirtyState.labelCollisionMarkerKeys
      .union(pinFamilyState.livePinTransitionsByMarkerKey.keys)
      .union(labelCollisionFamilyState.collection.groupOrder)
      .union(orderedMarkerKeys)
    let reusePins = dirtyPinMarkerKeys.isEmpty
    let reusePinInteractions = dirtyPinInteractionMarkerKeys.isEmpty
    let reuseLabels = dirtyLabelMarkerKeys.isEmpty
    let reuseLabelCollisions = dirtyLabelCollisionMarkerKeys.isEmpty
    if shouldAttributeLabelPrep {
      self.recordNativeApply(
        section: "label_prep.dirty_sets",
        phase: labelPrepPhase,
        durationMs: CACurrentMediaTime() * 1000 - dirtySetsStartedAt,
        operationCount: dirtyPinMarkerKeys.count + dirtyPinInteractionMarkerKeys.count + dirtyLabelMarkerKeys.count + dirtyLabelCollisionMarkerKeys.count
      )
    }
    let makeReplaceAttributionRecorder: (String) -> ((_ section: String, _ durationMs: Double, _ operationCount: Int) -> Void)? = { source in
      guard shouldAttributeLabelPrep else {
        return nil
      }
      return { section, durationMs, operationCount in
        self.recordNativeApply(
          section: "label_prep.\(section)",
          phase: labelPrepPhase,
          source: source,
          durationMs: durationMs,
          operationCount: operationCount
        )
      }
    }
    var nextPinIdsInOrder: [String]? = reusePins ? nil : []
    var nextPinFeatureById: [String: Feature]? = reusePins ? nil : [:]
    var nextPinFeatureStateById: [String: [String: Any]]? = reusePins ? nil : [:]
    var nextPinMarkerKeyByFeatureId: [String: String]? = reusePins ? nil : [:]
    var nextPinInteractionIdsInOrder: [String]? = reusePinInteractions ? nil : []
    var nextPinInteractionFeatureById: [String: Feature]? = reusePinInteractions ? nil : [:]
    var nextPinInteractionMarkerKeyByFeatureId: [String: String]? =
      reusePinInteractions ? nil : [:]
    var nextLabelIdsInOrder: [String]? = reuseLabels ? nil : []
    var nextLabelFeatureById: [String: Feature]? = reuseLabels ? nil : [:]
    var nextLabelFeatureStateById: [String: [String: Any]]? = reuseLabels ? nil : [:]
    var nextLabelMarkerKeyByFeatureId: [String: String]? = reuseLabels ? nil : [:]
    var pinNumericRewriteDurationMs = 0.0
    var pinInteractionNumericRewriteDurationMs = 0.0
    var labelNumericRewriteDurationMs = 0.0
    var labelFeatureStateDurationMs = 0.0
    var pinRewriteCount = 0
    var pinInteractionRewriteCount = 0
    var labelRewriteCount = 0

    let markerTraversalStartedAt = shouldAttributeLabelPrep ? CACurrentMediaTime() * 1000 : 0
    for (markerKey, renderState) in orderedMarkerStates {
      let placementPrerollOpacity = Self.sourceFeatureOpacityForPlacementPreroll(
        renderState: renderState,
        state: state
      )
      if !reusePins {
        nextPinIdsInOrder!.append(markerKey)
        let rewriteStartedAt = shouldAttributeLabelPrep ? CACurrentMediaTime() * 1000 : 0
        let renderFeature = Self.featureBySettingNumericProperties(
          renderState.pinFeature,
          numericProperties: [
            "nativePresentationOpacity": state.currentPresentationOpacityValue,
            "nativeLodOpacity": placementPrerollOpacity,
            "nativeLodRankOpacity": placementPrerollOpacity,
            "nativeLodZ": Double(renderState.lodZ),
          ]
        )
        if shouldAttributeLabelPrep {
          pinNumericRewriteDurationMs += CACurrentMediaTime() * 1000 - rewriteStartedAt
          pinRewriteCount += 1
        }
        nextPinFeatureById![markerKey] = renderFeature
        nextPinMarkerKeyByFeatureId![markerKey] = markerKey
        if let featureState = pinFamilyState.transientFeatureStateById[markerKey] {
          nextPinFeatureStateById![markerKey] = featureState
        }
      }

      // Pin interaction geometry must be queryable as soon as the desired pin exists.
      // The reveal cover and interaction mode own tap availability; delaying this
      // source until visual opacity settles leaves visible pins without hit targets.
      let shouldRenderPinInteraction =
        state.visualSourceLifecycleState != .dismissing &&
        state.visualSourceLifecycleState != .dismissed &&
        (renderState.isDesiredPresent || renderState.currentOpacity > 0.001)
      if !reusePinInteractions, shouldRenderPinInteraction {
        let feature = renderState.pinInteractionFeature ?? renderState.pinFeature
        nextPinInteractionIdsInOrder!.append(markerKey)
        let rewriteStartedAt = shouldAttributeLabelPrep ? CACurrentMediaTime() * 1000 : 0
        nextPinInteractionFeatureById![markerKey] = Self.featureBySettingNumericProperties(
          feature,
          numericProperties: ["nativeLodZ": Double(renderState.lodZ)]
        )
        if shouldAttributeLabelPrep {
          pinInteractionNumericRewriteDurationMs += CACurrentMediaTime() * 1000 - rewriteStartedAt
          pinInteractionRewriteCount += 1
        }
        nextPinInteractionMarkerKeyByFeatureId![markerKey] = markerKey
      }

      if !reuseLabels {
        for labelFeature in renderState.labelFeatures {
          nextLabelIdsInOrder!.append(labelFeature.id)
          let rewriteStartedAt = shouldAttributeLabelPrep ? CACurrentMediaTime() * 1000 : 0
          let nextLabelFeature = Self.featureBySettingNumericProperties(
              labelFeature.feature,
              numericProperties: [
                "nativePresentationOpacity": state.currentPresentationOpacityValue,
                "nativeLabelOpacity": placementPrerollOpacity,
              ],
            stringProperties: [
              "labelPreference": Self.effectiveLabelPreference(
                for: labelFeature.feature,
                markerKey: markerKey,
                stickyCandidateByIdentity: labelFamilyState.labelObservation.stickyCandidateByIdentity
              ),
            ]
          )
          nextLabelFeatureById![labelFeature.id] = nextLabelFeature
          if shouldAttributeLabelPrep {
            labelNumericRewriteDurationMs += CACurrentMediaTime() * 1000 - rewriteStartedAt
            labelRewriteCount += 1
          }
          nextLabelMarkerKeyByFeatureId![labelFeature.id] = markerKey
          let featureStateStartedAt = shouldAttributeLabelPrep ? CACurrentMediaTime() * 1000 : 0
          var featureState = Self.retainedLabelFeatureState(
            for: labelFeature.feature,
            markerKey: markerKey,
            stickyCandidateByIdentity: labelFamilyState.labelObservation.stickyCandidateByIdentity
          )
          if let transientFeatureState = labelFamilyState.transientFeatureStateById[labelFeature.id] {
            featureState = Self.mergedFeatureState(featureState, with: transientFeatureState)
          }
          nextLabelFeatureStateById![labelFeature.id] = featureState
          if shouldAttributeLabelPrep {
            labelFeatureStateDurationMs += CACurrentMediaTime() * 1000 - featureStateStartedAt
          }
        }
      }
    }
    if shouldAttributeLabelPrep {
      self.recordNativeApply(
        section: "label_prep.marker_traversal",
        phase: labelPrepPhase,
        durationMs: CACurrentMediaTime() * 1000 - markerTraversalStartedAt,
        operationCount: orderedMarkerStates.count
      )
      self.recordNativeApply(
        section: "label_prep.pin_numeric_rewrite",
        phase: labelPrepPhase,
        durationMs: pinNumericRewriteDurationMs,
        operationCount: pinRewriteCount
      )
      self.recordNativeApply(
        section: "label_prep.pin_interaction_numeric_rewrite",
        phase: labelPrepPhase,
        durationMs: pinInteractionNumericRewriteDurationMs,
        operationCount: pinInteractionRewriteCount
      )
      self.recordNativeApply(
        section: "label_prep.label_numeric_rewrite",
        phase: labelPrepPhase,
        durationMs: labelNumericRewriteDurationMs,
        operationCount: labelRewriteCount
      )
      self.recordNativeApply(
        section: "label_prep.label_feature_state",
        phase: labelPrepPhase,
        durationMs: labelFeatureStateDurationMs,
        operationCount: labelRewriteCount
      )
    }
    let previousPinsSourceState = pinFamilyState.sourceState
    let nextPins: ParsedFeatureCollection
    if reusePins {
      nextPins = pinFamilyState.collection
    } else {
      let nextPinGroupIds = nextPinIdsInOrder!
      let replaceStartedAt = shouldAttributeLabelPrep ? CACurrentMediaTime() * 1000 : 0
      try Self.replaceParsedFeatureCollection(
        &pinFamilyState.collection,
        baseSourceState: previousPinsSourceState,
        idsInOrder: nextPinIdsInOrder!,
        featureById: nextPinFeatureById!,
        featureStateById: nextPinFeatureStateById!,
        markerKeyByFeatureId: nextPinMarkerKeyByFeatureId!,
        dirtyGroupIds: Set(pinFamilyState.collection.groupOrder).union(nextPinGroupIds),
        orderChangedGroupIds:
          pinFamilyState.collection.groupOrder == nextPinGroupIds
            ? dirtyPinMarkerKeys
            : Set(pinFamilyState.collection.groupOrder).union(nextPinGroupIds),
        removedGroupIds: Set(pinFamilyState.collection.groupOrder).subtracting(nextPinGroupIds),
        recordAttribution: makeReplaceAttributionRecorder("pins")
      )
      if shouldAttributeLabelPrep {
        self.recordNativeApply(
          section: "label_prep.replace_collection",
          phase: labelPrepPhase,
          source: "pins",
          durationMs: CACurrentMediaTime() * 1000 - replaceStartedAt,
          operationCount: nextPinIdsInOrder!.count
        )
      }
      Self.setDerivedFamilyState(pinFamilyState, sourceId: state.pinSourceId, state: &state)
      nextPins = pinFamilyState.collection
    }
    let pinStartedAt = CACurrentMediaTime() * 1000

    let previousPinInteractionsSourceState = pinInteractionFamilyState.sourceState
    let nextPinInteractions: ParsedFeatureCollection
    if reusePinInteractions {
      nextPinInteractions = pinInteractionFamilyState.collection
    } else {
      let nextPinInteractionGroupIds = nextPinInteractionIdsInOrder!
      let replaceStartedAt = shouldAttributeLabelPrep ? CACurrentMediaTime() * 1000 : 0
      try Self.replaceParsedFeatureCollection(
        &pinInteractionFamilyState.collection,
        baseSourceState: previousPinInteractionsSourceState,
        idsInOrder: nextPinInteractionIdsInOrder!,
        featureById: nextPinInteractionFeatureById!,
        markerKeyByFeatureId: nextPinInteractionMarkerKeyByFeatureId!,
        dirtyGroupIds: dirtyPinInteractionMarkerKeys,
        orderChangedGroupIds: dirtyPinInteractionMarkerKeys,
        removedGroupIds: Set(pinInteractionFamilyState.collection.groupOrder).subtracting(nextPinInteractionGroupIds),
        recordAttribution: makeReplaceAttributionRecorder("pinInteractions")
      )
      if shouldAttributeLabelPrep {
        self.recordNativeApply(
          section: "label_prep.replace_collection",
          phase: labelPrepPhase,
          source: "pinInteractions",
          durationMs: CACurrentMediaTime() * 1000 - replaceStartedAt,
          operationCount: nextPinInteractionIdsInOrder!.count
        )
      }
      Self.setDerivedFamilyState(
        pinInteractionFamilyState,
        sourceId: state.pinInteractionSourceId,
        state: &state
      )
      nextPinInteractions = pinInteractionFamilyState.collection
    }
    let previousLabelsSourceState = labelFamilyState.sourceState
    let nextLabels: ParsedFeatureCollection
    if reuseLabels {
      nextLabels = labelFamilyState.collection
    } else {
      let nextLabelGroupIds = nextLabelIdsInOrder!
      let replaceStartedAt = shouldAttributeLabelPrep ? CACurrentMediaTime() * 1000 : 0
      try Self.replaceParsedFeatureCollection(
        &labelFamilyState.collection,
        baseSourceState: previousLabelsSourceState,
        idsInOrder: nextLabelIdsInOrder!,
        featureById: nextLabelFeatureById!,
        featureStateById: nextLabelFeatureStateById!,
        markerKeyByFeatureId: nextLabelMarkerKeyByFeatureId!,
        dirtyGroupIds: Set(labelFamilyState.collection.groupOrder).union(nextLabelGroupIds),
        orderChangedGroupIds:
          labelFamilyState.collection.groupOrder == nextLabelGroupIds
            ? dirtyLabelMarkerKeys
            : Set(labelFamilyState.collection.groupOrder).union(nextLabelGroupIds),
        removedGroupIds: Set(labelFamilyState.collection.groupOrder).subtracting(nextLabelGroupIds),
        recordAttribution: makeReplaceAttributionRecorder("labels")
      )
      if shouldAttributeLabelPrep {
        self.recordNativeApply(
          section: "label_prep.replace_collection",
          phase: labelPrepPhase,
          source: "labels",
          durationMs: CACurrentMediaTime() * 1000 - replaceStartedAt,
          operationCount: nextLabelIdsInOrder!.count
        )
      }
      Self.setDerivedFamilyState(labelFamilyState, sourceId: state.labelSourceId, state: &state)
      nextLabels = labelFamilyState.collection
    }
    let previousLabelCollisionSourceState = labelCollisionFamilyState.sourceState
    let nextLabelCollisions: ParsedFeatureCollection
    if reuseLabelCollisions {
      nextLabelCollisions = labelCollisionFamilyState.collection
    } else {
      var nextLabelCollisionIdsInOrder: [String] = []
      var nextLabelCollisionFeatureById: [String: Feature] = [:]
      var nextLabelCollisionMarkerKeyByFeatureId: [String: String] = [:]
      let collisionBuildStartedAt = shouldAttributeLabelPrep ? CACurrentMediaTime() * 1000 : 0
      for (markerKey, renderState) in orderedMarkerStates {
        guard let feature = renderState.labelCollisionFeature else {
          continue
        }
        nextLabelCollisionIdsInOrder.append(markerKey)
        nextLabelCollisionFeatureById[markerKey] = feature
        nextLabelCollisionMarkerKeyByFeatureId[markerKey] = markerKey
      }
      if shouldAttributeLabelPrep {
        self.recordNativeApply(
          section: "label_prep.collision_build",
          phase: labelPrepPhase,
          durationMs: CACurrentMediaTime() * 1000 - collisionBuildStartedAt,
          operationCount: nextLabelCollisionIdsInOrder.count
        )
      }
      let replaceStartedAt = shouldAttributeLabelPrep ? CACurrentMediaTime() * 1000 : 0
      try Self.replaceParsedFeatureCollection(
        &labelCollisionFamilyState.collection,
        baseSourceState: previousLabelCollisionSourceState,
        idsInOrder: nextLabelCollisionIdsInOrder,
        featureById: nextLabelCollisionFeatureById,
        markerKeyByFeatureId: nextLabelCollisionMarkerKeyByFeatureId,
        dirtyGroupIds: Set(labelCollisionFamilyState.collection.groupOrder).union(nextLabelCollisionIdsInOrder),
        orderChangedGroupIds:
          labelCollisionFamilyState.collection.groupOrder == nextLabelCollisionIdsInOrder
            ? dirtyLabelCollisionMarkerKeys
            : Set(labelCollisionFamilyState.collection.groupOrder).union(nextLabelCollisionIdsInOrder),
        removedGroupIds: Set(labelCollisionFamilyState.collection.groupOrder).subtracting(nextLabelCollisionIdsInOrder),
        recordAttribution: makeReplaceAttributionRecorder("labelCollisions")
      )
      if shouldAttributeLabelPrep {
        self.recordNativeApply(
          section: "label_prep.replace_collection",
          phase: labelPrepPhase,
          source: "labelCollisions",
          durationMs: CACurrentMediaTime() * 1000 - replaceStartedAt,
          operationCount: nextLabelCollisionIdsInOrder.count
        )
      }
      Self.setDerivedFamilyState(
        labelCollisionFamilyState,
        sourceId: state.labelCollisionSourceId,
        state: &state
      )
      nextLabelCollisions = labelCollisionFamilyState.collection
    }
    return PreparedDerivedPinAndLabelOutput(
      plans: [
        ParsedCollectionApplyPlan(
          sourceId: state.pinSourceId,
          next: nextPins,
          previousSourceState: previousPinsSourceState,
          previousFeatureStateById: previousPinsSourceState.featureStateById,
          previousFeatureStateRevision: previousPinsSourceState.featureStateRevision
        ),
        ParsedCollectionApplyPlan(
          sourceId: state.pinInteractionSourceId,
          next: nextPinInteractions,
          previousSourceState: previousPinInteractionsSourceState,
          previousFeatureStateById: previousPinInteractionsSourceState.featureStateById,
          previousFeatureStateRevision: previousPinInteractionsSourceState.featureStateRevision
        ),
        ParsedCollectionApplyPlan(
          sourceId: state.labelSourceId,
          next: nextLabels,
          previousSourceState: previousLabelsSourceState,
          previousFeatureStateById: previousLabelsSourceState.featureStateById,
          previousFeatureStateRevision: previousLabelsSourceState.featureStateRevision
        ),
        ParsedCollectionApplyPlan(
          sourceId: state.labelCollisionSourceId,
          next: nextLabelCollisions,
          previousSourceState: previousLabelCollisionSourceState,
          previousFeatureStateById: previousLabelCollisionSourceState.featureStateById,
          previousFeatureStateRevision: previousLabelCollisionSourceState.featureStateRevision
        ),
      ],
      pinSourceId: state.pinSourceId,
      pinStartedAtMs: pinStartedAt
    )
  }

  private static func orderedMarkerRenderStates(
    _ markerRenderStateByMarkerKey: [String: MarkerFamilyRenderState]
  ) -> [(markerKey: String, renderState: MarkerFamilyRenderState)] {
    markerRenderStateByMarkerKey.sorted { lhs, rhs in
      if lhs.value.orderHint != rhs.value.orderHint {
        return lhs.value.orderHint < rhs.value.orderHint
      }
      return lhs.key < rhs.key
    }.map { (markerKey: $0.key, renderState: $0.value) }
  }

  private func finalizePreparedPinAndLabelOutput(
    instanceId: String,
    prepared: PreparedDerivedPinAndLabelOutput,
    mutationSummaryBySourceId: [String: MutationSummary],
    state: inout InstanceState
  ) {
    let pinMutationSummary = mutationSummaryBySourceId[prepared.pinSourceId] ?? MutationSummary(
      addCount: 0,
      updateCount: 0,
      removeCount: 0,
      dataId: nil,
      addedFeatureIds: []
    )
    if let dataId = pinMutationSummary.dataId, !pinMutationSummary.addedFeatureIds.isEmpty {
      var pinFamilyState = Self.derivedFamilyState(sourceId: state.pinSourceId, state: state)
      for featureId in pinMutationSummary.addedFeatureIds {
        guard var transition = pinFamilyState.livePinTransitionsByMarkerKey[featureId],
              transition.isAwaitingSourceCommit
        else {
          continue
        }
        transition.awaitingSourceDataId = dataId
        pinFamilyState.livePinTransitionsByMarkerKey[featureId] = transition
      }
      Self.setDerivedFamilyState(pinFamilyState, sourceId: state.pinSourceId, state: &state)
    }
  }

  private static func sourceFeatureOpacityForPlacementPreroll(
    renderState: MarkerFamilyRenderState,
    state: InstanceState
  ) -> Double {
    if state.visualSourceLifecycleState == .preparingReveal &&
      renderState.isDesiredPresent &&
      renderState.targetOpacity >= 0.999 &&
      renderState.currentOpacity <= 0.001 {
      return 1
    }
    return renderState.currentOpacity
  }

  private static func sourceFeatureOpacityForPlacementPreroll(
    desiredFeatureIsPresent: Bool,
    transition: LiveDotTransition?,
    currentOpacity: Double,
    state: InstanceState
  ) -> Double {
    if state.visualSourceLifecycleState == .preparingReveal &&
      desiredFeatureIsPresent &&
      transition?.targetOpacity == 1 &&
      currentOpacity <= 0.001 {
      return 1
    }
    return currentOpacity
  }

  private func prepareDerivedLabelInteractionOutputPlans(
    state: inout InstanceState
  ) throws -> [ParsedCollectionApplyPlan] {
    let pinFamilyState = Self.derivedFamilyState(sourceId: state.pinSourceId, state: state)
    let orderedMarkerStates = Self.orderedMarkerRenderStates(pinFamilyState.markerRenderStateByMarkerKey)
    let settledVisibleLabelFeatureIds =
      Self.derivedFamilyState(sourceId: state.labelSourceId, state: state).settledVisibleFeatureIds
    var labelInteractionFamilyState = Self.derivedFamilyState(
      sourceId: state.labelInteractionSourceId,
      state: state
    )
    let previousLabelInteractionSourceState = labelInteractionFamilyState.sourceState
    let nextLabelInteractionGroupIds = orderedMarkerStates.compactMap { markerKey, renderState in
      renderState.labelFeatures.contains(where: { settledVisibleLabelFeatureIds.contains($0.id) })
        ? markerKey
        : nil
    }
    let nextLabelInteractionIdsInOrder = orderedMarkerStates.flatMap { _, renderState in
      renderState.labelFeatures.compactMap { labelFeature in
        settledVisibleLabelFeatureIds.contains(labelFeature.id) ? labelFeature.id : nil
      }
    }
    let previousGroupIds = Set(labelInteractionFamilyState.collection.groupOrder)
    let nextGroupIds = Set(nextLabelInteractionGroupIds)
    let dirtyLabelInteractionGroupIds = previousGroupIds.union(nextGroupIds)
    let orderChangedGroupIds =
      labelInteractionFamilyState.collection.groupOrder == nextLabelInteractionGroupIds
        ? dirtyLabelInteractionGroupIds
        : previousGroupIds.union(nextGroupIds)
    let next: ParsedFeatureCollection
    if dirtyLabelInteractionGroupIds.isEmpty {
      next = labelInteractionFamilyState.collection
    } else {
      var nextLabelInteractionFeatureById: [String: Feature] = [:]
      var nextLabelInteractionFeatureStateById: [String: [String: Any]] = [:]
      var nextLabelInteractionMarkerKeyByFeatureId: [String: String] = [:]
      for (markerKey, renderState) in orderedMarkerStates {
        for labelFeature in renderState.labelFeatures where settledVisibleLabelFeatureIds.contains(labelFeature.id) {
          nextLabelInteractionFeatureById[labelFeature.id] = labelFeature.feature
          nextLabelInteractionFeatureStateById[labelFeature.id] = [:]
          nextLabelInteractionMarkerKeyByFeatureId[labelFeature.id] = markerKey
        }
      }
      try Self.replaceParsedFeatureCollection(
        &labelInteractionFamilyState.collection,
        baseSourceState: previousLabelInteractionSourceState,
        idsInOrder: nextLabelInteractionIdsInOrder,
        featureById: nextLabelInteractionFeatureById,
        featureStateById: nextLabelInteractionFeatureStateById,
        markerKeyByFeatureId: nextLabelInteractionMarkerKeyByFeatureId,
        dirtyGroupIds: dirtyLabelInteractionGroupIds,
        orderChangedGroupIds: orderChangedGroupIds,
        removedGroupIds: previousGroupIds.subtracting(nextGroupIds)
      )
      Self.setDerivedFamilyState(
        labelInteractionFamilyState,
        sourceId: state.labelInteractionSourceId,
        state: &state
      )
      next = labelInteractionFamilyState.collection
    }
    return [
      ParsedCollectionApplyPlan(
        sourceId: state.labelInteractionSourceId,
        next: next,
        previousSourceState: previousLabelInteractionSourceState,
        previousFeatureStateById: previousLabelInteractionSourceState.featureStateById,
        previousFeatureStateRevision: previousLabelInteractionSourceState.featureStateRevision
      ),
    ]
  }

  private static func usesFrozenPresentationSnapshot(_ state: InstanceState) -> Bool {
    false
  }

  private static func isSourceRecoveryActive(_ state: InstanceState) -> Bool {
    state.isAwaitingSourceRecovery || state.isReplayingSourceRecovery
  }

  private static func allowsIncrementalMarkerTransitions(
    _ state: InstanceState,
    allowNewTransitions: Bool
  ) -> Bool {
    allowNewTransitions &&
      (state.visualSourceLifecycleState == .visible ||
        state.visualSourceLifecycleState == .preparingReveal ||
        state.visualSourceLifecycleState == .revealing) &&
      state.lastDismissRequestKey == nil
  }

  private static func shouldAllowObservationDrivenMarkerTransitions(
    _ state: InstanceState
  ) -> Bool {
    (state.visualSourceLifecycleState == .visible ||
      state.visualSourceLifecycleState == .preparingReveal ||
      state.visualSourceLifecycleState == .revealing) &&
      state.lastDismissRequestKey == nil
  }

  private func reconcileAndApplyCurrentFrameSnapshots(
    for instanceId: String,
    allowNewTransitions: Bool = true,
    allowDuringRecovery: Bool = false
  ) throws {
    let attributionStartedAt = CACurrentMediaTime() * 1000
    guard var state = instances[instanceId] else {
      return
    }
    if Self.isSourceRecoveryActive(state) && !allowDuringRecovery {
      cancelLivePinTransitionAnimation(instanceId: instanceId)
      instances[instanceId] = state
      return
    }
    let desiredPins = Self.derivedFamilyState(sourceId: state.pinSourceId, state: state).desiredCollection
    let desiredPinInteractions =
      Self.derivedFamilyState(sourceId: state.pinInteractionSourceId, state: state).desiredCollection
    let desiredDots = Self.derivedFamilyState(sourceId: state.dotSourceId, state: state).desiredCollection
    let desiredDotInteractions =
      Self.derivedFamilyState(sourceId: state.dotInteractionSourceId, state: state).desiredCollection
    let desiredLabels =
      Self.derivedFamilyState(sourceId: state.labelSourceId, state: state).desiredCollection
    let desiredLabelCollisions =
      Self.derivedFamilyState(sourceId: state.labelCollisionSourceId, state: state).desiredCollection
    let labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    let stickyCandidateByIdentity = labelFamilyState.labelObservation.stickyCandidateByIdentity
    let desiredPinSnapshotInputRevision = Self.desiredPinSnapshotInputRevision(
      desiredPins: desiredPins,
      desiredPinInteractions: desiredPinInteractions,
      desiredLabels: desiredLabels,
      desiredLabelCollisions: desiredLabelCollisions,
      stickyRevision: labelFamilyState.labelObservation.stickyRevision
    )
    let pinFamilyState = Self.derivedFamilyState(sourceId: state.pinSourceId, state: state)
    let previousDesiredPinSnapshot = pinFamilyState.lastDesiredPinSnapshot
    let desiredPinSnapshot: DesiredPinSnapshotState
    if previousDesiredPinSnapshot.inputRevision == desiredPinSnapshotInputRevision {
      desiredPinSnapshot = previousDesiredPinSnapshot
    } else {
      let snapshotStartedAt = CACurrentMediaTime() * 1000
      let nextDesiredPinSnapshot = Self.makeDesiredPinSnapshotState(
        desiredPins: desiredPins,
        desiredPinInteractions: desiredPinInteractions,
        desiredLabels: desiredLabels,
        desiredLabelCollisions: desiredLabelCollisions,
        stickyCandidateByIdentity: stickyCandidateByIdentity,
        stickyRevision: labelFamilyState.labelObservation.stickyRevision,
        previousSnapshot: previousDesiredPinSnapshot
      )
      desiredPinSnapshot = nextDesiredPinSnapshot
      self.recordNativeApply(
        section: "reconcile.make_desired_pin_snapshot",
        phase: state.lastPresentationBatchPhase,
        durationMs: CACurrentMediaTime() * 1000 - snapshotStartedAt,
        operationCount: desiredPins.idsInOrder.count
      )
    }
    let markerPayloadStartedAt = CACurrentMediaTime() * 1000
    let desiredMarkerFamilyPayloads = Self.makeDesiredMarkerFamilyPayloads(
      desiredPins: desiredPins,
      desiredPinInteractions: desiredPinInteractions,
      desiredLabels: desiredLabels,
      desiredLabelCollisions: desiredLabelCollisions
    )
    self.recordNativeApply(
      section: "reconcile.make_marker_family_payloads",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - markerPayloadStartedAt,
      operationCount: 4
    )
    let dirtyStartedAt = CACurrentMediaTime() * 1000
    let desiredPinDirtyState = Self.makeDesiredPinSnapshotDirtyState(
      previousSnapshot: previousDesiredPinSnapshot,
      nextSnapshot: desiredPinSnapshot
    )
    self.recordNativeApply(
      section: "reconcile.make_pin_dirty_state",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - dirtyStartedAt
    )
    let nowMs = Self.nowMs()
    let shouldAnimateIncrementalTransitions = Self.allowsIncrementalMarkerTransitions(
      state,
      allowNewTransitions: allowNewTransitions
    )
    if !shouldAnimateIncrementalTransitions &&
      previousDesiredPinSnapshot.inputRevision != desiredPinSnapshot.inputRevision
    {
      let previousPinIds = Set(previousDesiredPinSnapshot.pinIdsInOrder)
      let nextPinIds = Set(desiredPinSnapshot.pinIdsInOrder)
      let enteringPins = nextPinIds.subtracting(previousPinIds).count
      let exitingPins = previousPinIds.subtracting(nextPinIds).count
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "lod_transition_admission_probe admitted=false phase=\(state.lastPresentationBatchPhase) dismissRequest=\(state.lastDismissRequestKey ?? "nil") allowNewTransitions=\(allowNewTransitions) previousPins=\(previousDesiredPinSnapshot.pinIdsInOrder.count) nextPins=\(desiredPinSnapshot.pinIdsInOrder.count) enteringPins=\(enteringPins) exitingPins=\(exitingPins) livePinTransitions=\(Self.derivedFamilyState(sourceId: state.pinSourceId, state: state).livePinTransitionsByMarkerKey.count)"
      )
    }
    let pinTransitionsStartedAt = CACurrentMediaTime() * 1000
    updateLivePinTransitions(
      state: &state,
      previousPinSnapshot: previousDesiredPinSnapshot,
      desiredPinSnapshot: desiredPinSnapshot,
      desiredPayloads: desiredMarkerFamilyPayloads,
      nowMs: nowMs,
      allowNewTransitions: shouldAnimateIncrementalTransitions
    )
    self.recordNativeApply(
      section: "reconcile.update_live_pin_transitions",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - pinTransitionsStartedAt
    )
    let dotTransitionsStartedAt = CACurrentMediaTime() * 1000
    updateLiveDotTransitions(
      state: &state,
      desiredDots: desiredDots,
      nowMs: nowMs,
      allowNewTransitions: shouldAnimateIncrementalTransitions
    )
    self.recordNativeApply(
      section: "reconcile.update_live_dot_transitions",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - dotTransitionsStartedAt
    )
    guard let mapboxMap = try readyMapboxMap(
      for: state.mapTag,
      instanceId: instanceId,
      state: &state,
      sourceIds: [
        state.pinSourceId,
        state.pinInteractionSourceId,
        state.dotSourceId,
        state.dotInteractionSourceId,
        state.labelSourceId,
        state.labelInteractionSourceId,
        state.labelCollisionSourceId,
      ],
      reason: "reconcile_outputs"
    ) else {
      instances[instanceId] = state
      return
    }
    let pinLabelStartedAt = CACurrentMediaTime() * 1000
    let preparedPinAndLabelOutput = try prepareDerivedPinAndLabelOutput(
      desiredPinSnapshot: desiredPinSnapshot,
      dirtyState: desiredPinDirtyState,
      desiredPayloads: desiredMarkerFamilyPayloads,
      nowMs: nowMs,
      state: &state
    )
    self.recordNativeApply(
      section: "reconcile.prepare_pin_label_output",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - pinLabelStartedAt
    )
    let dotOutputStartedAt = CACurrentMediaTime() * 1000
    let preparedDotOutput = try prepareDerivedDotOutput(
      desiredDots: desiredDots,
      desiredDotInteractions: desiredDotInteractions,
      nowMs: nowMs,
      state: &state
    )
    self.recordNativeApply(
      section: "reconcile.prepare_dot_output",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - dotOutputStartedAt
    )
    let labelInteractionStartedAt = CACurrentMediaTime() * 1000
    let labelInteractionPlans = try prepareDerivedLabelInteractionOutputPlans(state: &state)
    self.recordNativeApply(
      section: "reconcile.prepare_label_interactions",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - labelInteractionStartedAt,
      operationCount: labelInteractionPlans.count
    )
    let batchStartedAt = CACurrentMediaTime() * 1000
    let mutationSummaryBySourceId = try applyParsedCollectionBatch(
      instanceId: instanceId,
      plans: preparedPinAndLabelOutput.plans + preparedDotOutput.plans + labelInteractionPlans,
      state: &state,
      mapboxMap: mapboxMap
    )
    self.recordNativeApply(
      section: "reconcile.apply_parsed_batch",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - batchStartedAt,
      operationCount: preparedPinAndLabelOutput.plans.count + preparedDotOutput.plans.count + labelInteractionPlans.count
    )
    if state.lastEnterRequestKey != nil && state.lastPresentationBatchPhase != "live" {
      let pinMutationSummary = mutationSummaryBySourceId[state.pinSourceId] ?? MutationSummary(
        addCount: 0,
        updateCount: 0,
        removeCount: 0,
        dataId: nil,
        addedFeatureIds: []
      )
      let dotMutationSummary = mutationSummaryBySourceId[state.dotSourceId] ?? MutationSummary(
        addCount: 0,
        updateCount: 0,
        removeCount: 0,
        dataId: nil,
        addedFeatureIds: []
      )
      let labelMutationSummary = mutationSummaryBySourceId[state.labelSourceId] ?? MutationSummary(
        addCount: 0,
        updateCount: 0,
        removeCount: 0,
        dataId: nil,
        addedFeatureIds: []
      )
      self.emitVisualDiag(
        instanceId: instanceId,
        message:
          "reveal_apply_result frame=\(state.activeFrameGenerationId ?? "nil") phase=\(state.lastPresentationBatchPhase) renderPhase=\(state.currentPresentationRenderPhase) pinAdd=\(pinMutationSummary.addCount) pinUpdate=\(pinMutationSummary.updateCount) pinRemove=\(pinMutationSummary.removeCount) dotAdd=\(dotMutationSummary.addCount) dotUpdate=\(dotMutationSummary.updateCount) dotRemove=\(dotMutationSummary.removeCount) labelAdd=\(labelMutationSummary.addCount) labelUpdate=\(labelMutationSummary.updateCount) labelRemove=\(labelMutationSummary.removeCount) \(Self.phaseSummary(for: state))"
      )
    }
    let finalizePinLabelStartedAt = CACurrentMediaTime() * 1000
    finalizePreparedPinAndLabelOutput(
      instanceId: instanceId,
      prepared: preparedPinAndLabelOutput,
      mutationSummaryBySourceId: mutationSummaryBySourceId,
      state: &state
    )
    self.recordNativeApply(
      section: "reconcile.finalize_pin_label_output",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - finalizePinLabelStartedAt
    )
    let finalizeDotStartedAt = CACurrentMediaTime() * 1000
    finalizePreparedDotOutput(
      prepared: preparedDotOutput,
      mutationSummaryBySourceId: mutationSummaryBySourceId,
      state: &state
    )
    self.recordNativeApply(
      section: "reconcile.finalize_dot_output",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - finalizeDotStartedAt
    )
    guard !Self.isSourceRecoveryActive(state) else {
      cancelLivePinTransitionAnimation(instanceId: instanceId)
      instances[instanceId] = state
      return
    }
    var latestPinFamilyState = Self.derivedFamilyState(sourceId: state.pinSourceId, state: state)
    var latestDotFamilyState = Self.derivedFamilyState(sourceId: state.dotSourceId, state: state)
    latestPinFamilyState.lastDesiredPinSnapshot = desiredPinSnapshot
    latestDotFamilyState.lastDesiredCollection = desiredDots
    Self.setDerivedFamilyState(latestPinFamilyState, sourceId: state.pinSourceId, state: &state)
    Self.setDerivedFamilyState(latestDotFamilyState, sourceId: state.dotSourceId, state: &state)
    maybeElectMountedHiddenExecutionBatch(instanceId: instanceId, state: &state)
    instances[instanceId] = state
    let animationStartedAt = CACurrentMediaTime() * 1000
    updateLivePinTransitionAnimation(instanceId: instanceId, state: state)
    self.recordNativeApply(
      section: "reconcile.update_live_pin_animation",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - animationStartedAt
    )
    self.recordNativeApply(
      section: "reconcile.total",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - attributionStartedAt
    )
  }

  private func prepareDerivedDotOutput(
    desiredDots: ParsedFeatureCollection,
    desiredDotInteractions: ParsedFeatureCollection,
    nowMs: Double,
    state: inout InstanceState
  ) throws -> PreparedDerivedDotOutput {
    var dotFamilyState = Self.derivedFamilyState(sourceId: state.dotSourceId, state: state)
    var dotInteractionFamilyState = Self.derivedFamilyState(
      sourceId: state.dotInteractionSourceId,
      state: state
    )
    let desiredDotFeatureByMarkerKey = desiredDots.featureById
    let dotMarkerKeys = Set(desiredDotFeatureByMarkerKey.keys).union(
      dotFamilyState.liveDotTransitionsByMarkerKey.keys
    )
    let orderedDotMarkerKeys = dotMarkerKeys.sorted()
    let dirtyDotMarkerKeys = Set(desiredDots.dirtyGroupIds)
      .union(desiredDots.orderChangedGroupIds)
      .union(desiredDots.removedGroupIds)
      .union(dotFamilyState.liveDotTransitionsByMarkerKey.keys)
    let reuseDots = dirtyDotMarkerKeys.isEmpty
    let previousDotSourceState = dotFamilyState.sourceState
    let nextDots: ParsedFeatureCollection
    if reuseDots {
      nextDots = dotFamilyState.collection
    } else {
      var nextDotIdsInOrder: [String] = []
      var nextDotFeatureById = dotFamilyState.collection.featureById
      var nextDotFeatureStateById = dotFamilyState.collection.featureStateById
      var nextDotMarkerKeyByFeatureId = dotFamilyState.collection.markerKeyByFeatureId
      var nextDotIdSet = Set<String>()
      for markerKey in orderedDotMarkerKeys {
        let transition = dotFamilyState.liveDotTransitionsByMarkerKey[markerKey]
        let desiredDotFeature = desiredDotFeatureByMarkerKey[markerKey]
        let transitionDotFeature = transition?.dotFeature
        let dotOpacity = transition.map { Self.liveDotTransitionOpacity($0, atMs: nowMs) } ?? 1
        let placementPrerollOpacity = Self.sourceFeatureOpacityForPlacementPreroll(
          desiredFeatureIsPresent: desiredDotFeature != nil,
          transition: transition,
          currentOpacity: dotOpacity,
          state: state
        )
        let shouldRenderDot =
          desiredDotFeature != nil ||
          (transitionDotFeature != nil && dotOpacity > 0.001)
        guard shouldRenderDot, let feature = desiredDotFeature ?? transitionDotFeature else {
          continue
        }
        nextDotIdsInOrder.append(markerKey)
        nextDotIdSet.insert(markerKey)
        if dirtyDotMarkerKeys.contains(markerKey) {
          let shouldSeedHidden = desiredDotFeature != nil && transition?.targetOpacity == 1
          let renderFeature = Self.featureBySettingNumericProperties(
            feature,
            numericProperties: [
              "nativePresentationOpacity": state.currentPresentationOpacityValue,
              "nativeDotOpacity": shouldSeedHidden ? placementPrerollOpacity : 1,
            ]
          )
          nextDotFeatureById[markerKey] = renderFeature
          nextDotMarkerKeyByFeatureId[markerKey] = desiredDots.markerKeyByFeatureId[markerKey] ?? markerKey
          nextDotFeatureStateById[markerKey] =
            dotFamilyState.transientFeatureStateById[markerKey] ??
            desiredDots.featureStateById[markerKey] ??
            [:]
        }
      }
      for removedDotId in dirtyDotMarkerKeys where !nextDotIdSet.contains(removedDotId) {
        nextDotFeatureById.removeValue(forKey: removedDotId)
        nextDotFeatureStateById.removeValue(forKey: removedDotId)
        nextDotMarkerKeyByFeatureId.removeValue(forKey: removedDotId)
      }
      try Self.replaceParsedFeatureCollection(
        &dotFamilyState.collection,
        baseSourceState: previousDotSourceState,
        idsInOrder: nextDotIdsInOrder,
        featureById: nextDotFeatureById,
        featureStateById: nextDotFeatureStateById,
        markerKeyByFeatureId: nextDotMarkerKeyByFeatureId,
        dirtyGroupIds: dirtyDotMarkerKeys,
        orderChangedGroupIds: dirtyDotMarkerKeys,
        removedGroupIds: Set(dirtyDotMarkerKeys.filter { !nextDotIdSet.contains($0) })
      )
      Self.setDerivedFamilyState(dotFamilyState, sourceId: state.dotSourceId, state: &state)
      nextDots = dotFamilyState.collection
    }
    let previousDotInteractionSourceState = dotInteractionFamilyState.sourceState
    let nextDotInteractions: ParsedFeatureCollection
    let dirtyDotInteractionIds = Set(desiredDotInteractions.dirtyGroupIds)
      .union(desiredDotInteractions.orderChangedGroupIds)
      .union(desiredDotInteractions.removedGroupIds)
      .union(dirtyDotMarkerKeys)
    if dirtyDotInteractionIds.isEmpty {
      nextDotInteractions = dotInteractionFamilyState.collection
    } else {
      var nextDotInteractionIdsInOrder: [String] = []
      var nextDotInteractionFeatureById = dotInteractionFamilyState.collection.featureById
      var nextDotInteractionMarkerKeyByFeatureId = dotInteractionFamilyState.collection.markerKeyByFeatureId
      var nextDotInteractionIdSet = Set<String>()
      for featureId in desiredDotInteractions.idsInOrder {
        guard desiredDotFeatureByMarkerKey[featureId] != nil,
              let feature = desiredDotInteractions.featureById[featureId]
        else {
          continue
        }
        nextDotInteractionIdsInOrder.append(featureId)
        nextDotInteractionIdSet.insert(featureId)
        if dirtyDotInteractionIds.contains(featureId) {
          nextDotInteractionFeatureById[featureId] = feature
          nextDotInteractionMarkerKeyByFeatureId[featureId] =
            desiredDotInteractions.markerKeyByFeatureId[featureId] ?? featureId
        }
      }
      for removedInteractionId in dirtyDotInteractionIds where !nextDotInteractionIdSet.contains(removedInteractionId) {
        nextDotInteractionFeatureById.removeValue(forKey: removedInteractionId)
        nextDotInteractionMarkerKeyByFeatureId.removeValue(forKey: removedInteractionId)
      }
      try Self.replaceParsedFeatureCollection(
        &dotInteractionFamilyState.collection,
        baseSourceState: previousDotInteractionSourceState,
        idsInOrder: nextDotInteractionIdsInOrder,
        featureById: nextDotInteractionFeatureById,
        markerKeyByFeatureId: nextDotInteractionMarkerKeyByFeatureId,
        dirtyGroupIds: dirtyDotInteractionIds,
        orderChangedGroupIds: dirtyDotInteractionIds,
        removedGroupIds: Set(
          dirtyDotInteractionIds.filter { !nextDotInteractionIdSet.contains($0) }
        )
      )
      Self.setDerivedFamilyState(
        dotInteractionFamilyState,
        sourceId: state.dotInteractionSourceId,
        state: &state
      )
      nextDotInteractions = dotInteractionFamilyState.collection
    }
    return PreparedDerivedDotOutput(
      plans: [
        ParsedCollectionApplyPlan(
          sourceId: state.dotSourceId,
          next: nextDots,
          previousSourceState: previousDotSourceState,
          previousFeatureStateById: previousDotSourceState.featureStateById,
          previousFeatureStateRevision: previousDotSourceState.featureStateRevision
        ),
        ParsedCollectionApplyPlan(
          sourceId: state.dotInteractionSourceId,
          next: nextDotInteractions,
          previousSourceState: previousDotInteractionSourceState,
          previousFeatureStateById: previousDotInteractionSourceState.featureStateById,
          previousFeatureStateRevision: previousDotInteractionSourceState.featureStateRevision
        ),
      ],
      dotSourceId: state.dotSourceId
    )
  }

  private func finalizePreparedDotOutput(
    prepared: PreparedDerivedDotOutput,
    mutationSummaryBySourceId: [String: MutationSummary],
    state: inout InstanceState
  ) {
    var dotFamilyState = Self.derivedFamilyState(sourceId: state.dotSourceId, state: state)
    let dotMutationSummary = mutationSummaryBySourceId[prepared.dotSourceId] ?? MutationSummary(
      addCount: 0,
      updateCount: 0,
      removeCount: 0,
      dataId: nil,
      addedFeatureIds: []
    )
    if let dataId = dotMutationSummary.dataId, !dotMutationSummary.addedFeatureIds.isEmpty {
      for featureId in dotMutationSummary.addedFeatureIds {
        guard var transition = dotFamilyState.liveDotTransitionsByMarkerKey[featureId],
              transition.isAwaitingSourceCommit
        else {
          continue
        }
        transition.awaitingSourceDataId = dataId
        dotFamilyState.liveDotTransitionsByMarkerKey[featureId] = transition
      }
      Self.setDerivedFamilyState(dotFamilyState, sourceId: state.dotSourceId, state: &state)
    }
  }

  private static func makeDesiredPinSnapshotState(
    desiredPins: ParsedFeatureCollection,
    desiredPinInteractions: ParsedFeatureCollection,
    desiredLabels: ParsedFeatureCollection,
    desiredLabelCollisions: ParsedFeatureCollection,
    stickyCandidateByIdentity: [String: String],
    stickyRevision: Int,
    previousSnapshot: DesiredPinSnapshotState? = nil
  ) -> DesiredPinSnapshotState {
    var snapshot = previousSnapshot ?? DesiredPinSnapshotState()
    snapshot.inputRevision = desiredPinSnapshotInputRevision(
      desiredPins: desiredPins,
      desiredPinInteractions: desiredPinInteractions,
      desiredLabels: desiredLabels,
      desiredLabelCollisions: desiredLabelCollisions,
      stickyRevision: stickyRevision
    )
    snapshot.pinIdsInOrder = desiredPins.idsInOrder
    let nextPinMarkerKeys = Set(desiredPins.idsInOrder)
    for markerKey in nextPinMarkerKeys {
      let revision = desiredPins.diffKeyById[markerKey] ?? ""
      snapshot.pinFeatureRevisionByMarkerKey[markerKey] = revision
    }
    for removedMarkerKey in Set(snapshot.pinFeatureRevisionByMarkerKey.keys).subtracting(nextPinMarkerKeys) {
      snapshot.pinFeatureRevisionByMarkerKey.removeValue(forKey: removedMarkerKey)
    }
    let nextPinInteractionMarkerKeys = Set(desiredPinInteractions.idsInOrder)
    for markerKey in nextPinInteractionMarkerKeys {
      let revision = desiredPinInteractions.diffKeyById[markerKey] ?? ""
      snapshot.pinInteractionFeatureRevisionByMarkerKey[markerKey] = revision
    }
    for removedMarkerKey in Set(snapshot.pinInteractionFeatureRevisionByMarkerKey.keys).subtracting(nextPinInteractionMarkerKeys) {
      snapshot.pinInteractionFeatureRevisionByMarkerKey.removeValue(forKey: removedMarkerKey)
    }
    for (index, markerKey) in desiredPins.idsInOrder.enumerated() {
      guard let feature = desiredPins.featureById[markerKey] else {
        continue
      }
      let featurePropertyLodZ =
        ((feature.properties?.turfRawValue as? [String: Any])?["nativeLodZ"] as? NSNumber)?.intValue
      let fallbackLodZ = max(0, desiredPins.idsInOrder.count - 1 - index)
      snapshot.pinLodZByMarkerKey[markerKey] = featurePropertyLodZ ?? fallbackLodZ
    }
    for removedMarkerKey in Set(snapshot.pinLodZByMarkerKey.keys).subtracting(nextPinMarkerKeys) {
      snapshot.pinLodZByMarkerKey.removeValue(forKey: removedMarkerKey)
    }
    let nextLabelMarkerKeys = Set(desiredLabels.markerKeyByFeatureId.values)
    var nextLabelFeaturesByMarkerKey: [String: [(id: String, feature: Feature)]] = [:]
    for featureId in desiredLabels.idsInOrder {
      guard let feature = desiredLabels.featureById[featureId] else {
        continue
      }
      let markerKey = desiredLabels.markerKeyByFeatureId[featureId] ?? featureId
      nextLabelFeaturesByMarkerKey[markerKey, default: []].append((featureId, feature))
    }
    for markerKey in nextLabelMarkerKeys {
      let labelFeatures = nextLabelFeaturesByMarkerKey[markerKey] ?? []
      var hash = fnv1a64OffsetBasis
      Self.fnv1a64Append(&hash, string: markerKey)
      Self.fnv1a64Append(&hash, string: String(labelFeatures.count))
      for labelFeature in labelFeatures {
        Self.fnv1a64Append(&hash, string: labelFeature.id)
        Self.fnv1a64Append(&hash, string: desiredLabels.diffKeyById[labelFeature.id] ?? "")
        let preferredCandidate = Self.effectiveLabelPreference(
          for: labelFeature.feature,
          markerKey: markerKey,
          stickyCandidateByIdentity: stickyCandidateByIdentity
        )
        Self.fnv1a64Append(&hash, string: preferredCandidate)
      }
      let revision = Self.finishHashedRevision(hash: hash, count: labelFeatures.count)
      snapshot.labelFeatureRevisionByMarkerKey[markerKey] = revision
    }
    for removedMarkerKey in Set(snapshot.labelFeatureRevisionByMarkerKey.keys).subtracting(nextLabelMarkerKeys) {
      snapshot.labelFeatureRevisionByMarkerKey.removeValue(forKey: removedMarkerKey)
    }
    let nextLabelCollisionMarkerKeys = Set(
      desiredLabelCollisions.idsInOrder.map { desiredLabelCollisions.markerKeyByFeatureId[$0] ?? $0 }
    )
    for featureId in desiredLabelCollisions.idsInOrder {
      guard desiredLabelCollisions.featureById[featureId] != nil else {
        continue
      }
      let markerKey = desiredLabelCollisions.markerKeyByFeatureId[featureId] ?? featureId
      let revision = desiredLabelCollisions.diffKeyById[featureId] ?? ""
      snapshot.labelCollisionFeatureRevisionByMarkerKey[markerKey] = revision
    }
    for removedMarkerKey in Set(snapshot.labelCollisionFeatureRevisionByMarkerKey.keys).subtracting(nextLabelCollisionMarkerKeys) {
      snapshot.labelCollisionFeatureRevisionByMarkerKey.removeValue(forKey: removedMarkerKey)
    }
    return snapshot
  }

  private static func makeDesiredPinSnapshotDirtyState(
    previousSnapshot: DesiredPinSnapshotState,
    nextSnapshot: DesiredPinSnapshotState
  ) -> DesiredPinSnapshotDirtyState {
    var dirtyState = DesiredPinSnapshotDirtyState()
    let pinMarkerKeys =
      Set(previousSnapshot.pinFeatureRevisionByMarkerKey.keys)
      .union(nextSnapshot.pinFeatureRevisionByMarkerKey.keys)
    for markerKey in pinMarkerKeys {
      if
        previousSnapshot.pinFeatureRevisionByMarkerKey[markerKey] != nextSnapshot.pinFeatureRevisionByMarkerKey[markerKey] ||
        previousSnapshot.pinLodZByMarkerKey[markerKey] != nextSnapshot.pinLodZByMarkerKey[markerKey]
      {
        dirtyState.pinMarkerKeys.insert(markerKey)
      }
    }
    let pinInteractionMarkerKeys =
      Set(previousSnapshot.pinInteractionFeatureRevisionByMarkerKey.keys)
      .union(nextSnapshot.pinInteractionFeatureRevisionByMarkerKey.keys)
    for markerKey in pinInteractionMarkerKeys {
      if
        previousSnapshot.pinInteractionFeatureRevisionByMarkerKey[markerKey] != nextSnapshot.pinInteractionFeatureRevisionByMarkerKey[markerKey]
      {
        dirtyState.pinInteractionMarkerKeys.insert(markerKey)
      }
    }
    let labelMarkerKeys =
      Set(previousSnapshot.labelFeatureRevisionByMarkerKey.keys)
      .union(nextSnapshot.labelFeatureRevisionByMarkerKey.keys)
    for markerKey in labelMarkerKeys {
      if previousSnapshot.labelFeatureRevisionByMarkerKey[markerKey] != nextSnapshot.labelFeatureRevisionByMarkerKey[markerKey] {
        dirtyState.labelMarkerKeys.insert(markerKey)
      }
    }
    let labelCollisionMarkerKeys =
      Set(previousSnapshot.labelCollisionFeatureRevisionByMarkerKey.keys)
      .union(nextSnapshot.labelCollisionFeatureRevisionByMarkerKey.keys)
    for markerKey in labelCollisionMarkerKeys {
      if previousSnapshot.labelCollisionFeatureRevisionByMarkerKey[markerKey] != nextSnapshot.labelCollisionFeatureRevisionByMarkerKey[markerKey] {
        dirtyState.labelCollisionMarkerKeys.insert(markerKey)
      }
    }
    return dirtyState
  }

  private static func makeDesiredMarkerFamilyPayloads(
    desiredPins: ParsedFeatureCollection,
    desiredPinInteractions: ParsedFeatureCollection,
    desiredLabels: ParsedFeatureCollection,
    desiredLabelCollisions: ParsedFeatureCollection
  ) -> DesiredMarkerFamilyPayloads {
    var payloads = DesiredMarkerFamilyPayloads()
    for markerKey in desiredPins.idsInOrder {
      guard let feature = desiredPins.featureById[markerKey] else {
        continue
      }
      payloads.pinFeatureByMarkerKey[markerKey] = feature
    }
    for markerKey in desiredPinInteractions.idsInOrder {
      guard let feature = desiredPinInteractions.featureById[markerKey] else {
        continue
      }
      payloads.pinInteractionFeatureByMarkerKey[markerKey] = feature
    }
    for featureId in desiredLabels.idsInOrder {
      guard let feature = desiredLabels.featureById[featureId] else {
        continue
      }
      let markerKey = desiredLabels.markerKeyByFeatureId[featureId] ?? featureId
      payloads.labelFeaturesByMarkerKey[markerKey, default: []].append((
        featureId,
        feature
      ))
    }
    for featureId in desiredLabelCollisions.idsInOrder {
      guard let feature = desiredLabelCollisions.featureById[featureId] else {
        continue
      }
      let markerKey = desiredLabelCollisions.markerKeyByFeatureId[featureId] ?? featureId
      payloads.labelCollisionFeatureByMarkerKey[markerKey] = feature
    }
    return payloads
  }

  private static func desiredPinSnapshotInputRevision(
    desiredPins: ParsedFeatureCollection,
    desiredPinInteractions: ParsedFeatureCollection,
    desiredLabels: ParsedFeatureCollection,
    desiredLabelCollisions: ParsedFeatureCollection,
    stickyRevision: Int
  ) -> String {
    var hash = fnv1a64OffsetBasis
    Self.fnv1a64Append(&hash, string: "pins")
    Self.fnv1a64Append(&hash, string: desiredPins.sourceRevision)
    Self.fnv1a64Append(&hash, string: "pinInteractions")
    Self.fnv1a64Append(&hash, string: desiredPinInteractions.sourceRevision)
    Self.fnv1a64Append(&hash, string: "labels")
    Self.fnv1a64Append(&hash, string: desiredLabels.sourceRevision)
    Self.fnv1a64Append(&hash, string: "labelCollisions")
    Self.fnv1a64Append(&hash, string: desiredLabelCollisions.sourceRevision)
    Self.fnv1a64Append(&hash, string: "labelSticky")
    Self.fnv1a64Append(&hash, string: String(stickyRevision))
    return Self.finishHashedRevision(hash: hash, count: 5)
  }

  private func startEnterPresentation(
    instanceId: String,
    requestKey: String,
    revealStartToken: Double,
    previousPresentationBatchPhase: String? = nil,
    previousPresentationOpacityTarget: Double? = nil
  ) throws {
    guard var state = instances[instanceId] else {
      return
    }
    guard
      let requestedRevealRequestKey = state.enterLane.requestedRequestKey,
      requestedRevealRequestKey == requestKey,
      let mountedHiddenExecutionBatch = state.enterLane.mountedHidden,
      state.activeFrameGenerationId == mountedHiddenExecutionBatch.generationId
    else {
      return
    }
    guard state.lastEnterRequestKey == requestKey else {
      return
    }
    guard state.lastEnterStartedRequestKey != requestKey else {
      return
    }
    guard state.lastDismissRequestKey == nil else {
      return
    }
    state.blockedEnterStartRequestKey = nil
    state.blockedEnterStartCommitFenceStartedAtMs = nil
    state.blockedEnterStartCommitFenceBySourceId.removeAll()
    state.lastEnterStartToken = revealStartToken
    state.enterLane.entering = mountedHiddenExecutionBatch
    state.currentPresentationRenderPhase = "entering"
    state.visualSourceLifecycleState = .revealing
    restartLiveEnterTransitionsForRevealStart(instanceId: instanceId, state: &state)
    instances[instanceId] = state
    try applyLivePinTransitionFeatureStates(for: instanceId)
    state = instances[instanceId] ?? state
    try animatePresentationOpacity(
      to: 1,
      for: &state,
      instanceId: instanceId,
      reason: "reveal_start"
    )
    state.lastEnterStartedRequestKey = requestKey
    instances[instanceId] = state
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "presentation_transition previousPhase=\(previousPresentationBatchPhase ?? state.lastPresentationBatchPhase) nextPhase=\(state.lastPresentationBatchPhase) previousOpacity=\(previousPresentationOpacityTarget ?? state.currentPresentationOpacityTarget) nextOpacity=\(state.currentPresentationOpacityTarget) revealRequest=\(requestKey) dismissRequest=\(state.lastDismissRequestKey ?? "nil")"
    )
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "enter_started phase=\(state.lastPresentationBatchPhase) pins=\(state.lastPinCount) dots=\(state.lastDotCount) labels=\(state.lastLabelCount) \(Self.phaseSummary(for: state))"
    )
    emit([
      "type": "presentation_enter_started",
      "instanceId": instanceId,
      "requestKey": requestKey,
      "frameGenerationId": state.enterLane.entering?.generationId as Any,
      "executionBatchId": state.enterLane.entering?.batchId as Any,
      "pinCount": state.lastPinCount,
      "dotCount": state.lastDotCount,
      "labelCount": state.lastLabelCount,
      "startedAtMs": Self.nowMs(),
    ])
    if state.lastPinCount + state.lastDotCount + state.lastLabelCount == 0 {
      // Empty reveal frames have no rendered marker work to wait on. Settle immediately
      // before later presentation-only frame churn can replace the active generation.
      settleEnterAfterRenderedFrame(instanceId: instanceId, requestKey: requestKey)
      return
    }
    let workItem = DispatchWorkItem { [weak self] in
      guard let self else { return }
      self.enterSettleWorkItems[instanceId] = nil
      guard var latestState = self.instances[instanceId] else { return }
      guard latestState.lastEnterRequestKey == requestKey else { return }
      guard latestState.lastEnterStartedRequestKey == requestKey else { return }
      guard latestState.lastEnterSettledRequestKey != requestKey else { return }
      guard latestState.lastDismissRequestKey == nil else { return }
      let commitFence = self.capturePendingVisualSourceCommitFence(state: latestState)
      if self.hasPendingCommitFence(commitFence) {
        latestState.blockedPresentationSettleRequestKey = requestKey
        latestState.blockedPresentationSettleKind = "enter"
        latestState.blockedPresentationCommitFenceStartedAtMs = Self.nowMs()
        latestState.blockedPresentationCommitFenceBySourceId = commitFence
        latestState.currentPresentationRenderPhase = "enter_wait_commit"
        self.emitVisualDiag(
          instanceId: instanceId,
          message:
            "enter_commit_fence_blocked pending=\(self.describeCommitFence(commitFence)) \(self.commitFenceWaitSummary(state: latestState))"
        )
      } else {
        latestState.blockedPresentationCommitFenceStartedAtMs = nil
        latestState.currentPresentationRenderPhase = "enter_settling"
        latestState.pendingPresentationSettleRequestKey = requestKey
        latestState.pendingPresentationSettleKind = "enter"
        self.armNativeEnterSettle(instanceId: instanceId, requestKey: requestKey)
      }
      self.instances[instanceId] = latestState
    }
    enterSettleWorkItems[instanceId] = workItem
    DispatchQueue.main.asyncAfter(
      deadline: .now() + .milliseconds(enterSettleDelayMs),
      execute: workItem
    )
  }

  private func emitExecutionBatchMountedHidden(
    instanceId: String,
    executionBatch: ExecutionBatchRef,
    state: inout InstanceState
  ) {
    guard state.lastEnterRequestKey == executionBatch.requestKey else {
      return
    }
    guard state.enterLane.requestedRequestKey == executionBatch.requestKey else {
      return
    }
    guard state.enterLane.mountedHidden != executionBatch else {
      return
    }
    state.enterLane.mountedHidden = executionBatch
    instances[instanceId] = state
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "execution_batch_mounted_hidden phase=\(state.lastPresentationBatchPhase) frame=\(state.activeFrameGenerationId ?? "nil") \(Self.phaseSummary(for: state))"
    )
    startAwaitingLivePinTransitions(
      instanceId: instanceId,
      dataId: nil,
      reason: "mounted_hidden",
      state: &state
    )
    startAwaitingLiveDotTransitions(
      instanceId: instanceId,
      dataId: nil,
      reason: "mounted_hidden",
      state: &state
    )
    maybeEmitExecutionBatchArmed(instanceId: instanceId, state: &state)
  }

  private func maybeEmitExecutionBatchArmed(
    instanceId: String,
    state: inout InstanceState
  ) {
    guard let executionBatch = state.enterLane.mountedHidden else {
      return
    }
    guard let presentationStateJSON = state.lastPresentationStateJSON else {
      return
    }
    guard Self.isEnterStatusArmable(Self.readEnterStatus(fromJSON: presentationStateJSON)) else {
      return
    }
    guard state.lastEnterRequestKey == executionBatch.requestKey else {
      return
    }
    guard state.enterLane.requestedRequestKey == executionBatch.requestKey else {
      return
    }
    guard state.enterLane.armed != executionBatch else {
      return
    }
    guard state.lastDismissRequestKey == nil else {
      return
    }
    guard state.lastEnterStartedRequestKey != executionBatch.requestKey else {
      return
    }
    guard state.blockedEnterStartRequestKey == nil else {
      return
    }
    guard !hasPendingCommitFence(capturePendingVisualSourceCommitFence(state: state)) else {
      return
    }
    guard state.activeFrameGenerationId == executionBatch.generationId else {
      return
    }
    guard Self.isActiveFrameSourceReady(state: state) else {
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "enter_armed_blocked_source_not_ready phase=\(state.lastPresentationBatchPhase) frame=\(state.activeFrameGenerationId ?? "nil") sourceReadyFrame=\(state.sourceReadyFrameGenerationId ?? "nil") \(Self.phaseSummary(for: state))"
      )
      return
    }
    guard Self.isActiveFrameLabelPlacementReady(state: state) else {
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "enter_armed_blocked_label_placement phase=\(state.lastPresentationBatchPhase) frame=\(state.activeFrameGenerationId ?? "nil") \(Self.labelPlacementReadinessSummary(state: state))"
      )
      return
    }
    state.enterLane.armed = executionBatch
    instances[instanceId] = state
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "enter_armed phase=\(state.lastPresentationBatchPhase) frame=\(state.activeFrameGenerationId ?? "nil") \(Self.phaseSummary(for: state))"
    )
    emit([
      "type": "presentation_execution_batch_mounted_hidden",
      "instanceId": instanceId,
      "requestKey": executionBatch.requestKey,
      "frameGenerationId": executionBatch.generationId,
      "executionBatchId": executionBatch.batchId,
      "readyAtMs": Self.nowMs(),
    ])
    emit([
      "type": "presentation_enter_armed",
      "instanceId": instanceId,
      "requestKey": executionBatch.requestKey,
      "frameGenerationId": executionBatch.generationId,
      "executionBatchId": executionBatch.batchId,
      "armedAtMs": Self.nowMs(),
    ])
  }

  private func maybeElectMountedHiddenExecutionBatch(
    instanceId: String,
    state: inout InstanceState
  ) {
    guard let requestKey = state.enterLane.requestedRequestKey else {
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "enter_mount_not_elected reason=missing_requested_request phase=\(state.lastPresentationBatchPhase) frame=\(state.activeFrameGenerationId ?? "nil")"
      )
      return
    }
    guard let presentationStateJSON = state.lastPresentationStateJSON else {
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "enter_mount_not_elected reason=missing_presentation_state request=\(requestKey) phase=\(state.lastPresentationBatchPhase) frame=\(state.activeFrameGenerationId ?? "nil")"
      )
      return
    }
    guard Self.isEnterStatusArmable(Self.readEnterStatus(fromJSON: presentationStateJSON)) else {
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "enter_mount_not_elected reason=enter_status_not_armable request=\(requestKey) status=\(Self.readEnterStatus(fromJSON: presentationStateJSON) ?? "nil") phase=\(state.lastPresentationBatchPhase) frame=\(state.activeFrameGenerationId ?? "nil")"
      )
      return
    }
    guard state.lastEnterRequestKey == requestKey else {
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "enter_mount_not_elected reason=request_mismatch requested=\(requestKey) lastEnter=\(state.lastEnterRequestKey ?? "nil") phase=\(state.lastPresentationBatchPhase) frame=\(state.activeFrameGenerationId ?? "nil")"
      )
      return
    }
    guard state.lastDismissRequestKey == nil else {
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "enter_mount_not_elected reason=dismiss_active request=\(requestKey) dismiss=\(state.lastDismissRequestKey ?? "nil") phase=\(state.lastPresentationBatchPhase) frame=\(state.activeFrameGenerationId ?? "nil")"
      )
      return
    }
    guard state.lastEnterStartedRequestKey != requestKey else {
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "enter_mount_not_elected reason=enter_already_started request=\(requestKey) phase=\(state.lastPresentationBatchPhase) frame=\(state.activeFrameGenerationId ?? "nil")"
      )
      return
    }
    guard let activeExecutionBatchId = state.activeExecutionBatchId else {
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "enter_mount_not_elected reason=missing_execution_batch request=\(requestKey) phase=\(state.lastPresentationBatchPhase) frame=\(state.activeFrameGenerationId ?? "nil")"
      )
      return
    }
    guard let activeFrameGenerationId = state.activeFrameGenerationId else {
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "enter_mount_not_elected reason=missing_frame_generation request=\(requestKey) phase=\(state.lastPresentationBatchPhase)"
      )
      return
    }
    guard Self.isActiveFrameSourceReady(state: state) else {
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "enter_mount_blocked_source_not_ready phase=\(state.lastPresentationBatchPhase) frame=\(state.activeFrameGenerationId ?? "nil") sourceReadyFrame=\(state.sourceReadyFrameGenerationId ?? "nil") \(Self.phaseSummary(for: state))"
      )
      return
    }
    guard Self.isActiveFrameLabelPlacementReady(state: state) else {
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "enter_mount_blocked_label_placement phase=\(state.lastPresentationBatchPhase) frame=\(state.activeFrameGenerationId ?? "nil") \(Self.labelPlacementReadinessSummary(state: state))"
      )
      retryLabelObservationRefreshIfPlacementPending(instanceId: instanceId, delayMs: 0)
      return
    }
    if !state.allowEmptyEnter, state.lastPinCount + state.lastDotCount + state.lastLabelCount == 0 {
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "enter_mount_blocked_empty phase=\(state.lastPresentationBatchPhase) frame=\(state.activeFrameGenerationId ?? "nil") \(Self.phaseSummary(for: state))"
      )
      return
    }
    emitExecutionBatchMountedHidden(
      instanceId: instanceId,
      executionBatch: ExecutionBatchRef(
        requestKey: requestKey,
        batchId: activeExecutionBatchId,
        generationId: activeFrameGenerationId
      ),
      state: &state
    )
  }

  private func settleEnterAfterRenderedFrame(instanceId: String, requestKey: String) {
    revealFrameFallbackWorkItems[instanceId]?.cancel()
    revealFrameFallbackWorkItems[instanceId] = nil
    guard var state = instances[instanceId] else {
      return
    }
    guard state.lastEnterRequestKey == requestKey else {
      return
    }
    guard state.lastEnterStartedRequestKey == requestKey else {
      return
    }
    guard state.lastEnterSettledRequestKey != requestKey else {
      return
    }
    guard state.lastDismissRequestKey == nil else {
      return
    }
    state.enterLane.liveBaseline = state.enterLane.entering
    state.enterLane.requestedRequestKey = nil
    state.enterLane.mountedHidden = nil
    state.enterLane.armed = nil
    state.enterLane.entering = nil
    state.lastEnterSettledRequestKey = requestKey
    state.pendingPresentationSettleRequestKey = nil
    state.pendingPresentationSettleKind = nil
    state.blockedPresentationSettleRequestKey = nil
    state.blockedPresentationSettleKind = nil
    state.blockedPresentationCommitFenceStartedAtMs = nil
    state.blockedPresentationCommitFenceBySourceId.removeAll()
    state.currentPresentationRenderPhase = "live"
    state.visualSourceLifecycleState = .visible
    state.keepSourcesHiddenUntilEnter = false
    instances[instanceId] = state
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "enter_settled phase=\(state.lastPresentationBatchPhase) pins=\(state.lastPinCount) dots=\(state.lastDotCount) labels=\(state.lastLabelCount) \(Self.phaseSummary(for: state))"
    )
    emit([
      "type": "presentation_enter_settled",
      "instanceId": instanceId,
      "requestKey": requestKey,
      "frameGenerationId": state.enterLane.liveBaseline?.generationId as Any,
      "executionBatchId": state.enterLane.liveBaseline?.batchId as Any,
      "pinCount": state.lastPinCount,
      "dotCount": state.lastDotCount,
      "labelCount": state.lastLabelCount,
      "settledAtMs": Self.nowMs(),
    ])
    scheduleLabelObservationRefresh(instanceId: instanceId, delayMs: 0)
  }

  private func settleDismissAfterRenderedFrame(instanceId: String, requestKey: String) {
    dismissFrameFallbackWorkItems[instanceId]?.cancel()
    dismissFrameFallbackWorkItems[instanceId] = nil
    guard var state = instances[instanceId], state.lastDismissRequestKey == requestKey else {
      return
    }
    state.pendingPresentationSettleRequestKey = nil
    state.pendingPresentationSettleKind = nil
    state.blockedPresentationSettleRequestKey = nil
    state.blockedPresentationSettleKind = nil
    state.blockedPresentationCommitFenceStartedAtMs = nil
    state.blockedPresentationCommitFenceBySourceId.removeAll()
    if state.visualSourceLifecycleState != .dismissed {
      completeDismissVisualLifecycle(
        instanceId: instanceId,
        state: &state,
        requestKey: requestKey,
        reason: "dismiss_settled"
      )
    } else {
      state.currentPresentationRenderPhase = "idle"
      state.keepSourcesHiddenUntilEnter = true
      state.currentPresentationOpacityTarget = 0
      state.currentPresentationOpacityValue = 0
    }
    instances[instanceId] = state
    emit([
      "type": "presentation_exit_settled",
      "instanceId": instanceId,
      "requestKey": requestKey,
      "frameGenerationId": state.activeFrameGenerationId as Any,
      "pinCount": state.lastPinCount,
      "dotCount": state.lastDotCount,
      "labelCount": state.lastLabelCount,
      "settledAtMs": Self.nowMs(),
    ])
  }

  private func clearResidentSources(for state: InstanceState) throws {
    try withMapboxMap(for: state.mapTag) { mapboxMap in
      let emptyCollection = FeatureCollection(features: [])
      for sourceId in [
        state.pinSourceId,
        state.pinInteractionSourceId,
        state.dotSourceId,
        state.dotInteractionSourceId,
        state.labelSourceId,
        state.labelInteractionSourceId,
        state.labelCollisionSourceId,
      ] {
        mapboxMap.updateGeoJSONSource(
          withId: sourceId,
          geoJSON: .featureCollection(emptyCollection)
        )
      }
    }
  }

  private func clearDismissedResidentSourceState(
    instanceId: String,
    state: inout InstanceState,
    reason: String
  ) throws {
    try clearResidentSources(for: state)
    state.pendingSourceCommitDataIdsBySourceId.removeAll(keepingCapacity: true)
    state.blockedEnterStartCommitFenceBySourceId.removeAll(keepingCapacity: true)
    state.blockedPresentationCommitFenceBySourceId.removeAll(keepingCapacity: true)
    state.derivedFamilyStates = Self.makeInitialDerivedFamilyStates(
      pinSourceId: state.pinSourceId,
      pinInteractionSourceId: state.pinInteractionSourceId,
      dotSourceId: state.dotSourceId,
      dotInteractionSourceId: state.dotInteractionSourceId,
      labelSourceId: state.labelSourceId,
      labelInteractionSourceId: state.labelInteractionSourceId,
      labelCollisionSourceId: state.labelCollisionSourceId
    )
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "hidden_dismissed_source_payload_dropped reason=\(reason) request=\(state.lastDismissRequestKey ?? "nil") frame=\(state.activeFrameGenerationId ?? "nil")"
    )
  }

  private func clearInteractionSourcesForDismissStart(
    instanceId: String,
    state: inout InstanceState,
    reason: String
  ) {
    emitDismissVisualLifecycleProbe(
      instanceId: instanceId,
      state: state,
      stage: "before_clear_interactions",
      reason: reason
    )
    labelObservationRefreshWorkItems[instanceId]?.cancel()
    labelObservationRefreshWorkItems[instanceId] = nil

    var labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    labelFamilyState.settledVisibleFeatureIds.removeAll()
    labelFamilyState.labelObservation.lastVisibleLabelFeatureIds = []
    labelFamilyState.labelObservation.lastLayerRenderedFeatureCount = 0
    labelFamilyState.labelObservation.lastEffectiveRenderedFeatureCount = 0
    labelFamilyState.labelObservation.isRefreshInFlight = false
    labelFamilyState.labelObservation.queuedRefreshDelayMs = nil
    Self.setDerivedFamilyState(labelFamilyState, sourceId: state.labelSourceId, state: &state)

    let interactionClearStartedAt = CACurrentMediaTime() * 1000
    do {
      try clearMountedInteractionSources(
        instanceId: instanceId,
        state: &state
      )
      recordNativeApply(
        section: "presentation.dismiss_start_clear_interactions",
        phase: state.lastPresentationBatchPhase,
        durationMs: CACurrentMediaTime() * 1000 - interactionClearStartedAt,
        operationCount: 3
      )
    } catch {
      emit([
        "type": "error",
        "instanceId": instanceId,
        "message": "dismiss_clear_interactions_failed reason=\(reason): \(error.localizedDescription)",
      ])
    }
    emitDismissVisualLifecycleProbe(
      instanceId: instanceId,
      state: state,
      stage: "after_clear_interactions",
      reason: reason
    )
  }

  private func beginRevealVisualLifecycle(
    instanceId: String,
    state: inout InstanceState,
    reason: String
  ) {
    deferredDismissSourceCleanupWorkItems[instanceId]?.cancel()
    deferredDismissSourceCleanupWorkItems[instanceId] = nil
    resetLiveMarkerEnterState(
      instanceId: instanceId,
      state: &state,
      reason: reason
    )
    if state.labelPlacementLayersFadeOnly {
      let labelPlacementStartedAt = CACurrentMediaTime() * 1000
      setLabelPlacementLayersFadeOnly(
        false,
        for: state,
        instanceId: instanceId,
        reason: "reveal_preroll"
      )
      state.labelPlacementLayersFadeOnly = false
      recordNativeApply(
        section: "presentation.reveal_preroll_label_placement_layers",
        phase: state.lastPresentationBatchPhase,
        durationMs: CACurrentMediaTime() * 1000 - labelPlacementStartedAt,
        operationCount: labelPlacementLayerIds.count
      )
    }
    if state.dotPlacementLayersFadeOnly {
      let dotPlacementStartedAt = CACurrentMediaTime() * 1000
      setDotPlacementLayersFadeOnly(
        false,
        for: state,
        instanceId: instanceId,
        reason: "reveal_preroll"
      )
      state.dotPlacementLayersFadeOnly = false
      recordNativeApply(
        section: "presentation.reveal_preroll_dot_placement_layers",
        phase: state.lastPresentationBatchPhase,
        durationMs: CACurrentMediaTime() * 1000 - dotPlacementStartedAt,
        operationCount: dotPlacementLayerIds.count
      )
    }
    let collisionRestoreStartedAt = CACurrentMediaTime() * 1000
    setLabelCollisionObstacleLayersVisible(
      true,
      for: state,
      instanceId: instanceId,
      reason: "reveal_preroll"
    )
    state.labelCollisionObstacleLayersVisible = true
    recordNativeApply(
      section: "presentation.reveal_preroll_collision_restore",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - collisionRestoreStartedAt,
      operationCount: labelCollisionObstacleLayerIds.count
    )
    state.visualSourceLifecycleState = .preparingReveal
    state.keepSourcesHiddenUntilEnter = false
    state.currentPresentationRenderPhase = "reveal_preroll"
    state.currentPresentationOpacityTarget = revealPrerollPlacementOpacity
    state.currentPresentationOpacityValue = revealPrerollPlacementOpacity
  }

  private func beginDismissVisualLifecycle(
    instanceId: String,
    state: inout InstanceState
  ) {
    emitDismissVisualLifecycleProbe(
      instanceId: instanceId,
      state: state,
      stage: "dismiss_start_entry",
      reason: "dismiss_start"
    )
    let frozenLabelCount = freezeVisibleDismissLabelSourceForFade(
      instanceId: instanceId,
      state: state,
      reason: "dismiss_start"
    )
    emitDismissVisualLifecycleProbe(
      instanceId: instanceId,
      state: state,
      stage: "after_label_freeze",
      reason: "dismiss_start",
      extra: "frozenLabelCount=\(frozenLabelCount)"
    )
    if frozenLabelCount > 0 && !state.labelPlacementLayersFadeOnly {
      let labelPlacementStartedAt = CACurrentMediaTime() * 1000
      setLabelPlacementLayersFadeOnly(
        true,
        for: state,
        instanceId: instanceId,
        reason: "dismiss_start"
      )
      state.labelPlacementLayersFadeOnly = true
      recordNativeApply(
        section: "presentation.dismiss_start_label_fade_only_layers",
        phase: state.lastPresentationBatchPhase,
        durationMs: CACurrentMediaTime() * 1000 - labelPlacementStartedAt,
        operationCount: labelPlacementLayerIds.count
      )
    }
    let collisionLayerStartedAt = CACurrentMediaTime() * 1000
    setLabelCollisionObstacleLayersVisible(
      false,
      for: state,
      instanceId: instanceId,
      reason: "dismiss_start"
    )
    state.labelCollisionObstacleLayersVisible = false
    recordNativeApply(
      section: "presentation.dismiss_start_collision_obstacle_layers",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - collisionLayerStartedAt,
      operationCount: labelCollisionObstacleLayerIds.count
    )
    clearInteractionSourcesForDismissStart(
      instanceId: instanceId,
      state: &state,
      reason: "dismiss_start"
    )
    if !state.dotPlacementLayersFadeOnly {
      let dotPlacementStartedAt = CACurrentMediaTime() * 1000
      setDotPlacementLayersFadeOnly(
        true,
        for: state,
        instanceId: instanceId,
        reason: "dismiss_start"
      )
      state.dotPlacementLayersFadeOnly = true
      recordNativeApply(
        section: "presentation.dismiss_start_dot_fade_only_layers",
        phase: state.lastPresentationBatchPhase,
        durationMs: CACurrentMediaTime() * 1000 - dotPlacementStartedAt,
        operationCount: dotPlacementLayerIds.count
      )
    }
    state.keepSourcesHiddenUntilEnter = true
    state.currentPresentationRenderPhase = "exiting"
    state.visualSourceLifecycleState = .dismissing
    state.currentPresentationOpacityTarget = 0
  }

  private func emitDismissVisualLifecycleProbe(
    instanceId: String,
    state: InstanceState,
    stage: String,
    reason: String,
    extra: String = ""
  ) {
    let pinFamilyState = Self.derivedFamilyState(sourceId: state.pinSourceId, state: state)
    let pinInteractionFamilyState = Self.derivedFamilyState(
      sourceId: state.pinInteractionSourceId,
      state: state
    )
    let dotFamilyState = Self.derivedFamilyState(sourceId: state.dotSourceId, state: state)
    let dotInteractionFamilyState = Self.derivedFamilyState(
      sourceId: state.dotInteractionSourceId,
      state: state
    )
    let labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    let labelInteractionFamilyState = Self.derivedFamilyState(
      sourceId: state.labelInteractionSourceId,
      state: state
    )
    let labelCollisionFamilyState = Self.derivedFamilyState(
      sourceId: state.labelCollisionSourceId,
      state: state
    )
    let visibleDismissLabelCount = Self.visibleDismissLabelFeatureIds(labelFamilyState).count
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "dismiss_visual_lifecycle_probe stage=\(stage) reason=\(reason) phase=\(state.lastPresentationBatchPhase) renderPhase=\(state.currentPresentationRenderPhase) lifecycle=\(state.visualSourceLifecycleState) opacityTarget=\(Self.round3(state.currentPresentationOpacityTarget)) opacityValue=\(Self.round3(state.currentPresentationOpacityValue)) pins=\(pinFamilyState.collection.idsInOrder.count) pinInteractions=\(pinInteractionFamilyState.collection.idsInOrder.count) dots=\(dotFamilyState.collection.idsInOrder.count) dotInteractions=\(dotInteractionFamilyState.collection.idsInOrder.count) labels=\(labelFamilyState.collection.idsInOrder.count) labelInteractions=\(labelInteractionFamilyState.collection.idsInOrder.count) labelCollisions=\(labelCollisionFamilyState.collection.idsInOrder.count) lastVisibleLabels=\(labelFamilyState.labelObservation.lastVisibleLabelFeatureIds.count) settledVisibleLabels=\(labelFamilyState.settledVisibleFeatureIds.count) visibleDismissLabels=\(visibleDismissLabelCount) labelFadeOnly=\(state.labelPlacementLayersFadeOnly) dotFadeOnly=\(state.dotPlacementLayersFadeOnly) collisionVisible=\(state.labelCollisionObstacleLayersVisible)\(extra.isEmpty ? "" : " \(extra)")"
    )
  }

  private func completeDismissVisualLifecycle(
    instanceId: String,
    state: inout InstanceState,
    requestKey: String?,
    reason: String
  ) {
    labelObservationRefreshWorkItems[instanceId]?.cancel()
    labelObservationRefreshWorkItems[instanceId] = nil
    let residentSourceCache = Self.currentDesiredSourceCache(state: state)
    if !residentSourceCache.isEmpty {
      state.residentDesiredSourceCacheBySourceId = residentSourceCache
    }
    if state.labelCollisionObstacleLayersVisible {
      let collisionLayerStartedAt = CACurrentMediaTime() * 1000
      setLabelCollisionObstacleLayersVisible(
        false,
        for: state,
        instanceId: instanceId,
        reason: reason
      )
      state.labelCollisionObstacleLayersVisible = false
      recordNativeApply(
        section: "presentation.dismissed_collision_obstacle_layers",
        phase: state.lastPresentationBatchPhase,
        durationMs: CACurrentMediaTime() * 1000 - collisionLayerStartedAt,
        operationCount: labelCollisionObstacleLayerIds.count
      )
    }
    if state.labelPlacementLayersFadeOnly {
      let labelPlacementStartedAt = CACurrentMediaTime() * 1000
      setLabelPlacementLayersFadeOnly(
        false,
        for: state,
        instanceId: instanceId,
        reason: reason
      )
      state.labelPlacementLayersFadeOnly = false
      recordNativeApply(
        section: "presentation.dismissed_label_placement_layers",
        phase: state.lastPresentationBatchPhase,
        durationMs: CACurrentMediaTime() * 1000 - labelPlacementStartedAt,
        operationCount: labelPlacementLayerIds.count
      )
    }
    if state.dotPlacementLayersFadeOnly {
      let dotPlacementStartedAt = CACurrentMediaTime() * 1000
      setDotPlacementLayersFadeOnly(
        false,
        for: state,
        instanceId: instanceId,
        reason: reason
      )
      state.dotPlacementLayersFadeOnly = false
      recordNativeApply(
        section: "presentation.dismissed_dot_placement_layers",
        phase: state.lastPresentationBatchPhase,
        durationMs: CACurrentMediaTime() * 1000 - dotPlacementStartedAt,
        operationCount: dotPlacementLayerIds.count
      )
    }
    let sourceClearStartedAt = CACurrentMediaTime() * 1000
    do {
      try clearResidentSources(for: state)
    } catch {
      emit([
        "type": "error",
        "instanceId": instanceId,
        "message": "dismiss_clear_sources_failed: \(error.localizedDescription)",
      ])
    }
    recordNativeApply(
      section: "presentation.dismissed_clear_sources",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - sourceClearStartedAt,
      operationCount: 7
    )
    state.pendingSourceCommitDataIdsBySourceId = [:]
    state.blockedEnterStartCommitFenceBySourceId.removeAll(keepingCapacity: true)
    state.blockedPresentationCommitFenceBySourceId.removeAll(keepingCapacity: true)
    state.derivedFamilyStates = Self.makeInitialDerivedFamilyStates(
      pinSourceId: state.pinSourceId,
      pinInteractionSourceId: state.pinInteractionSourceId,
      dotSourceId: state.dotSourceId,
      dotInteractionSourceId: state.dotInteractionSourceId,
      labelSourceId: state.labelSourceId,
      labelInteractionSourceId: state.labelInteractionSourceId,
      labelCollisionSourceId: state.labelCollisionSourceId
    )
    state.currentPresentationRenderPhase = "idle"
    state.visualSourceLifecycleState = .dismissed
    state.keepSourcesHiddenUntilEnter = true
    state.currentPresentationOpacityTarget = 0
    state.currentPresentationOpacityValue = 0
    cancelLivePinTransitionAnimation(instanceId: instanceId)
    emit([
      "type": "presentation_visual_sources_collision_released",
      "instanceId": instanceId,
      "requestKey": requestKey as Any,
      "frameGenerationId": state.activeFrameGenerationId as Any,
      "pinCount": state.lastPinCount,
      "dotCount": state.lastDotCount,
      "labelCount": state.lastLabelCount,
      "releasedAtMs": Self.nowMs(),
    ])
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "visual_sources_dismissed reason=\(reason) frame=\(state.activeFrameGenerationId ?? "nil") pins=\(state.lastPinCount) dots=\(state.lastDotCount) labels=\(state.lastLabelCount)"
    )
  }

  private func freezeVisibleDismissLabelSourceForFade(
    instanceId: String,
    state: InstanceState,
    reason: String
  ) -> Int {
    let labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    let visibleFeatureIds = Self.visibleDismissLabelFeatureIds(labelFamilyState)
    guard !visibleFeatureIds.isEmpty else {
      emitVisualDiag(
        instanceId: instanceId,
        message: "dismiss_label_freeze_skipped reason=\(reason) visibleLabelCount=0"
      )
      return 0
    }

    var frozenFeatures: [Feature] = []
    var seenMarkerKeys = Set<String>()
    for featureId in visibleFeatureIds {
      guard let feature = labelFamilyState.collection.featureById[featureId] else {
        continue
      }
      let markerKey = labelFamilyState.collection.markerKeyByFeatureId[featureId] ?? featureId
      guard seenMarkerKeys.insert(markerKey).inserted else {
        continue
      }
      frozenFeatures.append(feature)
    }

    guard !frozenFeatures.isEmpty else {
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "dismiss_label_freeze_skipped reason=\(reason) visibleLabelCount=\(visibleFeatureIds.count) frozenLabelCount=0"
      )
      return 0
    }

    let startedAt = CACurrentMediaTime() * 1000
    do {
      try withMapboxMap(for: state.mapTag) { mapboxMap in
        mapboxMap.updateGeoJSONSource(
          withId: state.labelSourceId,
          geoJSON: .featureCollection(FeatureCollection(features: frozenFeatures))
        )
        let emptyCollection = FeatureCollection(features: [])
        for sourceId in [state.labelInteractionSourceId, state.labelCollisionSourceId] {
          mapboxMap.updateGeoJSONSource(
            withId: sourceId,
            geoJSON: .featureCollection(emptyCollection)
          )
        }
      }
      recordNativeApply(
        section: "presentation.dismiss_start_freeze_visible_labels",
        phase: state.lastPresentationBatchPhase,
        durationMs: CACurrentMediaTime() * 1000 - startedAt,
        operationCount: frozenFeatures.count
      )
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "dismiss_label_freeze_applied reason=\(reason) visibleLabelCount=\(visibleFeatureIds.count) frozenLabelCount=\(frozenFeatures.count)"
      )
      return frozenFeatures.count
    } catch {
      emit([
        "type": "error",
        "instanceId": instanceId,
        "message": "dismiss_label_freeze_failed reason=\(reason) error=\(error.localizedDescription)",
      ])
      return 0
    }
  }

  private static func visibleDismissLabelFeatureIds(
    _ labelFamilyState: DerivedFamilyState
  ) -> [String] {
    let lastVisibleFeatureIds = labelFamilyState.labelObservation.lastVisibleLabelFeatureIds
    if !lastVisibleFeatureIds.isEmpty {
      return lastVisibleFeatureIds.filter { labelFamilyState.collection.featureById[$0] != nil }
    }
    let settledVisibleFeatureIds = labelFamilyState.settledVisibleFeatureIds
    guard !settledVisibleFeatureIds.isEmpty else {
      return []
    }
    return labelFamilyState.collection.idsInOrder.filter { settledVisibleFeatureIds.contains($0) }
  }

  private func setLabelPlacementLayersFadeOnly(
    _ isFadeOnly: Bool,
    for state: InstanceState,
    instanceId: String,
    reason: String
  ) {
    do {
      try withMapboxMap(for: state.mapTag) { mapboxMap in
        for layerId in labelPlacementLayerIds {
          for property in [
            "icon-allow-overlap",
            "icon-ignore-placement",
            "text-allow-overlap",
            "text-ignore-placement",
          ] {
            do {
              try mapboxMap.setLayerProperty(
                for: layerId,
                property: property,
                value: isFadeOnly
              )
            } catch {
              emit([
                "type": "error",
                "instanceId": instanceId,
                "message":
                  "label_placement_layer_fade_only_failed reason=\(reason) layer=\(layerId) property=\(property) fadeOnly=\(isFadeOnly) error=\(error.localizedDescription)",
              ])
            }
          }
        }
      }
    } catch {
      emit([
        "type": "error",
        "instanceId": instanceId,
        "message":
          "label_placement_layer_fade_only_map_unavailable reason=\(reason) fadeOnly=\(isFadeOnly) error=\(error.localizedDescription)",
      ])
    }
  }

  private func setDotPlacementLayersFadeOnly(
    _ isFadeOnly: Bool,
    for state: InstanceState,
    instanceId: String,
    reason: String
  ) {
    do {
      try withMapboxMap(for: state.mapTag) { mapboxMap in
        for layerId in dotPlacementLayerIds {
          for property in [
            "text-allow-overlap",
            "text-ignore-placement",
          ] {
            do {
              try mapboxMap.setLayerProperty(
                for: layerId,
                property: property,
                value: isFadeOnly
              )
            } catch {
              emit([
                "type": "error",
                "instanceId": instanceId,
                "message":
                  "dot_placement_layer_fade_only_failed reason=\(reason) layer=\(layerId) property=\(property) fadeOnly=\(isFadeOnly) error=\(error.localizedDescription)",
              ])
            }
          }
        }
      }
    } catch {
      emit([
        "type": "error",
        "instanceId": instanceId,
        "message":
          "dot_placement_layer_fade_only_map_unavailable reason=\(reason) fadeOnly=\(isFadeOnly) error=\(error.localizedDescription)",
      ])
    }
  }

  private func setLabelCollisionObstacleLayersVisible(
    _ isVisible: Bool,
    for state: InstanceState,
    instanceId: String,
    reason: String
  ) {
    do {
      try withMapboxMap(for: state.mapTag) { mapboxMap in
        for layerId in labelCollisionObstacleLayerIds {
          do {
            try mapboxMap.setLayerProperty(
              for: layerId,
              property: "visibility",
              value: isVisible ? "visible" : "none"
            )
          } catch {
            emit([
              "type": "error",
              "instanceId": instanceId,
              "message":
                "label_collision_obstacle_layer_visibility_failed reason=\(reason) layer=\(layerId) visible=\(isVisible) error=\(error.localizedDescription)",
            ])
          }
        }
      }
    } catch {
      emit([
        "type": "error",
        "instanceId": instanceId,
        "message":
          "label_collision_obstacle_layer_visibility_failed reason=\(reason) visible=\(isVisible) error=\(error.localizedDescription)",
      ])
    }
  }

  private func scheduleDeferredDismissSourceCleanup(
    instanceId: String,
    requestKey: String,
    reason: String
  ) {
    deferredDismissSourceCleanupWorkItems[instanceId]?.cancel()
    let workItem = DispatchWorkItem { [weak self] in
      guard let self else { return }
      self.deferredDismissSourceCleanupWorkItems[instanceId] = nil
      self.runDeferredDismissSourceCleanup(
        instanceId: instanceId,
        requestKey: requestKey,
        reason: reason
      )
    }
    deferredDismissSourceCleanupWorkItems[instanceId] = workItem
    DispatchQueue.main.asyncAfter(
      deadline: .now() + .milliseconds(deferredDismissSourceCleanupDelayMs),
      execute: workItem
    )
  }

  private func runDeferredDismissSourceCleanup(
    instanceId: String,
    requestKey: String,
    reason: String
  ) {
    guard var state = instances[instanceId] else {
      return
    }
    if let activeDismissRequestKey = state.lastDismissRequestKey,
       activeDismissRequestKey != requestKey {
      return
    }
    guard state.visualSourceLifecycleState == .dismissed,
          state.currentPresentationRenderPhase == "idle",
          state.keepSourcesHiddenUntilEnter,
          state.currentPresentationOpacityTarget <= 0.001,
          state.currentPresentationOpacityValue <= 0.001
    else {
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "deferred_dismiss_source_cleanup_skipped reason=\(reason) request=\(requestKey) phase=\(state.currentPresentationRenderPhase) lifecycle=\(state.visualSourceLifecycleState)"
      )
      return
    }
    let residentSourceCache = Self.currentDesiredSourceCache(state: state)
    if !residentSourceCache.isEmpty {
      state.residentDesiredSourceCacheBySourceId = residentSourceCache
    }
    let cleanupStartedAt = CACurrentMediaTime() * 1000
    do {
      try clearResidentSources(for: state)
    } catch {
      emit([
        "type": "error",
        "instanceId": instanceId,
        "message": "deferred_dismiss_source_cleanup_failed: \(error.localizedDescription)",
      ])
      return
    }
    state.pendingSourceCommitDataIdsBySourceId = [:]
    state.blockedEnterStartCommitFenceBySourceId.removeAll(keepingCapacity: true)
    state.blockedPresentationCommitFenceBySourceId.removeAll(keepingCapacity: true)
    state.derivedFamilyStates = Self.makeInitialDerivedFamilyStates(
      pinSourceId: state.pinSourceId,
      pinInteractionSourceId: state.pinInteractionSourceId,
      dotSourceId: state.dotSourceId,
      dotInteractionSourceId: state.dotInteractionSourceId,
      labelSourceId: state.labelSourceId,
      labelInteractionSourceId: state.labelInteractionSourceId,
      labelCollisionSourceId: state.labelCollisionSourceId
    )
    cancelLivePinTransitionAnimation(instanceId: instanceId)
    instances[instanceId] = state
    recordNativeApply(
      section: "presentation.deferred_dismiss_source_cleanup",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - cleanupStartedAt,
      operationCount: 7
    )
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "deferred_dismiss_source_cleanup_completed reason=\(reason) request=\(requestKey) frame=\(state.activeFrameGenerationId ?? "nil") cacheSources=\(state.residentDesiredSourceCacheBySourceId.count)"
    )
  }

  private func releaseHiddenVisualSourcesForCollision(
    instanceId: String,
    state: inout InstanceState,
    reason: String
  ) throws {
    guard state.visualSourceLifecycleState == .dismissing else {
      return
    }
    guard state.currentPresentationOpacityTarget <= 0.001 &&
      state.currentPresentationOpacityValue <= 0.001
    else {
      return
    }
    if Self.isSourceRecoveryActive(state) {
      instances[instanceId] = state
      return
    }
    completeDismissVisualLifecycle(
      instanceId: instanceId,
      state: &state,
      requestKey: state.lastDismissRequestKey,
      reason: reason
    )
    instances[instanceId] = state
  }

  private static func currentDesiredSourceCache(
    state: InstanceState
  ) -> [String: ParsedFeatureCollection] {
    var cache: [String: ParsedFeatureCollection] = [:]
    for sourceId in [
      state.pinSourceId,
      state.pinInteractionSourceId,
      state.dotSourceId,
      state.dotInteractionSourceId,
      state.labelSourceId,
      state.labelCollisionSourceId,
    ] {
      let desiredCollection = derivedFamilyState(sourceId: sourceId, state: state).desiredCollection
      if !desiredCollection.idsInOrder.isEmpty {
        cache[sourceId] = desiredCollection
      }
    }
    return cache
  }

  private static func restoreResidentDesiredSourceCacheForEnter(
    state: inout InstanceState
  ) -> Bool {
    guard !state.residentDesiredSourceCacheBySourceId.isEmpty else {
      return false
    }
    let activeDesiredCount =
      derivedFamilyState(sourceId: state.pinSourceId, state: state).desiredCollection.idsInOrder.count +
      derivedFamilyState(sourceId: state.dotSourceId, state: state).desiredCollection.idsInOrder.count +
      derivedFamilyState(sourceId: state.labelSourceId, state: state).desiredCollection.idsInOrder.count
    guard activeDesiredCount == 0 else {
      return false
    }
    for sourceId in [
      state.pinSourceId,
      state.pinInteractionSourceId,
      state.dotSourceId,
      state.dotInteractionSourceId,
      state.labelSourceId,
      state.labelInteractionSourceId,
      state.labelCollisionSourceId,
    ] {
      guard let cachedDesiredCollection = state.residentDesiredSourceCacheBySourceId[sourceId] else {
        continue
      }
      var familyState = emptyDerivedFamilyState()
      familyState.desiredCollection = cachedDesiredCollection
      setDerivedFamilyState(familyState, sourceId: sourceId, state: &state)
    }
    state.pendingSourceCommitDataIdsBySourceId.removeAll(keepingCapacity: true)
    state.blockedEnterStartCommitFenceBySourceId.removeAll(keepingCapacity: true)
    state.blockedPresentationCommitFenceBySourceId.removeAll(keepingCapacity: true)
    return true
  }

  private static func activeDesiredVisualSourceCount(state: InstanceState) -> Int {
    derivedFamilyState(sourceId: state.pinSourceId, state: state).desiredCollection.idsInOrder.count +
      derivedFamilyState(sourceId: state.dotSourceId, state: state).desiredCollection.idsInOrder.count +
      derivedFamilyState(sourceId: state.labelSourceId, state: state).desiredCollection.idsInOrder.count
  }

  private static func isActiveFrameSourceReady(state: InstanceState) -> Bool {
    guard let activeFrameGenerationId = state.activeFrameGenerationId,
      let activeExecutionBatchId = state.activeExecutionBatchId
    else {
      return false
    }
    return state.sourceReadyFrameGenerationId == activeFrameGenerationId &&
      state.sourceReadyExecutionBatchId == activeExecutionBatchId
  }

  private static func isActiveFrameLabelPlacementReady(state: InstanceState) -> Bool {
    let labelFamilyState = derivedFamilyState(sourceId: state.labelSourceId, state: state)
    let labelCount = max(
      state.lastLabelCount,
      labelFamilyState.desiredCollection.idsInOrder.count,
      labelFamilyState.collection.idsInOrder.count
    )
    guard labelCount > 0 else {
      return true
    }
    let observation = labelFamilyState.labelObservation
    return observation.observationEnabled &&
      observation.hasCommittedObservationForConfiguredRequest &&
      observation.lastEffectiveRenderedFeatureCount > 0
  }

  private static func labelPlacementReadinessSummary(state: InstanceState) -> String {
    let labelFamilyState = derivedFamilyState(sourceId: state.labelSourceId, state: state)
    let observation = labelFamilyState.labelObservation
    let labelCount = max(
      state.lastLabelCount,
      labelFamilyState.desiredCollection.idsInOrder.count,
      labelFamilyState.collection.idsInOrder.count
    )
    return [
      "labels=\(labelCount)",
      "observationEnabled=\(observation.observationEnabled)",
      "hasCommittedObservation=\(observation.hasCommittedObservationForConfiguredRequest)",
      "configuredResetRequest=\(observation.configuredResetRequestKey ?? "nil")",
      "visibleLabels=\(observation.lastVisibleLabelFeatureIds.count)",
      "settledVisibleLabels=\(labelFamilyState.settledVisibleFeatureIds.count)",
      "layerRendered=\(observation.lastLayerRenderedFeatureCount)",
      "effectiveRendered=\(observation.lastEffectiveRenderedFeatureCount)",
    ].joined(separator: " ")
  }

  private func labelObservationQueryProbeSummary(
    stage: String,
    state: InstanceState,
    resolvedLayerIds: [String],
    queryRect: CGRect,
    renderedFeatureCount: Int? = nil
  ) -> String {
    let labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    let mountedLabelCount =
      Self.mountedSourceState(sourceId: state.labelSourceId, state: state)?.diffKeyById.count ?? 0
    let renderedSummary = renderedFeatureCount.map { " rendered=\($0)" } ?? ""
    let layerSample = resolvedLayerIds.prefix(8).joined(separator: ",")
    return [
      "stage=\(stage)",
      "phase=\(state.lastPresentationBatchPhase)",
      "renderPhase=\(state.currentPresentationRenderPhase)",
      "lifecycle=\(state.visualSourceLifecycleState)",
      "frame=\(state.activeFrameGenerationId ?? "nil")",
      "sourceReadyFrame=\(state.sourceReadyFrameGenerationId ?? "nil")",
      "executionBatch=\(state.activeExecutionBatchId ?? "nil")",
      "opacityTarget=\(Self.round3(state.currentPresentationOpacityTarget))",
      "opacityValue=\(Self.round3(state.currentPresentationOpacityValue))",
      "sourceExistsDesired=\(labelFamilyState.desiredCollection.idsInOrder.count)",
      "sourceExistsCollection=\(labelFamilyState.collection.idsInOrder.count)",
      "sourceStateFeatures=\(labelFamilyState.sourceState.featureIds.count)",
      "mountedFeatures=\(mountedLabelCount)",
      "layers=\(resolvedLayerIds.count)",
      "layerSample=\(layerSample.isEmpty ? "none" : layerSample)",
      "queryRect=\(Self.rectSummary(queryRect))\(renderedSummary)",
      Self.labelPlacementReadinessSummary(state: state),
    ].joined(separator: " ")
  }

  private func shouldEmitLabelObservationQueryProbe(state: InstanceState) -> Bool {
    state.lastEnterRequestKey != nil &&
      state.visualSourceLifecycleState != .dismissing &&
      state.visualSourceLifecycleState != .dismissed &&
      !Self.isActiveFrameLabelPlacementReady(state: state)
  }

  private func updateLivePinTransitions(
    state: inout InstanceState,
    previousPinSnapshot: DesiredPinSnapshotState,
    desiredPinSnapshot: DesiredPinSnapshotState,
    desiredPayloads: DesiredMarkerFamilyPayloads,
    nowMs: Double,
    allowNewTransitions: Bool
  ) {
    var pinFamilyState = Self.derivedFamilyState(sourceId: state.pinSourceId, state: state)
    let previousSnapshot = previousPinSnapshot
    let previousPinIds = Set(previousSnapshot.pinIdsInOrder)
    let nextPinIds = Set(desiredPinSnapshot.pinIdsInOrder)
    var nextTransitions = pinFamilyState.livePinTransitionsByMarkerKey
    var nextMarkerRenderStateByMarkerKey = pinFamilyState.markerRenderStateByMarkerKey
    let previousOrderByMarkerKey = Dictionary(
      uniqueKeysWithValues: previousSnapshot.pinIdsInOrder.enumerated().map { ($1, $0) }
    )
    let markerKeys = previousPinIds
      .union(nextPinIds)
      .union(nextTransitions.keys)
      .union(nextMarkerRenderStateByMarkerKey.keys)

    for markerKey in markerKeys {
      let existing = nextTransitions[markerKey]
      let existingRenderState = nextMarkerRenderStateByMarkerKey[markerKey]
      let previousPresent = previousPinIds.contains(markerKey)
      let nextPresent = nextPinIds.contains(markerKey)
      let currentOpacity =
        existing.map { Self.livePinTransitionOpacity($0, atMs: nowMs) } ??
        (previousPresent ? 1 : 0)
      let targetOpacity = nextPresent ? 1.0 : 0.0

      let pinFeature =
        desiredPayloads.pinFeatureByMarkerKey[markerKey] ??
        existingRenderState?.pinFeature
      let payloadPinInteraction =
        desiredPayloads.pinInteractionFeatureByMarkerKey[markerKey] ??
        existingRenderState?.pinInteractionFeature
      let payloadLabelFeatures =
        desiredPayloads.labelFeaturesByMarkerKey[markerKey] ??
        existingRenderState?.labelFeatures ??
        []
      let payloadLabelCollision =
        desiredPayloads.labelCollisionFeatureByMarkerKey[markerKey] ??
        existingRenderState?.labelCollisionFeature
      let lodZ =
        desiredPinSnapshot.pinLodZByMarkerKey[markerKey] ??
        existingRenderState?.lodZ ??
        existing?.lodZ ??
        0
      let orderHint =
        previousOrderByMarkerKey[markerKey] ??
        desiredPinSnapshot.pinIdsInOrder.firstIndex(of: markerKey) ??
        existingRenderState?.orderHint ??
        existing?.orderHint ??
        .max
      let shouldRenderMarker =
        pinFeature != nil &&
        (
          nextPresent ||
          currentOpacity > 0.001
        )

      if shouldRenderMarker, let pinFeature {
        nextMarkerRenderStateByMarkerKey[markerKey] = MarkerFamilyRenderState(
          pinFeature: pinFeature,
          pinInteractionFeature: payloadPinInteraction,
          labelFeatures: payloadLabelFeatures,
          labelCollisionFeature: payloadLabelCollision,
          lodZ: lodZ,
          orderHint: orderHint,
          isDesiredPresent: nextPresent,
          currentOpacity: currentOpacity,
          targetOpacity: targetOpacity
        )
      } else {
        nextMarkerRenderStateByMarkerKey.removeValue(forKey: markerKey)
      }

      guard shouldRenderMarker else {
        nextTransitions.removeValue(forKey: markerKey)
        continue
      }

      guard allowNewTransitions || existing != nil else {
        continue
      }

      if let existing {
        if abs(currentOpacity - targetOpacity) < 0.001 {
          if (targetOpacity == 1 && nextPresent) || (targetOpacity == 0 && !nextPresent) {
            nextTransitions.removeValue(forKey: markerKey)
          }
          continue
        }
        if existing.targetOpacity != targetOpacity {
          let shouldAwaitSourceCommit =
            targetOpacity == 1 && !previousPresent && currentOpacity <= 0.001
          nextTransitions[markerKey] = LivePinTransition(
            startOpacity: currentOpacity,
            targetOpacity: targetOpacity,
            startedAtMs: nowMs,
            durationMs: livePinTransitionDurationMs,
            isAwaitingSourceCommit: shouldAwaitSourceCommit,
            awaitingSourceDataId: shouldAwaitSourceCommit ? existing.awaitingSourceDataId : nil,
            lodZ: lodZ,
            orderHint: orderHint
          )
          continue
        }
        var updated = existing
        updated.lodZ = lodZ
        updated.orderHint = orderHint
        nextTransitions[markerKey] = updated
        continue
      }

      guard previousPresent != nextPresent, abs(currentOpacity - targetOpacity) >= 0.001 else {
        continue
      }
      nextTransitions[markerKey] = LivePinTransition(
        startOpacity: currentOpacity,
        targetOpacity: targetOpacity,
        startedAtMs: nowMs,
        durationMs: livePinTransitionDurationMs,
        isAwaitingSourceCommit: targetOpacity == 1,
        awaitingSourceDataId: nil,
        lodZ: lodZ,
        orderHint: orderHint
      )
    }

    pinFamilyState.markerRenderStateByMarkerKey = nextMarkerRenderStateByMarkerKey
    pinFamilyState.livePinTransitionsByMarkerKey = nextTransitions
    Self.setDerivedFamilyState(pinFamilyState, sourceId: state.pinSourceId, state: &state)
  }

  private func updateLiveDotTransitions(
    state: inout InstanceState,
    desiredDots: ParsedFeatureCollection,
    nowMs: Double,
    allowNewTransitions: Bool
  ) {
    var dotFamilyState = Self.derivedFamilyState(sourceId: state.dotSourceId, state: state)
    let previousDotsByMarkerKey = dotFamilyState.lastDesiredCollection.featureById
    let nextDotsByMarkerKey = desiredDots.featureById
    let previousDotIds = Set(previousDotsByMarkerKey.keys)
    let nextDotIds = Set(nextDotsByMarkerKey.keys)
    var nextTransitions = dotFamilyState.liveDotTransitionsByMarkerKey
    let previousOrderByMarkerKey = Dictionary(
      uniqueKeysWithValues: dotFamilyState.lastDesiredCollection.idsInOrder.enumerated().map { ($1, $0) }
    )
    let nextOrderByMarkerKey = Dictionary(
      uniqueKeysWithValues: desiredDots.idsInOrder.enumerated().map { ($1, $0) }
    )
    let markerKeys = previousDotIds.union(nextDotIds).union(nextTransitions.keys)

    for markerKey in markerKeys {
      let existing = nextTransitions[markerKey]
      let previousPresent = previousDotIds.contains(markerKey)
      let nextPresent = nextDotIds.contains(markerKey)
      let currentOpacity =
        existing.map { Self.liveDotTransitionOpacity($0, atMs: nowMs) } ??
        (previousPresent ? 1 : 0)
      let targetOpacity = nextPresent ? 1.0 : 0.0
      let dotFeature =
        nextDotsByMarkerKey[markerKey] ??
        previousDotsByMarkerKey[markerKey] ??
        existing?.dotFeature
      guard let dotFeature else {
        nextTransitions.removeValue(forKey: markerKey)
        continue
      }
      let orderHint =
        previousOrderByMarkerKey[markerKey] ??
        nextOrderByMarkerKey[markerKey] ??
        existing?.orderHint ??
        .max

      guard allowNewTransitions || existing != nil else {
        continue
      }

      if let existing {
        if abs(currentOpacity - targetOpacity) < 0.001 {
          if (targetOpacity == 1 && nextPresent) || (targetOpacity == 0 && !nextPresent) {
            nextTransitions.removeValue(forKey: markerKey)
          }
          continue
        }
        if existing.targetOpacity != targetOpacity {
          let shouldAwaitSourceCommit =
            targetOpacity == 1 && !previousPresent && currentOpacity <= 0.001
          nextTransitions[markerKey] = LiveDotTransition(
            startOpacity: currentOpacity,
            targetOpacity: targetOpacity,
            startedAtMs: nowMs,
            durationMs: livePinTransitionDurationMs,
            isAwaitingSourceCommit: shouldAwaitSourceCommit,
            awaitingSourceDataId: shouldAwaitSourceCommit ? existing.awaitingSourceDataId : nil,
            dotFeature: dotFeature,
            orderHint: orderHint
          )
          continue
        }
        var updated = existing
        updated.dotFeature = dotFeature
        updated.orderHint = orderHint
        nextTransitions[markerKey] = updated
        continue
      }

      guard previousPresent != nextPresent, abs(currentOpacity - targetOpacity) >= 0.001 else {
        continue
      }
      nextTransitions[markerKey] = LiveDotTransition(
        startOpacity: currentOpacity,
        targetOpacity: targetOpacity,
        startedAtMs: nowMs,
        durationMs: livePinTransitionDurationMs,
        isAwaitingSourceCommit: targetOpacity == 1,
        awaitingSourceDataId: nil,
        dotFeature: dotFeature,
        orderHint: orderHint
      )
    }

    dotFamilyState.liveDotTransitionsByMarkerKey = nextTransitions
    Self.setDerivedFamilyState(dotFamilyState, sourceId: state.dotSourceId, state: &state)
  }

  private static func groupFeaturesByMarkerKey(
    _ collection: ParsedFeatureCollection
  ) -> [String: [(id: String, feature: Feature)]] {
    var grouped: [String: [(id: String, feature: Feature)]] = [:]
    for featureId in collection.idsInOrder {
      guard let feature = collection.featureById[featureId] else {
        continue
      }
      let markerKey = collection.markerKeyByFeatureId[featureId] ?? featureId
      grouped[markerKey, default: []].append((id: featureId, feature: feature))
    }
    return grouped
  }

  private static func makeParsedFeatureCollection(
    features: [(id: String, feature: Feature)],
    featureStateById: [String: [String: Any]] = [:],
    markerKeyByFeatureId: [String: String]? = nil
  ) -> ParsedFeatureCollection {
    let featureById = Dictionary(uniqueKeysWithValues: features.map { ($0.id, $0.feature) })
    return makeParsedFeatureCollection(
      idsInOrder: features.map(\.id),
      featureById: featureById,
      featureStateById: featureStateById,
      markerKeyByFeatureId: markerKeyByFeatureId
    )
  }

  private static func makeParsedFeatureCollection(
    idsInOrder sourceIdsInOrder: [String],
    featureById: [String: Feature],
    featureStateById: [String: [String: Any]] = [:],
    markerKeyByFeatureId: [String: String]? = nil
  ) -> ParsedFeatureCollection {
    var idsInOrder: [String] = []
    var nextFeatureById: [String: Feature] = [:]
    var diffKeyById: [String: String] = [:]
    var nextFeatureStateById: [String: [String: Any]] = [:]
    var nextMarkerKeyByFeatureId: [String: String] = [:]
    for id in sourceIdsInOrder {
      guard let feature = featureById[id] else {
        continue
      }
      idsInOrder.append(id)
      nextFeatureById[id] = feature
      if let diffKey = Self.makeFeatureDiffKey(feature: feature) {
        diffKeyById[id] = diffKey
      }
      if let featureState = featureStateById[id] {
        nextFeatureStateById[id] = featureState
      }
      nextMarkerKeyByFeatureId[id] = markerKeyByFeatureId?[id] ?? id
    }
    let sourceRevision = buildParsedCollectionRevision(
      idsInOrder: idsInOrder,
      diffKeyById: diffKeyById
    )
    let featureStateEntryRevisionById = makeFeatureStateEntryRevisionById(
      featureStateById: nextFeatureStateById
    )
    let featureStateRevision = buildFeatureStateRevision(
      featureStateEntryRevisionById: featureStateEntryRevisionById
    )
    let featureIds = Set(idsInOrder)
    let (groupedFeatureIdsByGroup, groupOrder) = buildGroupedFeatureIdsByGroup(
      idsInOrder: idsInOrder,
      markerKeyByFeatureId: nextMarkerKeyByFeatureId
    )
    return ParsedFeatureCollection(
      baseSourceRevision: "",
      baseFeatureStateRevision: "",
      sourceRevision: sourceRevision,
      featureStateRevision: featureStateRevision,
      dirtyGroupIds: Set(groupOrder),
      orderChangedGroupIds: Set(groupOrder),
      removedGroupIds: [],
      featureStateEntryRevisionById: featureStateEntryRevisionById,
      featureStateChangedIds: Set(featureStateEntryRevisionById.keys),
      featureIds: featureIds,
      addedFeatureIdsInOrder: idsInOrder,
      updatedFeatureIdsInOrder: [],
      removedFeatureIds: [],
      removedFeatureIdsInOrder: [],
      idsInOrder: idsInOrder,
      groupedFeatureIdsByGroup: groupedFeatureIdsByGroup,
      groupOrder: groupOrder,
      featureById: nextFeatureById,
      diffKeyById: diffKeyById,
      featureStateById: nextFeatureStateById,
      markerKeyByFeatureId: nextMarkerKeyByFeatureId,
      addedFeatures: Self.mutationFeatures(idsInOrder: idsInOrder, featureById: nextFeatureById),
      updatedFeatures: []
    )
  }

  private static func parsedCollectionBase(
    from sourceState: SourceState
  ) -> ParsedFeatureCollection {
    let (groupedFeatureIdsByGroup, groupOrder) = buildGroupedFeatureIdsByGroup(
      idsInOrder: sourceState.idsInOrder,
      markerKeyByFeatureId: sourceState.markerKeyByFeatureId
    )
    return ParsedFeatureCollection(
      baseSourceRevision: sourceState.sourceRevision,
      baseFeatureStateRevision: sourceState.featureStateRevision,
      sourceRevision: sourceState.sourceRevision,
      featureStateRevision: sourceState.featureStateRevision,
      dirtyGroupIds: [],
      orderChangedGroupIds: [],
      removedGroupIds: [],
      featureStateEntryRevisionById: sourceState.featureStateEntryRevisionById,
      featureStateChangedIds: [],
      featureIds: sourceState.featureIds,
      addedFeatureIdsInOrder: [],
      updatedFeatureIdsInOrder: [],
      removedFeatureIds: [],
      removedFeatureIdsInOrder: [],
      idsInOrder: sourceState.idsInOrder,
      groupedFeatureIdsByGroup: groupedFeatureIdsByGroup,
      groupOrder: groupOrder,
      featureById: [:],
      diffKeyById: sourceState.diffKeyById,
      featureStateById: sourceState.featureStateById,
      markerKeyByFeatureId: sourceState.markerKeyByFeatureId,
      addedFeatures: [],
      updatedFeatures: []
    )
  }

  private static func replaceParsedFeatureCollection(
    _ collection: inout ParsedFeatureCollection,
    baseSourceState: SourceState?,
    idsInOrder sourceIdsInOrder: [String],
    featureById: [String: Feature],
    featureStateById: [String: [String: Any]] = [:],
    markerKeyByFeatureId: [String: String]? = nil,
    dirtyGroupIds explicitDirtyGroupIds: Set<String>,
    orderChangedGroupIds explicitOrderChangedGroupIds: Set<String>,
    removedGroupIds explicitRemovedGroupIds: Set<String>,
    recordAttribution: ((_ section: String, _ durationMs: Double, _ operationCount: Int) -> Void)? = nil
  ) throws {
    let baseStartedAt = recordAttribution == nil ? 0 : CACurrentMediaTime() * 1000
    let baseCollection = baseSourceState.map(Self.parsedCollectionBase) ?? collection
    if let recordAttribution {
      recordAttribution("replace.base_collection", CACurrentMediaTime() * 1000 - baseStartedAt, baseSourceState == nil ? 0 : baseCollection.idsInOrder.count)
    }
    var idsInOrder: [String] = []
    var nextFeatureById: [String: Feature] = [:]
    var diffKeyById: [String: String] = [:]
    var nextFeatureStateById: [String: [String: Any]] = [:]
    var nextMarkerKeyByFeatureId: [String: String] = [:]
    let previousFeatureById = collection.featureById
    let uniqueStartedAt = recordAttribution == nil ? 0 : CACurrentMediaTime() * 1000
    let dedupedSourceIdsInOrder = try Self.requireUniqueOrderedFeatureIds(
      sourceIdsInOrder,
      context: "replaceParsedFeatureCollection"
    )
    if let recordAttribution {
      recordAttribution("replace.unique_ids", CACurrentMediaTime() * 1000 - uniqueStartedAt, dedupedSourceIdsInOrder.count)
    }
    var matchesBaseSourceShape = baseCollection.idsInOrder.count == dedupedSourceIdsInOrder.count
    var diffKeyDurationMs = 0.0
    var reusedDiffKeyCount = 0
    let loopStartedAt = recordAttribution == nil ? 0 : CACurrentMediaTime() * 1000
    for (index, id) in dedupedSourceIdsInOrder.enumerated() {
      guard let feature = featureById[id] else {
        throw NSError(
          domain: "SearchMapRenderController",
          code: 79,
          userInfo: [
            NSLocalizedDescriptionKey: "Missing feature \(id) in replaceParsedFeatureCollection"
          ]
        )
      }
      idsInOrder.append(id)
      nextFeatureById[id] = feature
      if matchesBaseSourceShape && baseCollection.idsInOrder[index] != id {
        matchesBaseSourceShape = false
      }
      let previousFeature = previousFeatureById[id]
      let exactReusedDiffKey =
        previousFeature == feature
          ? collection.diffKeyById[id]
          : nil
      let diffKeyStartedAt = recordAttribution == nil ? 0 : CACurrentMediaTime() * 1000
      if let diffKey = exactReusedDiffKey ?? Self.makeFeatureDiffKey(feature: feature) {
        if recordAttribution != nil {
          diffKeyDurationMs += CACurrentMediaTime() * 1000 - diffKeyStartedAt
          if exactReusedDiffKey != nil {
            reusedDiffKeyCount += 1
          }
        }
        diffKeyById[id] = diffKey
        if matchesBaseSourceShape && baseCollection.diffKeyById[id] != diffKey {
          matchesBaseSourceShape = false
        }
      } else {
        if recordAttribution != nil {
          diffKeyDurationMs += CACurrentMediaTime() * 1000 - diffKeyStartedAt
        }
        matchesBaseSourceShape = false
      }
      if let featureState = featureStateById[id] {
        nextFeatureStateById[id] = featureState
      }
      nextMarkerKeyByFeatureId[id] = markerKeyByFeatureId?[id] ?? id
    }
    if let recordAttribution {
      recordAttribution("replace.loop_total", CACurrentMediaTime() * 1000 - loopStartedAt, dedupedSourceIdsInOrder.count)
      recordAttribution("replace.diff_key", diffKeyDurationMs, dedupedSourceIdsInOrder.count - reusedDiffKeyCount)
      recordAttribution("replace.diff_key_reuse", 0, reusedDiffKeyCount)
    }
    let sourceRevisionStartedAt = recordAttribution == nil ? 0 : CACurrentMediaTime() * 1000
    let sourceRevision =
      matchesBaseSourceShape
        ? baseCollection.sourceRevision
        : buildParsedCollectionRevision(
            idsInOrder: idsInOrder,
            diffKeyById: diffKeyById
          )
    if let recordAttribution {
      recordAttribution("replace.source_revision", CACurrentMediaTime() * 1000 - sourceRevisionStartedAt, idsInOrder.count)
    }
    let featureIdsStartedAt = recordAttribution == nil ? 0 : CACurrentMediaTime() * 1000
    let featureIds = Set(idsInOrder)
    if let recordAttribution {
      recordAttribution("replace.feature_ids", CACurrentMediaTime() * 1000 - featureIdsStartedAt, idsInOrder.count)
    }
    let featureStateEntryStartedAt = recordAttribution == nil ? 0 : CACurrentMediaTime() * 1000
    let featureStateEntryRevisionById = makeFeatureStateEntryRevisionById(
      featureStateById: nextFeatureStateById
    )
    if let recordAttribution {
      recordAttribution("replace.feature_state_entry_revision", CACurrentMediaTime() * 1000 - featureStateEntryStartedAt, nextFeatureStateById.count)
    }
    let featureStateChangedStartedAt = recordAttribution == nil ? 0 : CACurrentMediaTime() * 1000
    let featureStateChangedIds =
      baseCollection.featureStateEntryRevisionById == featureStateEntryRevisionById
        ? Set<String>()
        : Set(
            featureStateEntryRevisionById.compactMap { featureId, revision in
              baseCollection.featureStateEntryRevisionById[featureId] == revision ? nil : featureId
            }
          )
    if let recordAttribution {
      recordAttribution("replace.feature_state_changed_ids", CACurrentMediaTime() * 1000 - featureStateChangedStartedAt, featureStateEntryRevisionById.count)
    }
    let featureStateRevisionStartedAt = recordAttribution == nil ? 0 : CACurrentMediaTime() * 1000
    let featureStateRevision =
      baseCollection.featureStateEntryRevisionById == featureStateEntryRevisionById
        ? baseCollection.featureStateRevision
        : buildFeatureStateRevision(
            featureStateEntryRevisionById: featureStateEntryRevisionById
          )
    if let recordAttribution {
      recordAttribution("replace.feature_state_revision", CACurrentMediaTime() * 1000 - featureStateRevisionStartedAt, featureStateEntryRevisionById.count)
    }
    let diffScansStartedAt = recordAttribution == nil ? 0 : CACurrentMediaTime() * 1000
    let addedFeatureIdsInOrder = idsInOrder.filter { !baseCollection.featureIds.contains($0) }
    let updatedFeatureIdsInOrder = idsInOrder.filter { featureId in
      guard baseCollection.featureIds.contains(featureId) else {
        return false
      }
      return baseCollection.diffKeyById[featureId] != diffKeyById[featureId]
    }
    let removedFeatureIds = baseCollection.featureIds.subtracting(featureIds)
    let removedFeatureIdsInOrder = baseCollection.idsInOrder.filter { removedFeatureIds.contains($0) }
    if let recordAttribution {
      recordAttribution("replace.diff_scans", CACurrentMediaTime() * 1000 - diffScansStartedAt, idsInOrder.count + baseCollection.idsInOrder.count)
    }
    let assignmentStartedAt = recordAttribution == nil ? 0 : CACurrentMediaTime() * 1000
    collection.baseSourceRevision = baseCollection.sourceRevision
    collection.baseFeatureStateRevision = baseCollection.featureStateRevision
    collection.sourceRevision = sourceRevision
    collection.featureStateRevision = featureStateRevision
    collection.dirtyGroupIds = explicitDirtyGroupIds
    collection.orderChangedGroupIds = explicitOrderChangedGroupIds
    collection.removedGroupIds = explicitRemovedGroupIds
    collection.featureStateEntryRevisionById = featureStateEntryRevisionById
    collection.featureStateChangedIds = featureStateChangedIds
    collection.featureIds = featureIds
    collection.addedFeatureIdsInOrder = addedFeatureIdsInOrder
    collection.updatedFeatureIdsInOrder = updatedFeatureIdsInOrder
    collection.removedFeatureIds = removedFeatureIds
    collection.removedFeatureIdsInOrder = removedFeatureIdsInOrder
    collection.idsInOrder = idsInOrder
    collection.featureById = nextFeatureById
    collection.diffKeyById = diffKeyById
    collection.featureStateById = nextFeatureStateById
    collection.markerKeyByFeatureId = nextMarkerKeyByFeatureId
    if let recordAttribution {
      recordAttribution("replace.assignment", CACurrentMediaTime() * 1000 - assignmentStartedAt, idsInOrder.count)
    }
    let mutationFeaturesStartedAt = recordAttribution == nil ? 0 : CACurrentMediaTime() * 1000
    collection.addedFeatures = Self.mutationFeatures(
      idsInOrder: addedFeatureIdsInOrder,
      featureById: nextFeatureById
    )
    collection.updatedFeatures = Self.mutationFeatures(
      idsInOrder: updatedFeatureIdsInOrder,
      featureById: nextFeatureById
    )
    if let recordAttribution {
      recordAttribution("replace.mutation_features", CACurrentMediaTime() * 1000 - mutationFeaturesStartedAt, addedFeatureIdsInOrder.count + updatedFeatureIdsInOrder.count)
    }
  }

  private static func livePinTransitionOpacity(
    _ transition: LivePinTransition,
    atMs nowMs: Double
  ) -> Double {
    if transition.isAwaitingSourceCommit {
      return transition.startOpacity
    }
    let elapsedMs = max(0, nowMs - transition.startedAtMs)
    let progress = transition.durationMs <= 0 ? 1 : min(1, elapsedMs / transition.durationMs)
    let easedProgress = progress * progress * (3 - 2 * progress)
    return transition.startOpacity + (transition.targetOpacity - transition.startOpacity) * easedProgress
  }

  private static func liveDotTransitionOpacity(
    _ transition: LiveDotTransition,
    atMs nowMs: Double
  ) -> Double {
    if transition.isAwaitingSourceCommit {
      return transition.startOpacity
    }
    let elapsedMs = max(0, nowMs - transition.startedAtMs)
    let progress = transition.durationMs <= 0 ? 1 : min(1, elapsedMs / transition.durationMs)
    let easedProgress = progress * progress * (3 - 2 * progress)
    return transition.startOpacity + (transition.targetOpacity - transition.startOpacity) * easedProgress
  }

  private func updateLivePinTransitionAnimation(instanceId: String, state: InstanceState) {
    let canRunVisualTransition =
      state.lastPresentationBatchPhase == "live" ||
      state.lastPresentationBatchPhase == "entering"
    if
      Self.isSourceRecoveryActive(state) ||
      (
        Self.derivedFamilyState(sourceId: state.pinSourceId, state: state).livePinTransitionsByMarkerKey.isEmpty &&
        Self.derivedFamilyState(sourceId: state.dotSourceId, state: state).liveDotTransitionsByMarkerKey.isEmpty
      ) ||
      !canRunVisualTransition
    {
      cancelLivePinTransitionAnimation(instanceId: instanceId)
      return
    }
    guard livePinTransitionAnimators[instanceId] == nil else {
      return
    }
    let displayLink = CADisplayLink(target: self, selector: #selector(handleLivePinTransitionFrame(_:)))
    if #available(iOS 15.0, *) {
      let preferredFps = Float(UIScreen.main.maximumFramesPerSecond)
      displayLink.preferredFrameRateRange = CAFrameRateRange(
        minimum: 60,
        maximum: preferredFps,
        preferred: preferredFps
      )
    } else {
      displayLink.preferredFramesPerSecond = UIScreen.main.maximumFramesPerSecond
    }
    displayLink.add(to: .main, forMode: .common)
    livePinTransitionAnimators[instanceId] = displayLink
  }

  private func cancelLivePinTransitionAnimation(instanceId: String) {
    livePinTransitionAnimators[instanceId]?.invalidate()
    livePinTransitionAnimators.removeValue(forKey: instanceId)
  }

  private func resetLiveMarkerEnterState(
    instanceId: String,
    state: inout InstanceState,
    reason: String
  ) {
    cancelLivePinTransitionAnimation(instanceId: instanceId)

    var pinFamilyState = Self.derivedFamilyState(sourceId: state.pinSourceId, state: state)
    var dotFamilyState = Self.derivedFamilyState(sourceId: state.dotSourceId, state: state)
    var labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    var pinSourceState = pinFamilyState.sourceState
    var dotSourceState = dotFamilyState.sourceState
    var labelSourceState = labelFamilyState.sourceState

    let pinTransitionCount = pinFamilyState.livePinTransitionsByMarkerKey.count
    let dotTransitionCount = dotFamilyState.liveDotTransitionsByMarkerKey.count
    let pinTransientIds = Array(pinFamilyState.transientFeatureStateById.keys)
    let dotTransientIds = Array(dotFamilyState.transientFeatureStateById.keys)
    let labelTransientIds = Array(labelFamilyState.transientFeatureStateById.keys)

    for featureId in pinTransientIds {
      Self.clearTransientFeatureState(
        sourceState: &pinSourceState,
        familyState: &pinFamilyState,
        featureId: featureId
      )
    }
    for featureId in dotTransientIds {
      Self.clearTransientFeatureState(
        sourceState: &dotSourceState,
        familyState: &dotFamilyState,
        featureId: featureId
      )
    }
    for featureId in labelTransientIds {
      Self.clearTransientFeatureState(
        sourceState: &labelSourceState,
        familyState: &labelFamilyState,
        featureId: featureId
      )
    }

    pinFamilyState.livePinTransitionsByMarkerKey.removeAll()
    pinFamilyState.markerRenderStateByMarkerKey.removeAll()
    dotFamilyState.liveDotTransitionsByMarkerKey.removeAll()
    labelFamilyState.labelObservation.hasCommittedObservationForConfiguredRequest = false
    labelFamilyState.labelObservation.lastVisibleLabelFeatureIds = []
    labelFamilyState.labelObservation.lastLayerRenderedFeatureCount = 0
    labelFamilyState.labelObservation.lastEffectiveRenderedFeatureCount = 0

    Self.refreshFeatureStateRevision(&pinSourceState)
    Self.refreshFeatureStateRevision(&dotSourceState)
    Self.refreshFeatureStateRevision(&labelSourceState)
    Self.syncMountedSourceState(
      pinSourceState,
      sourceId: state.pinSourceId,
      familyState: &pinFamilyState,
      state: &state
    )
    Self.syncMountedSourceState(
      dotSourceState,
      sourceId: state.dotSourceId,
      familyState: &dotFamilyState,
      state: &state
    )
    Self.syncMountedSourceState(
      labelSourceState,
      sourceId: state.labelSourceId,
      familyState: &labelFamilyState,
      state: &state
    )

    emitVisualDiag(
      instanceId: instanceId,
      message:
        "live_reveal_state_reset reason=\(reason) pinLodAnimations=\(pinTransitionCount) dotLodAnimations=\(dotTransitionCount) pinFeatureStateOverrides=\(pinTransientIds.count) dotFeatureStateOverrides=\(dotTransientIds.count) labelFeatureStateOverrides=\(labelTransientIds.count)"
    )
  }

  private static func livePinFeatureState(opacity: Double) -> [String: Any] {
    [
      "nativeLodOpacity": opacity,
      "nativeLodRankOpacity": opacity,
    ]
  }

  private static func liveLabelFeatureState(opacity: Double) -> [String: Any] {
    [
      "nativeLabelOpacity": opacity,
    ]
  }

  private static func liveDotFeatureState(opacity: Double) -> [String: Any] {
    [
      "nativeDotOpacity": opacity,
    ]
  }

  private static func shouldStartAwaitingTransition(
    awaitingSourceDataId: String?,
    sourceId: String,
    acknowledgedDataId: String?
  ) -> Bool {
    guard let acknowledgedDataId else {
      return true
    }
    return shouldAcknowledgePendingCommitDataId(
      awaitingSourceDataId,
      sourceId: sourceId,
      acknowledgedDataId: acknowledgedDataId
    )
  }

  private func startAwaitingLivePinTransitions(
    instanceId: String,
    dataId: String?,
    reason: String,
    state: inout InstanceState
  ) {
    let nowMs = Self.nowMs()
    var didStartTransition = false
    var awaitingTransitionCount = 0
    var startedTransitionCount = 0
    var pinFamilyState = Self.derivedFamilyState(sourceId: state.pinSourceId, state: state)
    var labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    var pinSourceState = pinFamilyState.sourceState
    var labelSourceState = labelFamilyState.sourceState
    for markerKey in pinFamilyState.livePinTransitionsByMarkerKey.keys.sorted() {
      if pinFamilyState.livePinTransitionsByMarkerKey[markerKey]?.isAwaitingSourceCommit == true {
        awaitingTransitionCount += 1
      }
      guard var transition = pinFamilyState.livePinTransitionsByMarkerKey[markerKey],
            transition.isAwaitingSourceCommit,
            Self.shouldStartAwaitingTransition(
              awaitingSourceDataId: transition.awaitingSourceDataId,
              sourceId: state.pinSourceId,
              acknowledgedDataId: dataId
            )
      else {
        continue
      }
      transition.isAwaitingSourceCommit = false
      transition.awaitingSourceDataId = nil
      transition.startedAtMs = nowMs
      transition.startOpacity = 0
      pinFamilyState.livePinTransitionsByMarkerKey[markerKey] = transition
      startedTransitionCount += 1
      Self.applyTransientFeatureState(
        sourceState: &pinSourceState,
        familyState: &pinFamilyState,
        featureId: markerKey,
        transientState: Self.livePinFeatureState(opacity: 0)
      )
      for labelFeature in pinFamilyState.markerRenderStateByMarkerKey[markerKey]?.labelFeatures ?? [] {
        Self.applyTransientFeatureState(
          sourceState: &labelSourceState,
          familyState: &labelFamilyState,
          featureId: labelFeature.id,
          transientState: Self.liveLabelFeatureState(opacity: 0)
        )
      }
      didStartTransition = true
    }
    if didStartTransition {
      Self.refreshFeatureStateRevision(&pinSourceState)
      Self.refreshFeatureStateRevision(&labelSourceState)
      Self.syncMountedSourceState(
        pinSourceState,
        sourceId: state.pinSourceId,
        familyState: &pinFamilyState,
        state: &state
      )
      Self.syncMountedSourceState(
        labelSourceState,
        sourceId: state.labelSourceId,
        familyState: &labelFamilyState,
        state: &state
      )
      instances[instanceId] = state
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "live_pin_transition_started reason=\(reason) dataId=\(dataId ?? "mounted_hidden") awaiting=\(awaitingTransitionCount) started=\(startedTransitionCount)"
      )
      updateLivePinTransitionAnimation(instanceId: instanceId, state: state)
    }
  }

  private func startAwaitingLiveDotTransitions(
    instanceId: String,
    dataId: String?,
    reason: String,
    state: inout InstanceState
  ) {
    let nowMs = Self.nowMs()
    var didStartTransition = false
    var awaitingTransitionCount = 0
    var startedTransitionCount = 0
    var dotFamilyState = Self.derivedFamilyState(sourceId: state.dotSourceId, state: state)
    var dotSourceState = dotFamilyState.sourceState
    for markerKey in dotFamilyState.liveDotTransitionsByMarkerKey.keys.sorted() {
      if dotFamilyState.liveDotTransitionsByMarkerKey[markerKey]?.isAwaitingSourceCommit == true {
        awaitingTransitionCount += 1
      }
      guard var transition = dotFamilyState.liveDotTransitionsByMarkerKey[markerKey],
            transition.isAwaitingSourceCommit,
            Self.shouldStartAwaitingTransition(
              awaitingSourceDataId: transition.awaitingSourceDataId,
              sourceId: state.dotSourceId,
              acknowledgedDataId: dataId
            )
      else {
        continue
      }
      transition.isAwaitingSourceCommit = false
      transition.awaitingSourceDataId = nil
      transition.startedAtMs = nowMs
      transition.startOpacity = 0
      dotFamilyState.liveDotTransitionsByMarkerKey[markerKey] = transition
      startedTransitionCount += 1
      Self.applyTransientFeatureState(
        sourceState: &dotSourceState,
        familyState: &dotFamilyState,
        featureId: markerKey,
        transientState: Self.liveDotFeatureState(opacity: 0)
      )
      didStartTransition = true
    }
    if didStartTransition {
      Self.refreshFeatureStateRevision(&dotSourceState)
      Self.syncMountedSourceState(
        dotSourceState,
        sourceId: state.dotSourceId,
        familyState: &dotFamilyState,
        state: &state
      )
      instances[instanceId] = state
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "live_dot_transition_started reason=\(reason) dataId=\(dataId ?? "mounted_hidden") awaiting=\(awaitingTransitionCount) started=\(startedTransitionCount)"
      )
      updateLivePinTransitionAnimation(instanceId: instanceId, state: state)
    }
  }

  private func restartLiveEnterTransitionsForRevealStart(
    instanceId: String,
    state: inout InstanceState
  ) {
    let nowMs = Self.nowMs()
    var restartedPinCount = 0
    var restartedDotCount = 0
    var pinFamilyState = Self.derivedFamilyState(sourceId: state.pinSourceId, state: state)
    var dotFamilyState = Self.derivedFamilyState(sourceId: state.dotSourceId, state: state)

    for markerKey in pinFamilyState.livePinTransitionsByMarkerKey.keys.sorted() {
      guard var transition = pinFamilyState.livePinTransitionsByMarkerKey[markerKey],
            !transition.isAwaitingSourceCommit,
            transition.targetOpacity >= 0.999
      else {
        continue
      }
      transition.startOpacity = 0
      transition.startedAtMs = nowMs
      pinFamilyState.livePinTransitionsByMarkerKey[markerKey] = transition
      restartedPinCount += 1
    }

    for markerKey in dotFamilyState.liveDotTransitionsByMarkerKey.keys.sorted() {
      guard var transition = dotFamilyState.liveDotTransitionsByMarkerKey[markerKey],
            !transition.isAwaitingSourceCommit,
            transition.targetOpacity >= 0.999
      else {
        continue
      }
      transition.startOpacity = 0
      transition.startedAtMs = nowMs
      dotFamilyState.liveDotTransitionsByMarkerKey[markerKey] = transition
      restartedDotCount += 1
    }

    guard restartedPinCount > 0 || restartedDotCount > 0 else {
      return
    }

    Self.setDerivedFamilyState(pinFamilyState, sourceId: state.pinSourceId, state: &state)
    Self.setDerivedFamilyState(dotFamilyState, sourceId: state.dotSourceId, state: &state)
    instances[instanceId] = state
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "live_enter_transition_restarted pinCount=\(restartedPinCount) dotCount=\(restartedDotCount)"
    )
  }

  private func applyLivePinTransitionFeatureStates(for instanceId: String) throws {
    guard var state = instances[instanceId] else {
      return
    }
    guard !Self.isSourceRecoveryActive(state) else {
      instances[instanceId] = state
      cancelLivePinTransitionAnimation(instanceId: instanceId)
      return
    }
    if try withReadyMapboxMap(
      for: state.mapTag,
      instanceId: instanceId,
      state: &state,
      sourceIds: [state.pinSourceId, state.dotSourceId, state.labelSourceId],
      reason: "live_pin_transition_feature_states",
      allowRecoveryEscalation: false,
      { _ in }
    ) == false {
      instances[instanceId] = state
      return
    }
    var pinFamilyState = Self.derivedFamilyState(sourceId: state.pinSourceId, state: state)
    guard !pinFamilyState.sourceState.sourceRevision.isEmpty ||
      !pinFamilyState.sourceState.featureIds.isEmpty ||
      !pinFamilyState.collection.idsInOrder.isEmpty
    else {
      return
    }
    var pinSourceState = pinFamilyState.sourceState
    var dotFamilyState = Self.derivedFamilyState(sourceId: state.dotSourceId, state: state)
    var dotSourceState = dotFamilyState.sourceState
    var labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    var labelSourceState = labelFamilyState.sourceState

    let nowMs = Self.nowMs()
    var completedEnterMarkerKeys: [String] = []
    var completedExitMarkerKeys: [String] = []
    var completedDotEnterMarkerKeys: [String] = []
    var completedDotExitMarkerKeys: [String] = []
    var featureStatesToApply: [(featureId: String, state: [String: Any])] = []
    var dotFeatureStatesToApply: [(featureId: String, state: [String: Any])] = []
    var labelFeatureStatesToApply: [(featureId: String, state: [String: Any])] = []
    var pinSourceFeatureStateChanged = false
    var dotSourceFeatureStateChanged = false
    var labelSourceFeatureStateChanged = false

    for markerKey in pinFamilyState.livePinTransitionsByMarkerKey.keys.sorted() {
      guard let transition = pinFamilyState.livePinTransitionsByMarkerKey[markerKey],
            !transition.isAwaitingSourceCommit
      else {
        continue
      }
      let opacity = Self.livePinTransitionOpacity(transition, atMs: nowMs)
      Self.applyTransientFeatureState(
        sourceState: &pinSourceState,
        familyState: &pinFamilyState,
        featureId: markerKey,
        transientState: Self.livePinFeatureState(opacity: opacity),
        applyList: &featureStatesToApply,
        sourceStateChanged: &pinSourceFeatureStateChanged
      )
      for labelFeature in pinFamilyState.markerRenderStateByMarkerKey[markerKey]?.labelFeatures ?? [] {
        Self.applyTransientFeatureState(
          sourceState: &labelSourceState,
          familyState: &labelFamilyState,
          featureId: labelFeature.id,
          transientState: Self.liveLabelFeatureState(opacity: opacity),
          applyList: &labelFeatureStatesToApply,
          sourceStateChanged: &labelSourceFeatureStateChanged
        )
      }

      if abs(opacity - transition.targetOpacity) < 0.001 {
        if transition.targetOpacity >= 0.999 {
          completedEnterMarkerKeys.append(markerKey)
        } else {
          completedExitMarkerKeys.append(markerKey)
        }
      }
    }

    for markerKey in dotFamilyState.liveDotTransitionsByMarkerKey.keys.sorted() {
      guard let transition = dotFamilyState.liveDotTransitionsByMarkerKey[markerKey],
            !transition.isAwaitingSourceCommit
      else {
        continue
      }
      let opacity = Self.liveDotTransitionOpacity(transition, atMs: nowMs)
      Self.applyTransientFeatureState(
        sourceState: &dotSourceState,
        familyState: &dotFamilyState,
        featureId: markerKey,
        transientState: Self.liveDotFeatureState(opacity: opacity),
        applyList: &dotFeatureStatesToApply,
        sourceStateChanged: &dotSourceFeatureStateChanged
      )
      if abs(opacity - transition.targetOpacity) < 0.001 {
        if transition.targetOpacity >= 0.999 {
          completedDotEnterMarkerKeys.append(markerKey)
        } else {
          completedDotExitMarkerKeys.append(markerKey)
        }
      }
    }
    if pinSourceFeatureStateChanged {
      Self.refreshFeatureStateRevision(&pinSourceState)
    }
    if labelSourceFeatureStateChanged {
      Self.refreshFeatureStateRevision(&labelSourceState)
    }
    if dotSourceFeatureStateChanged {
      Self.refreshFeatureStateRevision(&dotSourceState)
    }

    let mapboxApplyStartedAt = CACurrentMediaTime() * 1000
    if !featureStatesToApply.isEmpty {
      try withMapboxMap(for: state.mapTag) { mapboxMap in
        for entry in featureStatesToApply {
          mapboxMap.setFeatureState(
            sourceId: state.pinSourceId,
            featureId: entry.featureId,
            state: entry.state
          ) { _ in }
        }
      }
    }
    if !dotFeatureStatesToApply.isEmpty {
      try withMapboxMap(for: state.mapTag) { mapboxMap in
        for entry in dotFeatureStatesToApply {
          mapboxMap.setFeatureState(
            sourceId: state.dotSourceId,
            featureId: entry.featureId,
            state: entry.state
          ) { _ in }
        }
      }
    }
    if !labelFeatureStatesToApply.isEmpty {
      try withMapboxMap(for: state.mapTag) { mapboxMap in
        for entry in labelFeatureStatesToApply {
          mapboxMap.setFeatureState(
            sourceId: state.labelSourceId,
            featureId: entry.featureId,
            state: entry.state
          ) { _ in }
        }
      }
    }
    recordNativeApply(
      section: "live_lod_transition.apply_feature_states",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - mapboxApplyStartedAt,
      operationCount: featureStatesToApply.count + dotFeatureStatesToApply.count + labelFeatureStatesToApply.count
    )

    Self.syncMountedSourceState(
      pinSourceState,
      sourceId: state.pinSourceId,
      familyState: &pinFamilyState,
      state: &state
    )
    Self.syncMountedSourceState(
      dotSourceState,
      sourceId: state.dotSourceId,
      familyState: &dotFamilyState,
      state: &state
    )
    Self.syncMountedSourceState(
      labelSourceState,
      sourceId: state.labelSourceId,
      familyState: &labelFamilyState,
      state: &state
    )
    instances[instanceId] = state

    if !completedEnterMarkerKeys.isEmpty || !completedExitMarkerKeys.isEmpty {
      try finalizeCompletedLivePinTransitions(
        instanceId: instanceId,
        enteredMarkerKeys: completedEnterMarkerKeys,
        exitedMarkerKeys: completedExitMarkerKeys
      )
      state = instances[instanceId] ?? state
    }

    if !completedDotEnterMarkerKeys.isEmpty || !completedDotExitMarkerKeys.isEmpty {
      try finalizeCompletedLiveDotTransitions(
        instanceId: instanceId,
        enteredMarkerKeys: completedDotEnterMarkerKeys,
        exitedMarkerKeys: completedDotExitMarkerKeys
      )
      state = instances[instanceId] ?? state
    }

    updateLivePinTransitionAnimation(instanceId: instanceId, state: state)
  }

  @objc
  private func handleLivePinTransitionFrame(_ displayLink: CADisplayLink) {
    guard let instanceId = livePinTransitionAnimators.first(where: { $0.value === displayLink })?.key else {
      return
    }
    do {
      try applyLivePinTransitionFeatureStates(for: instanceId)
      guard let state = instances[instanceId] else {
        cancelLivePinTransitionAnimation(instanceId: instanceId)
        return
      }
      if
        (
          Self.derivedFamilyState(sourceId: state.pinSourceId, state: state).livePinTransitionsByMarkerKey.isEmpty &&
          Self.derivedFamilyState(sourceId: state.dotSourceId, state: state).liveDotTransitionsByMarkerKey.isEmpty
        ) ||
        (
          state.lastPresentationBatchPhase != "live" &&
          state.lastPresentationBatchPhase != "entering"
        )
      {
        cancelLivePinTransitionAnimation(instanceId: instanceId)
      }
    } catch {
      emit([
        "type": "error",
        "instanceId": instanceId,
        "message": "live_pin_transition_failed: \(error.localizedDescription)",
      ])
      cancelLivePinTransitionAnimation(instanceId: instanceId)
    }
  }

  private func finalizeCompletedLivePinTransitions(
    instanceId: String,
    enteredMarkerKeys: [String],
    exitedMarkerKeys: [String]
  ) throws {
    guard var state = instances[instanceId] else {
      return
    }
    let enteredMarkerKeySet = Set(enteredMarkerKeys)
    let exitedMarkerKeySet = Set(exitedMarkerKeys)
    let completedMarkerKeys = Array(enteredMarkerKeySet.union(exitedMarkerKeySet)).sorted()
    guard !completedMarkerKeys.isEmpty else {
      return
    }

    var pinFamilyState = Self.derivedFamilyState(sourceId: state.pinSourceId, state: state)
    var labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    for markerKey in completedMarkerKeys {
      pinFamilyState.livePinTransitionsByMarkerKey.removeValue(forKey: markerKey)

      if enteredMarkerKeySet.contains(markerKey) {
        var pinSourceState = pinFamilyState.sourceState
        if !pinSourceState.sourceRevision.isEmpty || !pinSourceState.featureIds.isEmpty || !pinFamilyState.collection.idsInOrder.isEmpty {
          Self.applyTransientFeatureState(
            sourceState: &pinSourceState,
            familyState: &pinFamilyState,
            featureId: markerKey,
            transientState: Self.livePinFeatureState(opacity: 1)
          )
          Self.syncMountedSourceState(
            pinSourceState,
            sourceId: state.pinSourceId,
            familyState: &pinFamilyState,
            state: &state
          )
        }
      } else {
        var pinSourceState = pinFamilyState.sourceState
        if !pinSourceState.sourceRevision.isEmpty || !pinSourceState.featureIds.isEmpty || !pinFamilyState.collection.idsInOrder.isEmpty {
          Self.clearTransientFeatureState(
            sourceState: &pinSourceState,
            familyState: &pinFamilyState,
            featureId: markerKey
          )
          Self.syncMountedSourceState(
            pinSourceState,
            sourceId: state.pinSourceId,
            familyState: &pinFamilyState,
            state: &state
          )
        }
      }
      var labelSourceState = labelFamilyState.sourceState
      let labelFeatures = pinFamilyState.markerRenderStateByMarkerKey[markerKey]?.labelFeatures ?? []
      if !enteredMarkerKeySet.contains(markerKey) {
        pinFamilyState.markerRenderStateByMarkerKey.removeValue(forKey: markerKey)
      }
      if !labelFeatures.isEmpty &&
        (!labelSourceState.sourceRevision.isEmpty || !labelSourceState.featureIds.isEmpty || !labelFamilyState.collection.idsInOrder.isEmpty) {
        for labelFeature in labelFeatures {
          if enteredMarkerKeySet.contains(markerKey) {
            Self.applyTransientFeatureState(
              sourceState: &labelSourceState,
              familyState: &labelFamilyState,
              featureId: labelFeature.id,
              transientState: Self.liveLabelFeatureState(opacity: 1)
            )
          } else {
            Self.clearTransientFeatureState(
              sourceState: &labelSourceState,
              familyState: &labelFamilyState,
              featureId: labelFeature.id
            )
          }
        }
        Self.syncMountedSourceState(
          labelSourceState,
          sourceId: state.labelSourceId,
          familyState: &labelFamilyState,
          state: &state
        )
      }
    }

    var pinSourceState = pinFamilyState.sourceState
    if !pinSourceState.sourceRevision.isEmpty || !pinSourceState.featureIds.isEmpty || !pinFamilyState.collection.idsInOrder.isEmpty {
      Self.refreshFeatureStateRevision(&pinSourceState)
      Self.syncMountedSourceState(
        pinSourceState,
        sourceId: state.pinSourceId,
        familyState: &pinFamilyState,
        state: &state
      )
    }
    var labelSourceState = labelFamilyState.sourceState
    if !labelSourceState.sourceRevision.isEmpty || !labelSourceState.featureIds.isEmpty || !labelFamilyState.collection.idsInOrder.isEmpty {
      Self.refreshFeatureStateRevision(&labelSourceState)
      Self.syncMountedSourceState(
        labelSourceState,
        sourceId: state.labelSourceId,
        familyState: &labelFamilyState,
        state: &state
      )
    }

    instances[instanceId] = state
    try reconcileAndApplyCurrentFrameSnapshots(for: instanceId, allowNewTransitions: false)
  }

  private func finalizeCompletedLiveDotTransitions(
    instanceId: String,
    enteredMarkerKeys: [String],
    exitedMarkerKeys: [String]
  ) throws {
    guard var state = instances[instanceId] else {
      return
    }
    let enteredMarkerKeySet = Set(enteredMarkerKeys)
    let exitedMarkerKeySet = Set(exitedMarkerKeys)
    let completedMarkerKeys = Array(enteredMarkerKeySet.union(exitedMarkerKeySet)).sorted()
    guard !completedMarkerKeys.isEmpty else {
      return
    }

    for markerKey in completedMarkerKeys {
      var dotFamilyState = Self.derivedFamilyState(sourceId: state.dotSourceId, state: state)
      dotFamilyState.liveDotTransitionsByMarkerKey.removeValue(forKey: markerKey)
      var dotSourceState = dotFamilyState.sourceState
      if !dotSourceState.sourceRevision.isEmpty || !dotSourceState.featureIds.isEmpty || !dotFamilyState.collection.idsInOrder.isEmpty {
        if enteredMarkerKeySet.contains(markerKey) {
          Self.applyTransientFeatureState(
            sourceState: &dotSourceState,
            familyState: &dotFamilyState,
            featureId: markerKey,
            transientState: Self.liveDotFeatureState(opacity: 1)
          )
        } else {
          Self.clearTransientFeatureState(
            sourceState: &dotSourceState,
            familyState: &dotFamilyState,
            featureId: markerKey
          )
        }
        Self.syncMountedSourceState(
          dotSourceState,
          sourceId: state.dotSourceId,
          familyState: &dotFamilyState,
          state: &state
        )
      }
    }

    var dotSourceState = Self.derivedFamilyState(sourceId: state.dotSourceId, state: state).sourceState
    if !dotSourceState.sourceRevision.isEmpty || !dotSourceState.featureIds.isEmpty || !Self.derivedFamilyState(sourceId: state.dotSourceId, state: state).collection.idsInOrder.isEmpty {
      Self.refreshFeatureStateRevision(&dotSourceState)
      var dotFamilyState = Self.derivedFamilyState(sourceId: state.dotSourceId, state: state)
      Self.syncMountedSourceState(
        dotSourceState,
        sourceId: state.dotSourceId,
        familyState: &dotFamilyState,
        state: &state
      )
    }

    instances[instanceId] = state
    try reconcileAndApplyCurrentFrameSnapshots(for: instanceId, allowNewTransitions: false)
  }

  private func applyInteractionSuppression(
    for state: inout InstanceState,
    instanceId: String,
    allowDuringRecovery: Bool = false
  ) throws {
    if Self.isSourceRecoveryActive(state) && !allowDuringRecovery {
      cancelLivePinTransitionAnimation(instanceId: instanceId)
      return
    }
    // Generic suppression only disables query resolution. The mounted interaction
    // mirrors must stay resident through profile/camera transitions so debug and
    // native hit geometry do not flash. Terminal dismiss owns the explicit source
    // clear in beginDismissVisualLifecycle.
  }

  private func clearMountedInteractionSources(
    instanceId: String,
    state: inout InstanceState
  ) throws {
    let emptyParsedCollection = Self.emptyParsedFeatureCollection()
    let emptySourceState = Self.sourceStateFromCollection(emptyParsedCollection)
    try withMapboxMap(for: state.mapTag) { mapboxMap in
      let emptyCollection = FeatureCollection(features: [])
      for sourceId in [
        state.pinInteractionSourceId,
        state.dotInteractionSourceId,
        state.labelInteractionSourceId,
      ] {
        mapboxMap.updateGeoJSONSource(
          withId: sourceId,
          geoJSON: .featureCollection(emptyCollection)
        )
      }
    }
    for sourceId in [
      state.pinInteractionSourceId,
      state.dotInteractionSourceId,
      state.labelInteractionSourceId,
    ] {
      var familyState = Self.derivedFamilyState(sourceId: sourceId, state: state)
      familyState.desiredCollection = emptyParsedCollection
      familyState.collection = emptyParsedCollection
      familyState.sourceState = emptySourceState
      familyState.transientFeatureStateById.removeAll()
      Self.setDerivedFamilyState(familyState, sourceId: sourceId, state: &state)
    }
  }

  private func shouldSuppressInteractions(state: InstanceState) -> Bool {
    state.interactionMode != "enabled"
  }

  private func applyHighlightedMarkerState(
    for state: InstanceState,
    instanceId: String,
    allowDuringRecovery: Bool = false
  ) throws {
    var mutableState = state
    if Self.isSourceRecoveryActive(mutableState) && !allowDuringRecovery {
      instances[instanceId] = mutableState
      return
    }
    if try withReadyMapboxMap(
      for: state.mapTag,
      instanceId: instanceId,
      state: &mutableState,
      sourceIds: visualSourceIds(for: state),
      reason: "apply_highlighted_marker_state",
      allowRecoveryEscalation: false,
      { _ in }
    ) == false {
      instances[instanceId] = mutableState
      return
    }
    try withMapboxMap(for: state.mapTag) { mapboxMap in
      for sourceId in [state.pinSourceId, state.dotSourceId, state.labelSourceId] {
        guard let sourceState = Self.mountedSourceState(sourceId: sourceId, state: state) else {
          continue
        }
        let featureById =
          state.derivedFamilyStates[sourceId]?.collection.featureById ?? [:]
        for featureId in sourceState.featureIds {
          let markerKey = sourceState.markerKeyByFeatureId[featureId] ?? featureId
          let featureRestaurantId =
            featureById[featureId]
              .flatMap(Self.restaurantId(fromFeature:))
          let isHighlighted =
            state.highlightedMarkerKeys.contains(markerKey) ||
            (
              state.highlightedRestaurantId != nil &&
                featureRestaurantId == state.highlightedRestaurantId
            )
          mapboxMap.setFeatureState(
            sourceId: sourceId,
            featureId: featureId,
            state: [
              "nativeHighlighted": isHighlighted ? 1 : 0,
            ]
          ) { _ in }
        }
      }
    }
  }

  private static func restaurantId(fromFeature feature: Feature) -> String? {
    let properties = feature.properties?.turfRawValue as? [String: Any]
    let restaurantId = properties?["restaurantId"] as? String
    guard let restaurantId, !restaurantId.isEmpty else {
      return nil
    }
    return restaurantId
  }

  private func cancelPresentationOpacityAnimation(instanceId: String) {
    presentationOpacityAnimators[instanceId]?.stop()
    presentationOpacityAnimators.removeValue(forKey: instanceId)
  }

  private func setPresentationOpacityImmediate(
    _ opacity: Double,
    for state: inout InstanceState,
    instanceId: String,
    reason: String,
    allowDuringRecovery: Bool = false
  ) throws {
    cancelPresentationOpacityAnimation(instanceId: instanceId)
    let clampedOpacity = Self.clamp(opacity, min: 0, max: 1)
    state.currentPresentationOpacityTarget = clampedOpacity
    state.currentPresentationOpacityValue = clampedOpacity
    instances[instanceId] = state
    try applyPresentationOpacity(
      clampedOpacity,
      for: state,
      instanceId: instanceId,
      reason: reason,
      allowDuringRecovery: allowDuringRecovery
    )
    state = instances[instanceId] ?? state
    try releaseHiddenVisualSourcesForCollision(
      instanceId: instanceId,
      state: &state,
      reason: reason
    )
  }

  private func applyCurrentPresentationOpacity(
    for state: inout InstanceState,
    instanceId: String,
    reason: String,
    allowDuringRecovery: Bool = false
  ) throws {
    let clampedOpacity = Self.clamp(state.currentPresentationOpacityValue, min: 0, max: 1)
    state.currentPresentationOpacityValue = clampedOpacity
    instances[instanceId] = state
    try applyPresentationOpacity(
      clampedOpacity,
      for: state,
      instanceId: instanceId,
      reason: reason,
      allowDuringRecovery: allowDuringRecovery
    )
    state = instances[instanceId] ?? state
    try releaseHiddenVisualSourcesForCollision(
      instanceId: instanceId,
      state: &state,
      reason: reason
    )
  }

  private func animatePresentationOpacity(
    to targetOpacity: Double,
    for state: inout InstanceState,
    instanceId: String,
    reason: String,
    durationMs: Int? = nil,
    allowDuringRecovery: Bool = false
  ) throws {
    cancelPresentationOpacityAnimation(instanceId: instanceId)
    let clampedTarget = Self.clamp(targetOpacity, min: 0, max: 1)
    let startOpacity = Self.clamp(state.currentPresentationOpacityValue, min: 0, max: 1)
    state.currentPresentationOpacityTarget = clampedTarget
    state.currentPresentationOpacityValue = startOpacity
    instances[instanceId] = state

    if abs(startOpacity - clampedTarget) < 0.001 {
      try applyPresentationOpacity(
        clampedTarget,
        for: state,
        instanceId: instanceId,
        reason: reason,
        allowDuringRecovery: allowDuringRecovery
      )
      state = instances[instanceId] ?? state
      try releaseHiddenVisualSourcesForCollision(
        instanceId: instanceId,
        state: &state,
        reason: reason
      )
      return
    }

    let resolvedDurationMs = durationMs ?? enterSettleDelayMs
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "presentation_opacity_animation_start reason=\(reason) start=\(Self.round3(startOpacity)) target=\(Self.round3(clampedTarget)) durationMs=\(Int(resolvedDurationMs))"
    )

    let animator = PresentationOpacityAnimator(
      owner: self,
      instanceId: instanceId,
      reason: reason,
      startOpacity: startOpacity,
      targetOpacity: clampedTarget,
      durationMs: Double(resolvedDurationMs),
      startedAtMs: Self.nowMs()
    )
    presentationOpacityAnimators[instanceId] = animator
    animator.start()
  }

  fileprivate func stepPresentationOpacityAnimation(instanceId: String, timestampMs: Double) {
    guard let animator = presentationOpacityAnimators[instanceId] else {
      return
    }
    guard var state = instances[instanceId] else {
      cancelPresentationOpacityAnimation(instanceId: instanceId)
      return
    }
    let elapsedMs = max(0, timestampMs - animator.startedAtMs)
    let rawProgress = animator.durationMs <= 0 ? 1 : min(1, elapsedMs / animator.durationMs)
    let easedProgress = rawProgress * rawProgress * (3 - 2 * rawProgress)
    let opacity =
      animator.startOpacity + (animator.targetOpacity - animator.startOpacity) * easedProgress
    state.currentPresentationOpacityValue = opacity
    instances[instanceId] = state
    do {
      try applyPresentationOpacity(
        opacity,
        for: state,
        instanceId: instanceId,
        reason: animator.reason,
        emitDiagnostic: rawProgress >= 1
      )
      state = instances[instanceId] ?? state
      emitEnterFirstVisibleFrameIfNeeded(instanceId: instanceId, state: &state, opacity: opacity)
      if rawProgress >= 1 {
        try releaseHiddenVisualSourcesForCollision(
          instanceId: instanceId,
          state: &state,
          reason: animator.reason
        )
        emitVisualDiag(
          instanceId: instanceId,
          message:
            "presentation_opacity_animation_complete reason=\(animator.reason) target=\(Self.round3(animator.targetOpacity))"
        )
        cancelPresentationOpacityAnimation(instanceId: instanceId)
      }
    } catch {
      emit([
        "type": "error",
        "instanceId": instanceId,
        "message": "presentation_opacity_animation_failed: \(error.localizedDescription)",
      ])
      cancelPresentationOpacityAnimation(instanceId: instanceId)
    }
  }

  private func emitEnterFirstVisibleFrameIfNeeded(
    instanceId: String,
    state: inout InstanceState,
    opacity: Double
  ) {
    guard opacity > 0.001 else {
      return
    }
    guard state.lastPresentationBatchPhase == "entering" else {
      return
    }
    guard let requestKey = state.lastEnterRequestKey else {
      return
    }
    guard state.lastEnterStartedRequestKey == requestKey else {
      return
    }
  }

  private static func round3(_ value: Double) -> Double {
    (value * 1000).rounded() / 1000
  }

  private static func round1(_ value: Double) -> Double {
    (value * 10).rounded() / 10
  }

  private static func clamp(_ value: Double, min: Double, max: Double) -> Double {
    Swift.max(min, Swift.min(max, value))
  }

  private func applyPresentationOpacity(
    _ opacity: Double,
    for state: InstanceState,
    instanceId: String,
    reason: String,
    allowDuringRecovery: Bool = false,
    emitDiagnostic: Bool = true
  ) throws {
    var mutableState = state
    if Self.isSourceRecoveryActive(mutableState) && !allowDuringRecovery {
      instances[instanceId] = mutableState
      return
    }
    if try withReadyMapboxMap(
      for: state.mapTag,
      instanceId: instanceId,
      state: &mutableState,
      sourceIds: visualSourceIds(for: state),
      reason: "apply_presentation_opacity",
      allowRecoveryEscalation: false,
      { _ in }
    ) == false {
      instances[instanceId] = mutableState
      return
    }
    let startedAt = CACurrentMediaTime() * 1000
    try withMapboxMap(for: state.mapTag) { mapboxMap in
      var featureCount = 0
      for sourceId in [state.pinSourceId, state.dotSourceId, state.labelSourceId] {
        var familyState = Self.derivedFamilyState(sourceId: sourceId, state: mutableState)
        let featureIds = Array(familyState.sourceState.featureIds)
        featureCount += featureIds.count
        for featureId in featureIds {
          mapboxMap.setFeatureState(
            sourceId: sourceId,
            featureId: featureId,
            state: ["nativePresentationOpacity": opacity]
          ) { _ in }
        }
        guard !featureIds.isEmpty else {
          continue
        }
        var sourceState = familyState.sourceState
        for featureId in featureIds {
          _ = Self.applyRetainedFeatureStatePatch(
            sourceState: &sourceState,
            featureId: featureId,
            statePatch: ["nativePresentationOpacity": opacity]
          )
        }
        Self.refreshFeatureStateRevision(&sourceState)
        Self.syncMountedSourceState(
          sourceState,
          sourceId: sourceId,
          familyState: &familyState,
          state: &mutableState
        )
      }
      let durationMs = CACurrentMediaTime() * 1000 - startedAt
      self.recordNativeApply(
        section: "presentation_opacity.apply",
        phase: state.lastPresentationBatchPhase,
        source: reason,
        durationMs: durationMs,
        operationCount: featureCount
      )
      if emitDiagnostic && ((featureCount > 0 && opacity > 0) || durationMs >= self.slowActionThresholdMs) {
        self.emit([
          "type": "error",
          "instanceId": "__native_diag__",
          "message":
            "presentation_opacity_apply reason=\(reason) opacity=\(opacity) phase=\(state.lastPresentationBatchPhase) featureCount=\(featureCount) pins=\(state.lastPinCount) dots=\(state.lastDotCount) labels=\(state.lastLabelCount) durationMs=\(Int(durationMs.rounded()))",
        ])
      }
    }
    instances[instanceId] = mutableState
  }

  private static func phaseSummary(for state: InstanceState) -> String {
    let pinFamilyState = Self.derivedFamilyState(sourceId: state.pinSourceId, state: state)
    let dotFamilyState = Self.derivedFamilyState(sourceId: state.dotSourceId, state: state)
    let labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    let pinMounted = Self.mountedSourceState(sourceId: state.pinSourceId, state: state)?.diffKeyById.count ?? 0
    let dotMounted = Self.mountedSourceState(sourceId: state.dotSourceId, state: state)?.diffKeyById.count ?? 0
    let labelMounted =
      Self.mountedSourceState(sourceId: state.labelSourceId, state: state)?.diffKeyById.count ?? 0
    return [
      "pinMounted=\(pinMounted)",
      "dotMounted=\(dotMounted)",
      "labelMounted=\(labelMounted)",
      "pinDesired=\(pinFamilyState.lastDesiredPinSnapshot.pinIdsInOrder.count)",
      "dotDesired=\(dotFamilyState.lastDesiredCollection.idsInOrder.count)",
      "labelDesired=\(labelFamilyState.desiredCollection.idsInOrder.count)",
      "pinFeatureStateOverrides=\(pinFamilyState.transientFeatureStateById.count)",
      "dotFeatureStateOverrides=\(dotFamilyState.transientFeatureStateById.count)",
      "labelFeatureStateOverrides=\(labelFamilyState.transientFeatureStateById.count)",
      "pinLodAnimations=\(pinFamilyState.livePinTransitionsByMarkerKey.count)",
      "dotLodAnimations=\(dotFamilyState.liveDotTransitionsByMarkerKey.count)",
    ].joined(separator: " ")
  }

  private func recoveryContextSummary(for state: InstanceState) -> String {
    let recoveryPausedMs = state.sourceRecoveryPausedAtMs.map { max(0, Int((Self.nowMs() - $0).rounded())) }
    return "phase=\(state.lastPresentationBatchPhase) moving=\(state.currentViewportIsMoving) pins=\(state.lastPinCount) dots=\(state.lastDotCount) labels=\(state.lastLabelCount) \(Self.phaseSummary(for: state)) \(commitFenceWaitSummary(state: state)) recoveryPausedMs=\(recoveryPausedMs.map(String.init) ?? "nil")"
  }

  private func visualSourceIds(for state: InstanceState) -> [String] {
    [state.pinSourceId, state.dotSourceId, state.labelSourceId]
  }

  private func commitRenderedLabelObservation(
    instanceId: String,
    observation: (
      visibleLabelFeatureIds: [String],
      placedLabels: [RenderedPlacedLabelObservation]
    ),
    layerRenderedFeatureCount: Int,
    effectiveRenderedFeatureCount: Int,
    commitInteractionVisibility: Bool,
    enableStickyLabelCandidates: Bool,
    stickyLockStableMsMoving: Double,
    stickyLockStableMsIdle: Double,
    stickyUnlockMissingMsMoving: Double,
    stickyUnlockMissingMsIdle: Double,
    stickyUnlockMissingStreakMoving: Int,
    labelResetRequestKey: String?
  ) -> [String: Any] {
    guard var mutableState = instances[instanceId] else {
      return Self.emptyRenderedLabelObservationResult()
    }
    if mutableState.visualSourceLifecycleState == .dismissing ||
      mutableState.visualSourceLifecycleState == .dismissed {
      return Self.emptyRenderedLabelObservationResult()
    }
    var labelFamilyState = Self.derivedFamilyState(sourceId: mutableState.labelSourceId, state: mutableState)
    let labelInteractionFamilyState = Self.derivedFamilyState(
      sourceId: mutableState.labelInteractionSourceId,
      state: mutableState
    )
    let previousVisibleLabelFeatureIds = labelFamilyState.labelObservation.lastVisibleLabelFeatureIds
    let shouldCommitInteractionVisibility =
      commitInteractionVisibility &&
      labelFamilyState.labelObservation.commitInteractionVisibility &&
      labelFamilyState.labelObservation.observationEnabled
    var didClearSettledVisibleLabelInteractions = false
    if shouldCommitInteractionVisibility {
      labelFamilyState.settledVisibleFeatureIds = Set(observation.visibleLabelFeatureIds)
    } else if
      !labelFamilyState.settledVisibleFeatureIds.isEmpty ||
      !labelInteractionFamilyState.collection.idsInOrder.isEmpty
    {
      labelFamilyState.settledVisibleFeatureIds.removeAll()
      didClearSettledVisibleLabelInteractions = true
    }
    let resetIdentityKeys = Self.resetStickyLabelObservationIfNeeded(
      &labelFamilyState.labelObservation,
      labelResetRequestKey: labelResetRequestKey
    )
    let changedIdentityKeys = Self.updateStickyLabelObservation(
      &labelFamilyState.labelObservation,
      placedLabels: observation.placedLabels,
      isMoving: mutableState.currentViewportIsMoving,
      enableStickyLabelCandidates: enableStickyLabelCandidates,
      stickyLockStableMsMoving: stickyLockStableMsMoving,
      stickyLockStableMsIdle: stickyLockStableMsIdle,
      stickyUnlockMissingMsMoving: stickyUnlockMissingMsMoving,
      stickyUnlockMissingMsIdle: stickyUnlockMissingMsIdle,
      stickyUnlockMissingStreakMoving: stickyUnlockMissingStreakMoving,
      nowMs: Self.nowMs()
    )
    labelFamilyState.labelObservation.lastVisibleLabelFeatureIds = observation.visibleLabelFeatureIds
    labelFamilyState.labelObservation.lastLayerRenderedFeatureCount = layerRenderedFeatureCount
    labelFamilyState.labelObservation.lastEffectiveRenderedFeatureCount = effectiveRenderedFeatureCount
    labelFamilyState.labelObservation.hasCommittedObservationForConfiguredRequest = true
    let dirtyStickyIdentityKeys = Array(resetIdentityKeys.union(changedIdentityKeys)).sorted()
    let didProduceMeaningfulChange =
      !dirtyStickyIdentityKeys.isEmpty ||
      didClearSettledVisibleLabelInteractions ||
      previousVisibleLabelFeatureIds != observation.visibleLabelFeatureIds
    if didProduceMeaningfulChange {
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "label_observation_commit_probe phase=\(mutableState.lastPresentationBatchPhase) lifecycle=\(mutableState.visualSourceLifecycleState) moving=\(mutableState.currentViewportIsMoving) visibleLabels=\(observation.visibleLabelFeatureIds.count) placedLabels=\(observation.placedLabels.count) previousVisibleLabels=\(previousVisibleLabelFeatureIds.count) layerRendered=\(layerRenderedFeatureCount) effectiveRendered=\(effectiveRenderedFeatureCount) commitInteractions=\(shouldCommitInteractionVisibility) clearedInteractions=\(didClearSettledVisibleLabelInteractions) stickyChanged=\(!dirtyStickyIdentityKeys.isEmpty) stickyRevision=\(labelFamilyState.labelObservation.stickyRevision)"
      )
    }
    if mutableState.currentViewportIsMoving {
      if didProduceMeaningfulChange {
        labelFamilyState.labelObservation.movingNoopRefreshStreak = 0
        labelFamilyState.labelObservation.movingAdaptiveRefreshMs =
          labelFamilyState.labelObservation.refreshMsMoving
      } else {
        labelFamilyState.labelObservation.movingNoopRefreshStreak += 1
        labelFamilyState.labelObservation.movingAdaptiveRefreshMs =
          Self.nextAdaptiveMovingLabelObservationDelay(
            baseRefreshMs: labelFamilyState.labelObservation.refreshMsMoving,
            noopRefreshStreak: labelFamilyState.labelObservation.movingNoopRefreshStreak
          )
      }
    } else {
      labelFamilyState.labelObservation.movingNoopRefreshStreak = 0
      labelFamilyState.labelObservation.movingAdaptiveRefreshMs =
        labelFamilyState.labelObservation.refreshMsMoving
    }
    Self.setDerivedFamilyState(
      labelFamilyState,
      sourceId: mutableState.labelSourceId,
      state: &mutableState
    )
    instances[instanceId] = mutableState
    if !dirtyStickyIdentityKeys.isEmpty || didClearSettledVisibleLabelInteractions {
      do {
        try reconcileAndApplyCurrentFrameSnapshots(
          for: instanceId,
          allowNewTransitions: Self.shouldAllowObservationDrivenMarkerTransitions(mutableState)
        )
      } catch {
        emit([
          "type": "error",
          "instanceId": instanceId,
          "message": "sticky_label_candidate_reconcile_failed: \(error.localizedDescription)",
        ])
      }
    }
    if var latestState = instances[instanceId] {
      maybeElectMountedHiddenExecutionBatch(instanceId: instanceId, state: &latestState)
      if var armedState = instances[instanceId] {
        maybeEmitExecutionBatchArmed(instanceId: instanceId, state: &armedState)
      }
    }
    return [
      "visibleLabelFeatureIds": observation.visibleLabelFeatureIds,
      "placedLabels": Self.serializeRenderedPlacedLabels(observation.placedLabels),
      "layerRenderedFeatureCount": layerRenderedFeatureCount,
      "effectiveRenderedFeatureCount": effectiveRenderedFeatureCount,
      "stickyChanged": !dirtyStickyIdentityKeys.isEmpty,
    ]
  }

  private func currentRenderedLabelObservationSnapshot(
    instanceId: String
  ) -> [String: Any] {
    guard let state = instances[instanceId] else {
      return Self.emptyRenderedLabelObservationResult()
    }
    let labelObservation = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state).labelObservation
    return [
      "visibleLabelFeatureIds": labelObservation.lastVisibleLabelFeatureIds,
      "placedLabels": [],
      "layerRenderedFeatureCount": labelObservation.lastLayerRenderedFeatureCount,
      "effectiveRenderedFeatureCount": labelObservation.lastEffectiveRenderedFeatureCount,
      "stickyChanged": false,
    ]
  }

  private func configureLabelObservation(
    instanceId: String,
    observationEnabled: Bool,
    allowFallback: Bool,
    commitInteractionVisibility: Bool,
    enableStickyLabelCandidates: Bool,
    refreshMsIdle: Double,
    refreshMsMoving: Double,
    stickyLockStableMsMoving: Double,
    stickyLockStableMsIdle: Double,
    stickyUnlockMissingMsMoving: Double,
    stickyUnlockMissingMsIdle: Double,
    stickyUnlockMissingStreakMoving: Int,
    labelResetRequestKey: String?
  ) {
    guard var state = instances[instanceId] else {
      return
    }
    var labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    let labelInteractionFamilyState = Self.derivedFamilyState(
      sourceId: state.labelInteractionSourceId,
      state: state
    )
    labelFamilyState.labelObservation.observationEnabled = observationEnabled
    labelFamilyState.labelObservation.allowFallback = allowFallback
    labelFamilyState.labelObservation.commitInteractionVisibility = commitInteractionVisibility
    labelFamilyState.labelObservation.refreshMsIdle = refreshMsIdle
    labelFamilyState.labelObservation.refreshMsMoving = refreshMsMoving
    labelFamilyState.labelObservation.stickyEnabled = enableStickyLabelCandidates
    labelFamilyState.labelObservation.stickyLockStableMsMoving = stickyLockStableMsMoving
    labelFamilyState.labelObservation.stickyLockStableMsIdle = stickyLockStableMsIdle
    labelFamilyState.labelObservation.stickyUnlockMissingMsMoving = stickyUnlockMissingMsMoving
    labelFamilyState.labelObservation.stickyUnlockMissingMsIdle = stickyUnlockMissingMsIdle
    labelFamilyState.labelObservation.stickyUnlockMissingStreakMoving = stickyUnlockMissingStreakMoving
    if labelFamilyState.labelObservation.configuredResetRequestKey != labelResetRequestKey {
      labelFamilyState.labelObservation.hasCommittedObservationForConfiguredRequest = false
    }
    labelFamilyState.labelObservation.configuredResetRequestKey = labelResetRequestKey
    labelFamilyState.labelObservation.movingNoopRefreshStreak = 0
    labelFamilyState.labelObservation.movingAdaptiveRefreshMs = refreshMsMoving
    let shouldClearLabelInteractionVisibility = !observationEnabled || !commitInteractionVisibility
    let didClearLabelInteractionVisibility =
      shouldClearLabelInteractionVisibility &&
      (
        !labelFamilyState.settledVisibleFeatureIds.isEmpty ||
        !labelInteractionFamilyState.collection.idsInOrder.isEmpty
      )
    if didClearLabelInteractionVisibility {
      labelFamilyState.settledVisibleFeatureIds.removeAll()
    }
    if !observationEnabled {
      labelFamilyState.labelObservation.isRefreshInFlight = false
      labelFamilyState.labelObservation.queuedRefreshDelayMs = nil
      labelObservationRefreshWorkItems[instanceId]?.cancel()
      labelObservationRefreshWorkItems[instanceId] = nil
    }
    Self.setDerivedFamilyState(labelFamilyState, sourceId: state.labelSourceId, state: &state)
    instances[instanceId] = state
    if didClearLabelInteractionVisibility {
      do {
        try reconcileAndApplyCurrentFrameSnapshots(
          for: instanceId,
          allowNewTransitions: Self.shouldAllowObservationDrivenMarkerTransitions(state)
        )
      } catch {
        emit([
          "type": "error",
          "instanceId": instanceId,
          "message": "label_interaction_visibility_clear_failed: \(error.localizedDescription)",
        ])
      }
    }
    if observationEnabled {
      emit(
        Self.labelObservationEventPayload(from: currentRenderedLabelObservationSnapshot(instanceId: instanceId))
          .merging(["type": "label_observation_updated", "instanceId": instanceId]) { _, new in new }
      )
      scheduleLabelObservationRefresh(instanceId: instanceId, delayMs: 0)
    } else {
      emit(
        Self.labelObservationEventPayload(from: Self.emptyRenderedLabelObservationResult())
          .merging(["type": "label_observation_updated", "instanceId": instanceId]) { _, new in new }
      )
    }
  }

  private static func nextAdaptiveMovingLabelObservationDelay(
    baseRefreshMs: Double,
    noopRefreshStreak: Int
  ) -> Double {
    let clampedBaseRefreshMs = max(baseRefreshMs, 16)
    if noopRefreshStreak >= 6 {
      return min(clampedBaseRefreshMs * 6, 96)
    }
    if noopRefreshStreak >= 3 {
      return min(clampedBaseRefreshMs * 3, 64)
    }
    if noopRefreshStreak >= 1 {
      return min(clampedBaseRefreshMs * 2, 32)
    }
    return clampedBaseRefreshMs
  }

  private func scheduleLabelObservationRefresh(
    instanceId: String,
    delayMs: Double
  ) {
    guard var state = instances[instanceId] else {
      return
    }
    var labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    guard labelFamilyState.labelObservation.observationEnabled else {
      labelObservationRefreshWorkItems[instanceId]?.cancel()
      labelObservationRefreshWorkItems[instanceId] = nil
      return
    }
    if shouldEmitLabelObservationQueryProbe(state: state) {
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "label_observation_refresh_probe stage=schedule delayMs=\(Self.round1(delayMs)) moving=\(state.currentViewportIsMoving) inFlight=\(labelFamilyState.labelObservation.isRefreshInFlight) phase=\(state.lastPresentationBatchPhase) lifecycle=\(state.visualSourceLifecycleState) frame=\(state.activeFrameGenerationId ?? "nil")"
      )
    }
    let normalizedDelayMs: Double
    if state.currentViewportIsMoving && delayMs > 0 {
      let adaptiveDelayMs =
        labelFamilyState.labelObservation.movingAdaptiveRefreshMs > 0
        ? labelFamilyState.labelObservation.movingAdaptiveRefreshMs
        : labelFamilyState.labelObservation.refreshMsMoving
      normalizedDelayMs = max(delayMs, adaptiveDelayMs)
    } else {
      normalizedDelayMs = delayMs
    }
    if labelFamilyState.labelObservation.isRefreshInFlight {
      let currentQueuedDelayMs = labelFamilyState.labelObservation.queuedRefreshDelayMs
      labelFamilyState.labelObservation.queuedRefreshDelayMs =
        currentQueuedDelayMs.map { min($0, normalizedDelayMs) } ?? normalizedDelayMs
      Self.setDerivedFamilyState(labelFamilyState, sourceId: state.labelSourceId, state: &state)
      instances[instanceId] = state
      return
    }
    labelObservationRefreshWorkItems[instanceId]?.cancel()
    let workItem = DispatchWorkItem { [weak self] in
      guard let self else {
        return
      }
      DispatchQueue.main.async {
        self.performLabelObservationRefresh(instanceId: instanceId)
      }
    }
    labelObservationRefreshWorkItems[instanceId] = workItem
    DispatchQueue.main.asyncAfter(
      deadline: .now() + max(0, normalizedDelayMs) / 1000,
      execute: workItem
    )
  }

  private func completeLabelObservationRefresh(instanceId: String) {
    guard var state = instances[instanceId] else {
      return
    }
    var labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    labelFamilyState.labelObservation.isRefreshInFlight = false
    let nextDelayMs = labelFamilyState.labelObservation.queuedRefreshDelayMs
    labelFamilyState.labelObservation.queuedRefreshDelayMs = nil
    Self.setDerivedFamilyState(labelFamilyState, sourceId: state.labelSourceId, state: &state)
    instances[instanceId] = state
    if state.visualSourceLifecycleState == .dismissing ||
      state.visualSourceLifecycleState == .dismissed {
      labelObservationRefreshWorkItems[instanceId]?.cancel()
      labelObservationRefreshWorkItems[instanceId] = nil
      return
    }
    if let nextDelayMs {
      scheduleLabelObservationRefresh(instanceId: instanceId, delayMs: nextDelayMs)
    }
  }

  private func retryLabelObservationRefreshIfPlacementPending(
    instanceId: String,
    delayMs: Double
  ) {
    guard let state = instances[instanceId] else {
      return
    }
    if state.visualSourceLifecycleState == .dismissing ||
      state.visualSourceLifecycleState == .dismissed {
      return
    }
    let labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    let labelCount = max(
      state.lastLabelCount,
      labelFamilyState.desiredCollection.idsInOrder.count,
      labelFamilyState.collection.idsInOrder.count
    )
    guard labelCount > 0,
      labelFamilyState.labelObservation.observationEnabled,
      !Self.isActiveFrameLabelPlacementReady(state: state)
    else {
      return
    }
    scheduleLabelObservationRefresh(instanceId: instanceId, delayMs: delayMs)
  }

  private func performLabelObservationRefresh(instanceId: String) {
    guard var state = instances[instanceId] else {
      return
    }
    if state.visualSourceLifecycleState == .dismissing ||
      state.visualSourceLifecycleState == .dismissed {
      labelObservationRefreshWorkItems[instanceId]?.cancel()
      labelObservationRefreshWorkItems[instanceId] = nil
      return
    }
    var labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    guard labelFamilyState.labelObservation.observationEnabled else {
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "label_observation_refresh_probe stage=skip_disabled phase=\(state.lastPresentationBatchPhase) lifecycle=\(state.visualSourceLifecycleState) frame=\(state.activeFrameGenerationId ?? "nil")"
      )
      return
    }
    guard let handle = currentResolvedMapHandle(for: state.mapTag) else {
      if shouldEmitLabelObservationQueryProbe(state: state) {
        emitVisualDiag(
          instanceId: instanceId,
          message:
            "label_observation_refresh_probe stage=skip_missing_map_handle phase=\(state.lastPresentationBatchPhase) lifecycle=\(state.visualSourceLifecycleState) frame=\(state.activeFrameGenerationId ?? "nil") mapTag=\(state.mapTag.stringValue)"
        )
      }
      return
    }
    let queryRect = handle.mapView.bounds
    guard queryRect.width > 0, queryRect.height > 0 else {
      if shouldEmitLabelObservationQueryProbe(state: state) {
        emitVisualDiag(
          instanceId: instanceId,
          message:
            "label_observation_refresh_probe stage=skip_empty_bounds phase=\(state.lastPresentationBatchPhase) lifecycle=\(state.visualSourceLifecycleState) frame=\(state.activeFrameGenerationId ?? "nil") queryRect=\(Self.rectSummary(queryRect))"
        )
      }
      let snapshot = commitRenderedLabelObservation(
        instanceId: instanceId,
        observation: (visibleLabelFeatureIds: [], placedLabels: []),
        layerRenderedFeatureCount: 0,
        effectiveRenderedFeatureCount: 0,
        commitInteractionVisibility: labelFamilyState.labelObservation.commitInteractionVisibility,
        enableStickyLabelCandidates: labelFamilyState.labelObservation.stickyEnabled,
        stickyLockStableMsMoving: labelFamilyState.labelObservation.stickyLockStableMsMoving,
        stickyLockStableMsIdle: labelFamilyState.labelObservation.stickyLockStableMsIdle,
        stickyUnlockMissingMsMoving: labelFamilyState.labelObservation.stickyUnlockMissingMsMoving,
        stickyUnlockMissingMsIdle: labelFamilyState.labelObservation.stickyUnlockMissingMsIdle,
        stickyUnlockMissingStreakMoving: labelFamilyState.labelObservation.stickyUnlockMissingStreakMoving,
        labelResetRequestKey: labelFamilyState.labelObservation.configuredResetRequestKey
      )
      emit(
        Self.labelObservationEventPayload(from: snapshot)
          .merging(["type": "label_observation_updated", "instanceId": instanceId]) { _, new in new }
      )
      completeLabelObservationRefresh(instanceId: instanceId)
      return
    }
    labelFamilyState.labelObservation.isRefreshInFlight = true
    Self.setDerivedFamilyState(labelFamilyState, sourceId: state.labelSourceId, state: &state)
    instances[instanceId] = state
    do {
      let resolvedLayerIds = try resolveRenderedProbeLayerIds(
        for: [state.labelSourceId],
        mapboxMap: handle.mapView.mapboxMap
      )
      if shouldEmitLabelObservationQueryProbe(state: state) {
        emitVisualDiag(
          instanceId: instanceId,
          message: "label_observation_query_probe \(labelObservationQueryProbeSummary(stage: "query_start", state: state, resolvedLayerIds: resolvedLayerIds, queryRect: queryRect))"
        )
      }
      guard !resolvedLayerIds.isEmpty else {
        let snapshot = currentRenderedLabelObservationSnapshot(instanceId: instanceId)
        emit(
          Self.labelObservationEventPayload(from: snapshot)
            .merging(["type": "label_observation_updated", "instanceId": instanceId]) { _, new in new }
        )
        completeLabelObservationRefresh(instanceId: instanceId)
        retryLabelObservationRefreshIfPlacementPending(instanceId: instanceId, delayMs: 16)
        return
      }
      let allowFallback = labelFamilyState.labelObservation.allowFallback
      let queryOptions = RenderedQueryOptions(layerIds: resolvedLayerIds, filter: nil)
      handle.mapView.mapboxMap.queryRenderedFeatures(
        with: queryRect,
        options: queryOptions
      ) { [weak self] result in
        DispatchQueue.main.async {
          guard let self else {
            return
          }
          guard
            let latestState = self.instances[instanceId],
            latestState.visualSourceLifecycleState != .dismissing,
            latestState.visualSourceLifecycleState != .dismissed
          else {
            self.completeLabelObservationRefresh(instanceId: instanceId)
            return
          }
          switch result {
          case .failure:
            self.completeLabelObservationRefresh(instanceId: instanceId)
            self.retryLabelObservationRefreshIfPlacementPending(instanceId: instanceId, delayMs: 16)
          case .success(let features):
            if features.isEmpty && self.shouldEmitLabelObservationQueryProbe(state: latestState) {
              self.emitVisualDiag(
                instanceId: instanceId,
                message: "label_observation_query_probe \(self.labelObservationQueryProbeSummary(stage: "query_zero", state: latestState, resolvedLayerIds: resolvedLayerIds, queryRect: queryRect, renderedFeatureCount: features.count))"
              )
            }
            let primaryObservation = Self.buildRenderedLabelObservation(
              from: features,
              requiredSourceId: state.labelSourceId
            )
            if features.count > 0 || !allowFallback {
              let snapshot = self.commitRenderedLabelObservation(
                instanceId: instanceId,
                observation: primaryObservation,
                layerRenderedFeatureCount: features.count,
                effectiveRenderedFeatureCount: features.count,
                commitInteractionVisibility: labelFamilyState.labelObservation.commitInteractionVisibility,
                enableStickyLabelCandidates: labelFamilyState.labelObservation.stickyEnabled,
                stickyLockStableMsMoving: labelFamilyState.labelObservation.stickyLockStableMsMoving,
                stickyLockStableMsIdle: labelFamilyState.labelObservation.stickyLockStableMsIdle,
                stickyUnlockMissingMsMoving: labelFamilyState.labelObservation.stickyUnlockMissingMsMoving,
                stickyUnlockMissingMsIdle: labelFamilyState.labelObservation.stickyUnlockMissingMsIdle,
                stickyUnlockMissingStreakMoving: labelFamilyState.labelObservation.stickyUnlockMissingStreakMoving,
                labelResetRequestKey: labelFamilyState.labelObservation.configuredResetRequestKey
              )
              self.emit(
                Self.labelObservationEventPayload(from: snapshot)
                  .merging(["type": "label_observation_updated", "instanceId": instanceId]) { _, new in new }
              )
              self.completeLabelObservationRefresh(instanceId: instanceId)
              self.retryLabelObservationRefreshIfPlacementPending(instanceId: instanceId, delayMs: 16)
              return
            }
            handle.mapView.mapboxMap.queryRenderedFeatures(
              with: queryRect,
              options: queryOptions
            ) { fallbackResult in
              DispatchQueue.main.async {
                guard
                  let latestState = self.instances[instanceId],
                  latestState.visualSourceLifecycleState != .dismissing,
                  latestState.visualSourceLifecycleState != .dismissed
                else {
                  self.completeLabelObservationRefresh(instanceId: instanceId)
                  return
                }
                switch fallbackResult {
                case .failure:
                  self.completeLabelObservationRefresh(instanceId: instanceId)
                  self.retryLabelObservationRefreshIfPlacementPending(instanceId: instanceId, delayMs: 16)
                case .success(let fallbackFeatures):
                  if fallbackFeatures.isEmpty && self.shouldEmitLabelObservationQueryProbe(state: latestState) {
                    self.emitVisualDiag(
                      instanceId: instanceId,
                      message: "label_observation_query_probe \(self.labelObservationQueryProbeSummary(stage: "fallback_zero", state: latestState, resolvedLayerIds: resolvedLayerIds, queryRect: queryRect, renderedFeatureCount: fallbackFeatures.count))"
                    )
                  }
                  let fallbackObservation = Self.buildRenderedLabelObservation(
                    from: fallbackFeatures,
                    requiredSourceId: state.labelSourceId
                  )
                  let snapshot = self.commitRenderedLabelObservation(
                    instanceId: instanceId,
                    observation: fallbackObservation,
                    layerRenderedFeatureCount: features.count,
                    effectiveRenderedFeatureCount: fallbackFeatures.count,
                    commitInteractionVisibility: labelFamilyState.labelObservation.commitInteractionVisibility,
                    enableStickyLabelCandidates: labelFamilyState.labelObservation.stickyEnabled,
                    stickyLockStableMsMoving: labelFamilyState.labelObservation.stickyLockStableMsMoving,
                    stickyLockStableMsIdle: labelFamilyState.labelObservation.stickyLockStableMsIdle,
                    stickyUnlockMissingMsMoving: labelFamilyState.labelObservation.stickyUnlockMissingMsMoving,
                    stickyUnlockMissingMsIdle: labelFamilyState.labelObservation.stickyUnlockMissingMsIdle,
                    stickyUnlockMissingStreakMoving: labelFamilyState.labelObservation.stickyUnlockMissingStreakMoving,
                    labelResetRequestKey: labelFamilyState.labelObservation.configuredResetRequestKey
                  )
                  self.emit(
                    Self.labelObservationEventPayload(from: snapshot)
                      .merging(["type": "label_observation_updated", "instanceId": instanceId]) { _, new in new }
                  )
                  self.completeLabelObservationRefresh(instanceId: instanceId)
                  self.retryLabelObservationRefreshIfPlacementPending(instanceId: instanceId, delayMs: 16)
                }
              }
            }
          }
        }
      }
    } catch {
      completeLabelObservationRefresh(instanceId: instanceId)
      retryLabelObservationRefreshIfPlacementPending(instanceId: instanceId, delayMs: 16)
    }
  }

  private static func emptyRenderedLabelObservationResult() -> [String: Any] {
    [
      "visibleLabelFeatureIds": [],
      "placedLabels": [],
      "layerRenderedFeatureCount": 0,
      "effectiveRenderedFeatureCount": 0,
      "stickyChanged": false,
    ]
  }

  private static func labelObservationEventPayload(
    from snapshot: [String: Any]
  ) -> [String: Any] {
    return [
      "visibleLabelFeatureIds": snapshot["visibleLabelFeatureIds"] as? [String] ?? [],
      "layerRenderedFeatureCount": snapshot["layerRenderedFeatureCount"] as? Int ?? 0,
      "effectiveRenderedFeatureCount": snapshot["effectiveRenderedFeatureCount"] as? Int ?? 0,
      "stickyChanged": snapshot["stickyChanged"] as? Bool ?? false,
    ]
  }

  private static func buildRenderedLabelObservation(
    from features: [QueriedRenderedFeature],
    requiredSourceId: String
  ) -> (
    visibleLabelFeatureIds: [String],
    placedLabels: [RenderedPlacedLabelObservation]
  ) {
    var visibleLabelFeatureIds = Set<String>()
    var placedLabels: [RenderedPlacedLabelObservation] = []
    for feature in features {
      guard feature.queriedFeature.source == requiredSourceId,
            let parsed = Self.parseRenderedLabelObservationFeature(feature)
      else {
        continue
      }
      visibleLabelFeatureIds.insert(parsed.featureId)
      placedLabels.append(parsed.placedLabel)
    }
    let sortedVisibleLabelFeatureIds = Array(visibleLabelFeatureIds).sorted()
    return (
      visibleLabelFeatureIds: sortedVisibleLabelFeatureIds,
      placedLabels: placedLabels
    )
  }

  private static func parseRenderedLabelObservationFeature(
    _ feature: QueriedRenderedFeature
  ) -> (
    featureId: String,
    placedLabel: RenderedPlacedLabelObservation
  )? {
    let rawFeature = feature.queriedFeature.feature
    let properties = rawFeature.properties?.turfRawValue as? [String: Any]
    let featureId = rawFeature.identifier.flatMap(Self.featureIdentifierString)
    let parsedFeatureId = featureId.flatMap(Self.parseRenderedLabelCandidateFeatureId)
    let markerKey = (properties?["markerKey"] as? String) ?? parsedFeatureId?.markerKey
    guard let markerKey, !markerKey.isEmpty else {
      return nil
    }
    let candidate = Self.labelCandidateString(from: properties?["labelCandidate"]) ??
      parsedFeatureId?.candidate
    guard let candidate else {
      return nil
    }
    let restaurantId = properties?["restaurantId"] as? String
    return (
      featureId: featureId ?? Self.buildRenderedLabelCandidateFeatureId(markerKey: markerKey, candidate: candidate),
      placedLabel: RenderedPlacedLabelObservation(
        markerKey: markerKey,
        candidate: candidate,
        restaurantId: restaurantId
      )
    )
  }

  private static func serializeRenderedPlacedLabels(
    _ placedLabels: [RenderedPlacedLabelObservation]
  ) -> [[String: Any]] {
    placedLabels.map { placedLabel in
      [
        "markerKey": placedLabel.markerKey,
        "candidate": placedLabel.candidate,
        "restaurantId": placedLabel.restaurantId ?? NSNull(),
      ]
    }
  }

  private static func buildLabelStickyIdentityKey(
    restaurantId: String?,
    markerKey: String?
  ) -> String? {
    if let restaurantId, !restaurantId.isEmpty {
      return "restaurant:\(restaurantId)"
    }
    if let markerKey, !markerKey.isEmpty {
      return "marker:\(markerKey)"
    }
    return nil
  }

  private static func resetStickyLabelObservationIfNeeded(
    _ labelObservation: inout LabelFamilyObservationState,
    labelResetRequestKey: String?
  ) -> Set<String> {
    guard let labelResetRequestKey, !labelResetRequestKey.isEmpty else {
      return []
    }
    guard labelObservation.lastResetRequestKey != labelResetRequestKey else {
      return []
    }
    labelObservation.lastResetRequestKey = labelResetRequestKey
    let previousIdentityKeys = Set(labelObservation.stickyCandidateByIdentity.keys)
    labelObservation.stickyCandidateByIdentity = [:]
    labelObservation.stickyCommittedLastSeenAtMsByIdentity = [:]
    labelObservation.stickyCommittedMissingStreakByIdentity = [:]
    labelObservation.stickyProposedCandidateByIdentity = [:]
    labelObservation.stickyProposedSinceAtMsByIdentity = [:]
    if !previousIdentityKeys.isEmpty {
      labelObservation.stickyRevision += 1
    }
    return previousIdentityKeys
  }

  private static func updateStickyLabelObservation(
    _ labelObservation: inout LabelFamilyObservationState,
    placedLabels: [RenderedPlacedLabelObservation],
    isMoving: Bool,
    enableStickyLabelCandidates: Bool,
    stickyLockStableMsMoving: Double,
    stickyLockStableMsIdle: Double,
    stickyUnlockMissingMsMoving: Double,
    stickyUnlockMissingMsIdle: Double,
    stickyUnlockMissingStreakMoving: Int,
    nowMs: Double
  ) -> Set<String> {
    if !enableStickyLabelCandidates {
      let previousIdentityKeys = Set(labelObservation.stickyCandidateByIdentity.keys)
      labelObservation.stickyCandidateByIdentity = [:]
      labelObservation.stickyCommittedLastSeenAtMsByIdentity = [:]
      labelObservation.stickyCommittedMissingStreakByIdentity = [:]
      labelObservation.stickyProposedCandidateByIdentity = [:]
      labelObservation.stickyProposedSinceAtMsByIdentity = [:]
      if !previousIdentityKeys.isEmpty {
        labelObservation.stickyRevision += 1
      }
      return previousIdentityKeys
    }

    var renderedCandidateByIdentity: [String: String] = [:]
    for placedLabel in placedLabels {
      guard let stickyIdentityKey = Self.buildLabelStickyIdentityKey(
        restaurantId: placedLabel.restaurantId,
        markerKey: placedLabel.markerKey
      ) else {
        continue
      }
      if renderedCandidateByIdentity[stickyIdentityKey] == nil {
        renderedCandidateByIdentity[stickyIdentityKey] = placedLabel.candidate
      }
    }

    var changedIdentityKeys = Set<String>()
    for (stickyIdentityKey, candidate) in renderedCandidateByIdentity {
      labelObservation.stickyCommittedLastSeenAtMsByIdentity[stickyIdentityKey] = nowMs
      labelObservation.stickyCommittedMissingStreakByIdentity[stickyIdentityKey] = 0
      let lockedCandidate = labelObservation.stickyCandidateByIdentity[stickyIdentityKey]
      if lockedCandidate == candidate {
        labelObservation.stickyProposedCandidateByIdentity.removeValue(forKey: stickyIdentityKey)
        labelObservation.stickyProposedSinceAtMsByIdentity.removeValue(forKey: stickyIdentityKey)
        continue
      }

      if isMoving {
        labelObservation.stickyCandidateByIdentity[stickyIdentityKey] = candidate
        labelObservation.stickyProposedCandidateByIdentity.removeValue(forKey: stickyIdentityKey)
        labelObservation.stickyProposedSinceAtMsByIdentity.removeValue(forKey: stickyIdentityKey)
        changedIdentityKeys.insert(stickyIdentityKey)
        continue
      }

      let stableMs = isMoving ? stickyLockStableMsMoving : stickyLockStableMsIdle
      let proposedCandidate = labelObservation.stickyProposedCandidateByIdentity[stickyIdentityKey]
      if proposedCandidate != candidate {
        labelObservation.stickyProposedCandidateByIdentity[stickyIdentityKey] = candidate
        labelObservation.stickyProposedSinceAtMsByIdentity[stickyIdentityKey] = nowMs
        continue
      }
      let proposedSinceAt = labelObservation.stickyProposedSinceAtMsByIdentity[stickyIdentityKey] ?? nowMs
      if nowMs - proposedSinceAt < stableMs {
        continue
      }

      labelObservation.stickyCandidateByIdentity[stickyIdentityKey] = candidate
      labelObservation.stickyProposedCandidateByIdentity.removeValue(forKey: stickyIdentityKey)
      labelObservation.stickyProposedSinceAtMsByIdentity.removeValue(forKey: stickyIdentityKey)
      changedIdentityKeys.insert(stickyIdentityKey)
    }

    if !placedLabels.isEmpty {
      let unlockMs = isMoving ? stickyUnlockMissingMsMoving : stickyUnlockMissingMsIdle
      let requiredStreak = isMoving ? stickyUnlockMissingStreakMoving : 1
      for stickyIdentityKey in Array(labelObservation.stickyCandidateByIdentity.keys) {
        if renderedCandidateByIdentity[stickyIdentityKey] != nil {
          continue
        }
        let nextMissingStreak =
          (labelObservation.stickyCommittedMissingStreakByIdentity[stickyIdentityKey] ?? 0) + 1
        labelObservation.stickyCommittedMissingStreakByIdentity[stickyIdentityKey] = nextMissingStreak
        labelObservation.stickyProposedCandidateByIdentity.removeValue(forKey: stickyIdentityKey)
        labelObservation.stickyProposedSinceAtMsByIdentity.removeValue(forKey: stickyIdentityKey)
        let lastSeenAt = labelObservation.stickyCommittedLastSeenAtMsByIdentity[stickyIdentityKey] ?? 0
        if nextMissingStreak >= requiredStreak && nowMs - lastSeenAt > unlockMs {
          labelObservation.stickyCandidateByIdentity.removeValue(forKey: stickyIdentityKey)
          labelObservation.stickyCommittedLastSeenAtMsByIdentity.removeValue(forKey: stickyIdentityKey)
          labelObservation.stickyCommittedMissingStreakByIdentity.removeValue(forKey: stickyIdentityKey)
          changedIdentityKeys.insert(stickyIdentityKey)
        }
      }
    }

    if !changedIdentityKeys.isEmpty {
      labelObservation.stickyRevision += 1
    }
    return changedIdentityKeys
  }

  private static func buildRenderedDotPressTarget(
    from features: [QueriedRenderedFeature],
    requiredSourceId: String,
    tapCoordinate: (lng: Double, lat: Double)?
  ) -> [String: Any]? {
    var bestTarget: (
      restaurantId: String,
      coordinate: [String: Any]?,
      distance: Double,
      featureIndex: Int
    )?

    for (featureIndex, feature) in features.enumerated() {
      guard feature.queriedFeature.source == requiredSourceId,
            let parsed = Self.parseRenderedDotPressFeature(feature)
      else {
        continue
      }
      let distance: Double
      if let tapCoordinate, let coordinate = parsed.coordinate,
         let lng = coordinate["lng"] as? Double,
         let lat = coordinate["lat"] as? Double {
        let dx = tapCoordinate.lng - lng
        let dy = tapCoordinate.lat - lat
        distance = dx * dx + dy * dy
      } else {
        distance = Double(featureIndex)
      }
      guard let existing = bestTarget else {
        bestTarget = (
          restaurantId: parsed.restaurantId,
          coordinate: parsed.coordinate,
          distance: distance,
          featureIndex: featureIndex
        )
        continue
      }
      if distance < existing.distance ||
          (distance == existing.distance && featureIndex < existing.featureIndex) {
        bestTarget = (
          restaurantId: parsed.restaurantId,
          coordinate: parsed.coordinate,
          distance: distance,
          featureIndex: featureIndex
        )
      }
    }

    guard let bestTarget else {
      return nil
    }
    return [
      "restaurantId": bestTarget.restaurantId,
      "coordinate": bestTarget.coordinate ?? NSNull(),
      "targetKind": "dot",
    ]
  }

  private static func parseRenderedDotPressFeature(
    _ feature: QueriedRenderedFeature
  ) -> (
    restaurantId: String,
    coordinate: [String: Any]?
  )? {
    let rawFeature = feature.queriedFeature.feature
    let properties = rawFeature.properties?.turfRawValue as? [String: Any]
    guard let restaurantId = properties?["restaurantId"] as? String, !restaurantId.isEmpty else {
      return nil
    }
    var coordinatePayload: [String: Any]? = nil
    if let geometry = rawFeature.geometry,
       case let .point(point) = geometry {
      coordinatePayload = [
        "lng": point.coordinates.longitude,
        "lat": point.coordinates.latitude,
      ]
    }
    return (
      restaurantId: restaurantId,
      coordinate: coordinatePayload
    )
  }

  private static func buildRenderedPinPressTarget(
    from features: [QueriedRenderedFeature],
    requiredSourceId: String
  ) -> [String: Any]? {
    var candidates: [(
      restaurantId: String,
      coordinate: [String: Any]?,
      lodZ: Double,
      rank: Double,
      featureIndex: Int
    )] = []

    for (featureIndex, feature) in features.enumerated() {
      guard feature.queriedFeature.source == requiredSourceId,
            let parsed = Self.parseRenderedPinPressFeature(feature)
      else {
        continue
      }

      candidates.append((
        restaurantId: parsed.restaurantId,
        coordinate: parsed.coordinate,
        lodZ: parsed.lodZ,
        rank: parsed.rank,
        featureIndex: featureIndex
      ))
    }

    guard !candidates.isEmpty else {
      return nil
    }
    candidates.sort { left, right in
      if left.lodZ != right.lodZ {
        return left.lodZ > right.lodZ
      }
      if left.rank != right.rank {
        return left.rank < right.rank
      }
      return left.featureIndex < right.featureIndex
    }
    let bestTarget = candidates[0]
    return [
      "restaurantId": bestTarget.restaurantId,
      "coordinate": bestTarget.coordinate ?? NSNull(),
      "targetKind": "pin",
    ]
  }

  private static func parseRenderedPinPressFeature(
    _ feature: QueriedRenderedFeature
  ) -> (
    restaurantId: String,
    coordinate: [String: Any]?,
    lodZ: Double,
    rank: Double
  )? {
    let rawFeature = feature.queriedFeature.feature
    let properties = rawFeature.properties?.turfRawValue as? [String: Any]
    guard let restaurantId = properties?["restaurantId"] as? String, !restaurantId.isEmpty else {
      return nil
    }
    let lodZ =
      (properties?["nativeLodZ"] as? NSNumber)?.doubleValue ??
      (properties?["lodZ"] as? NSNumber)?.doubleValue ??
      -Double.greatestFiniteMagnitude
    let rank = (properties?["rank"] as? NSNumber)?.doubleValue ?? .greatestFiniteMagnitude
    var coordinatePayload: [String: Any]? = nil
    if let geometry = rawFeature.geometry,
       case let .point(point) = geometry {
      coordinatePayload = [
        "lng": point.coordinates.longitude,
        "lat": point.coordinates.latitude,
      ]
    }
    return (
      restaurantId: restaurantId,
      coordinate: coordinatePayload,
      lodZ: lodZ,
      rank: rank
    )
  }

  private static func buildRenderedLabelPressTarget(
    from features: [QueriedRenderedFeature],
    requiredSourceIds: Set<String>,
    tapPoint: CGPoint,
    mapboxMap: MapboxMap,
    hitbox: LabelTapHitboxConfig?
  ) -> [String: Any]? {
    for feature in features {
      guard requiredSourceIds.contains(feature.queriedFeature.source),
            let parsed = Self.parseRenderedLabelPressFeature(feature)
      else {
        continue
      }
      guard Self.isRenderedLabelPressFeatureIntentional(
        feature,
        tapPoint: tapPoint,
        mapboxMap: mapboxMap,
        hitbox: hitbox
      ) else {
        continue
      }
      return parsed
    }
    return nil
  }

  private static func parseLabelTapHitboxConfig(_ payload: Any?) -> LabelTapHitboxConfig? {
    guard let payload = payload as? [String: Any] else {
      return nil
    }
    guard
      let textSize = (payload["textSize"] as? NSNumber)?.doubleValue,
      let radialXEm = (payload["radialXEm"] as? NSNumber)?.doubleValue,
      let radialYEm = (payload["radialYEm"] as? NSNumber)?.doubleValue,
      let radialTopEm = (payload["radialTopEm"] as? NSNumber)?.doubleValue,
      let upShiftEm = (payload["upShiftEm"] as? NSNumber)?.doubleValue,
      let charWidthFactor = (payload["charWidthFactor"] as? NSNumber)?.doubleValue,
      let lineHeightFactor = (payload["lineHeightFactor"] as? NSNumber)?.doubleValue,
      let paddingPx = (payload["paddingPx"] as? NSNumber)?.doubleValue,
      let minWidthPx = (payload["minWidthPx"] as? NSNumber)?.doubleValue,
      let maxWidthPx = (payload["maxWidthPx"] as? NSNumber)?.doubleValue
    else {
      return nil
    }
    return LabelTapHitboxConfig(
      textSize: CGFloat(textSize),
      radialXEm: CGFloat(radialXEm),
      radialYEm: CGFloat(radialYEm),
      radialTopEm: CGFloat(radialTopEm),
      upShiftEm: CGFloat(upShiftEm),
      charWidthFactor: CGFloat(charWidthFactor),
      lineHeightFactor: CGFloat(lineHeightFactor),
      paddingPx: CGFloat(paddingPx),
      minWidthPx: CGFloat(minWidthPx),
      maxWidthPx: CGFloat(maxWidthPx)
    )
  }

  private static func isRenderedLabelPressFeatureIntentional(
    _ feature: QueriedRenderedFeature,
    tapPoint: CGPoint,
    mapboxMap: MapboxMap,
    hitbox: LabelTapHitboxConfig?
  ) -> Bool {
    guard let hitbox else {
      return false
    }
    let rawFeature = feature.queriedFeature.feature
    guard case let .point(pointGeometry) = rawFeature.geometry else {
      return false
    }
    let properties = rawFeature.properties?.turfRawValue as? [String: Any]
    let featureId = rawFeature.identifier.flatMap(Self.featureIdentifierString)
    let parsedFeatureId = featureId.flatMap(Self.parseRenderedLabelCandidateFeatureId)
    let candidate =
      Self.labelCandidateString(from: properties?["labelCandidate"]) ??
      parsedFeatureId?.candidate
    guard let candidate else {
      return false
    }
    let labelText = properties?["restaurantName"] as? String
    guard let labelText, !labelText.isEmpty else {
      return false
    }

    let lines = labelText.split(separator: "\n", omittingEmptySubsequences: false)
    let longestLineLength = lines.reduce(0) { max($0, $1.count) }
    let estimatedWidth = min(
      max(CGFloat(longestLineLength) * hitbox.textSize * hitbox.charWidthFactor + 10, hitbox.minWidthPx),
      hitbox.maxWidthPx
    )
    let estimatedHeight =
      max(CGFloat(lines.count), 1) * hitbox.textSize * hitbox.lineHeightFactor + 4

    var offsetXPx: CGFloat = 0
    var offsetYPx: CGFloat = 0
    switch candidate {
    case "bottom":
      offsetYPx = (hitbox.radialYEm - hitbox.upShiftEm) * hitbox.textSize
    case "right":
      offsetXPx = hitbox.radialXEm * hitbox.textSize
      offsetYPx = -hitbox.upShiftEm * hitbox.textSize
    case "top":
      offsetYPx = -(hitbox.radialTopEm + hitbox.upShiftEm) * hitbox.textSize
    case "left":
      offsetXPx = -hitbox.radialXEm * hitbox.textSize
      offsetYPx = -hitbox.upShiftEm * hitbox.textSize
    default:
      return false
    }

    let anchorCoordinate = CLLocationCoordinate2D(
      latitude: pointGeometry.coordinates.latitude,
      longitude: pointGeometry.coordinates.longitude
    )
    let anchorPoint = mapboxMap.point(for: anchorCoordinate)
    let anchorX = anchorPoint.x + offsetXPx
    let anchorY = anchorPoint.y + offsetYPx

    var left = anchorX - estimatedWidth / 2
    var right = anchorX + estimatedWidth / 2
    var top = anchorY - estimatedHeight / 2
    var bottom = anchorY + estimatedHeight / 2

    switch candidate {
    case "bottom":
      top = anchorY
      bottom = anchorY + estimatedHeight
    case "top":
      top = anchorY - estimatedHeight
      bottom = anchorY
    case "left":
      left = anchorX - estimatedWidth
      right = anchorX
    case "right":
      left = anchorX
      right = anchorX + estimatedWidth
    default:
      break
    }

    return tapPoint.x >= left - hitbox.paddingPx &&
      tapPoint.x <= right + hitbox.paddingPx &&
      tapPoint.y >= top - hitbox.paddingPx &&
      tapPoint.y <= bottom + hitbox.paddingPx
  }

  private static func parseRenderedLabelPressFeature(
    _ feature: QueriedRenderedFeature
  ) -> [String: Any]? {
    let rawFeature = feature.queriedFeature.feature
    let properties = rawFeature.properties?.turfRawValue as? [String: Any]
    guard let restaurantId = properties?["restaurantId"] as? String, !restaurantId.isEmpty else {
      return nil
    }
    var coordinatePayload: [String: Any]? = nil
    if let geometry = rawFeature.geometry,
       case let .point(point) = geometry {
      coordinatePayload = [
        "lng": point.coordinates.longitude,
        "lat": point.coordinates.latitude,
      ]
    }
    return [
      "restaurantId": restaurantId,
      "coordinate": coordinatePayload ?? NSNull(),
      "targetKind": "label",
    ]
  }

  private static func parseRenderedLabelCandidateFeatureId(
    _ featureId: String
  ) -> (
    markerKey: String,
    candidate: String
  )? {
    let delimiter = "::label::"
    guard let range = featureId.range(of: delimiter, options: .backwards) else {
      return nil
    }
    let markerKey = String(featureId[..<range.lowerBound])
    let candidate = String(featureId[range.upperBound...])
    guard !markerKey.isEmpty, let normalizedCandidate = labelCandidateString(from: candidate) else {
      return nil
    }
    return (
      markerKey: markerKey,
      candidate: normalizedCandidate
    )
  }

  private static func buildRenderedLabelCandidateFeatureId(
    markerKey: String,
    candidate: String
  ) -> String {
    "\(markerKey)::label::\(candidate)"
  }

  private static func labelCandidateString(from value: Any?) -> String? {
    guard let candidate = value as? String else {
      return nil
    }
    switch candidate {
    case "bottom", "right", "top", "left":
      return candidate
    default:
      return nil
    }
  }

  private func resolveRenderedProbeLayerIds(
    for sourceIds: [String],
    mapboxMap: MapboxMap
  ) throws -> [String] {
    let sourceIdSet = Set(sourceIds)
    guard !sourceIdSet.isEmpty else {
      return []
    }
    return try mapboxMap.allLayerIdentifiers.compactMap { layerInfo in
      let properties = try mapboxMap.layerProperties(for: layerInfo.id)
      guard let sourceId = properties["source"] as? String, sourceIdSet.contains(sourceId) else {
        return nil
      }
      return layerInfo.id
    }
  }

  private func managedSourceIds(for state: InstanceState) -> [String] {
    [
      state.pinSourceId,
      state.pinInteractionSourceId,
      state.dotSourceId,
      state.dotInteractionSourceId,
      state.labelSourceId,
      state.labelInteractionSourceId,
      state.labelCollisionSourceId,
    ]
  }

  private func requiredSourceIds(for state: InstanceState) -> [String] {
    managedSourceIds(for: state) + [overlayZAnchorSourceId]
  }

  private func ensureSourcesReady(
    for mapTag: NSNumber,
    instanceId: String?,
    state: inout InstanceState,
    sourceIds: [String],
    reason: String,
    allowRecoveryEscalation: Bool = true
  ) throws -> Bool {
    let uniqueSourceIds = Array(Set(sourceIds)).sorted()
    guard !uniqueSourceIds.isEmpty else {
      return true
    }
    let arePresent = try withMapboxMapResult(for: mapTag) { mapboxMap in
      uniqueSourceIds.allSatisfy { mapboxMap.sourceExists(withId: $0) }
    }
    if arePresent {
      return true
    }
    if !allowRecoveryEscalation && !Self.isSourceRecoveryActive(state) {
      emit([
        "type": "error",
        "instanceId": "__native_diag__",
        "message":
          "source_ready_skip reason=\(reason) mapTag=\(mapTag.stringValue) sources=\(uniqueSourceIds.joined(separator: ","))",
      ])
      return false
    }
    state.isAwaitingSourceRecovery = true
    state.isReplayingSourceRecovery = false
    if state.sourceRecoveryPausedAtMs == nil {
      state.sourceRecoveryPausedAtMs = Self.nowMs()
    }
    if let instanceId {
      instances[instanceId] = state
      scheduleSourceRecoveryReplay(instanceId: instanceId, reason: reason)
    }
    return false
  }

  private func beginSourceRecovery(
    instanceId: String,
    state: inout InstanceState,
    reason: String,
    resetTrackedSources: Bool
  ) {
    if resetTrackedSources {
      state.pendingSourceCommitDataIdsBySourceId = [:]
      state.pendingPresentationSettleRequestKey = nil
      state.pendingPresentationSettleKind = nil
      state.blockedEnterStartRequestKey = nil
      state.blockedEnterStartCommitFenceStartedAtMs = nil
      state.blockedPresentationSettleRequestKey = nil
      state.blockedPresentationSettleKind = nil
      state.blockedPresentationCommitFenceStartedAtMs = nil
      state.blockedEnterStartCommitFenceBySourceId = [:]
      state.blockedPresentationCommitFenceBySourceId = [:]
      revealFrameFallbackWorkItems[instanceId]?.cancel()
      revealFrameFallbackWorkItems[instanceId] = nil
      dismissFrameFallbackWorkItems[instanceId]?.cancel()
      dismissFrameFallbackWorkItems[instanceId] = nil
      sourceRecoveryWorkItems[instanceId]?.cancel()
      sourceRecoveryWorkItems[instanceId] = nil
      emitVisualDiag(
        instanceId: instanceId,
        message: "source_recovery_begin reason=\(reason) \(recoveryContextSummary(for: state))"
      )
    }
    cancelLivePinTransitionAnimation(instanceId: instanceId)
    state.isAwaitingSourceRecovery = true
    state.isReplayingSourceRecovery = false
    if state.sourceRecoveryPausedAtMs == nil {
      state.sourceRecoveryPausedAtMs = Self.nowMs()
    }
    instances[instanceId] = state
    scheduleSourceRecoveryReplay(instanceId: instanceId, reason: reason)
  }

  private func withReadyMapboxMap(
    for mapTag: NSNumber,
    instanceId: String?,
    state: inout InstanceState,
    sourceIds: [String],
    reason: String,
    allowRecoveryEscalation: Bool = true,
    _ block: (MapboxMap) throws -> Void
  ) throws -> Bool {
    guard let mapboxMap = try readyMapboxMap(
      for: mapTag,
      instanceId: instanceId,
      state: &state,
      sourceIds: sourceIds,
      reason: reason,
      allowRecoveryEscalation: allowRecoveryEscalation
    ) else {
      return false
    }
    try block(mapboxMap)
    return true
  }

  private func readyMapboxMap(
    for mapTag: NSNumber,
    instanceId: String?,
    state: inout InstanceState,
    sourceIds: [String],
    reason: String,
    allowRecoveryEscalation: Bool = true
  ) throws -> MapboxMap? {
    let uniqueSourceIds = Array(Set(sourceIds)).sorted()
    guard let resolution = currentResolvedMapHandleResolution(for: mapTag) else {
      let cacheKey = mapTag.stringValue
      emit([
        "type": "error",
        "instanceId": "__native_diag__",
        "message": "map_lookup_cache_miss_unresolved tag=\(cacheKey) bridge=\(bridge != nil)",
      ])
      throw NSError(
        domain: "SearchMapRenderController",
        code: 14,
        userInfo: [NSLocalizedDescriptionKey: "SearchMapRenderController ready Mapbox handle not resolved for react tag \(mapTag)"]
      )
    }
    installMapSubscriptions(for: mapTag, handle: resolution.handle)
    if resolution.didRefresh {
      if let instanceId {
        emitVisualDiag(
          instanceId: instanceId,
          message: "map_handle_refresh_context reason=\(reason) \(recoveryContextSummary(for: state))"
        )
        beginSourceRecovery(
          instanceId: instanceId,
          state: &state,
          reason: "\(reason)_map_handle_refresh",
          resetTrackedSources: true
        )
      } else {
        state.isAwaitingSourceRecovery = true
        state.isReplayingSourceRecovery = false
        if state.sourceRecoveryPausedAtMs == nil {
          state.sourceRecoveryPausedAtMs = Self.nowMs()
        }
      }
      return nil
    }
    let arePresent =
      uniqueSourceIds.isEmpty ||
      uniqueSourceIds.allSatisfy { resolution.handle.mapView.mapboxMap.sourceExists(withId: $0) }
    if !arePresent {
      if !allowRecoveryEscalation && !Self.isSourceRecoveryActive(state) {
        emit([
          "type": "error",
          "instanceId": "__native_diag__",
          "message":
            "source_ready_skip reason=\(reason) mapTag=\(mapTag.stringValue) sources=\(uniqueSourceIds.joined(separator: ","))",
        ])
        return nil
      }
      if let instanceId {
        beginSourceRecovery(
          instanceId: instanceId,
          state: &state,
          reason: reason,
          resetTrackedSources: !Self.isSourceRecoveryActive(state)
        )
      } else {
        state.isAwaitingSourceRecovery = true
        state.isReplayingSourceRecovery = false
        if state.sourceRecoveryPausedAtMs == nil {
          state.sourceRecoveryPausedAtMs = Self.nowMs()
        }
      }
      return nil
    }
    return resolution.handle.mapView.mapboxMap
  }

  private func scheduleSourceRecoveryReplay(instanceId: String, reason: String, attempt: Int = 0) {
    guard sourceRecoveryWorkItems[instanceId] == nil else {
      return
    }
    let workItem = DispatchWorkItem { [weak self] in
      guard let self else {
        return
      }
      self.sourceRecoveryWorkItems[instanceId] = nil
      guard var state = self.instances[instanceId] else {
        return
      }
      do {
        guard try self.ensureSourcesReady(
          for: state.mapTag,
          instanceId: instanceId,
          state: &state,
          sourceIds: self.requiredSourceIds(for: state),
          reason: "source_recovery_wait"
        ) else {
          if attempt < 120 {
            self.scheduleSourceRecoveryReplay(instanceId: instanceId, reason: reason, attempt: attempt + 1)
          }
          return
        }
        if let pausedAtMs = state.sourceRecoveryPausedAtMs {
          let deltaMs = max(0, Self.nowMs() - pausedAtMs)
          if deltaMs > 0 {
            var pinFamilyState = Self.derivedFamilyState(sourceId: state.pinSourceId, state: state)
            for markerKey in pinFamilyState.livePinTransitionsByMarkerKey.keys {
              if pinFamilyState.livePinTransitionsByMarkerKey[markerKey]?.isAwaitingSourceCommit == false {
                pinFamilyState.livePinTransitionsByMarkerKey[markerKey]?.startedAtMs += deltaMs
              }
            }
            Self.setDerivedFamilyState(pinFamilyState, sourceId: state.pinSourceId, state: &state)
          }
        }
        state.isAwaitingSourceRecovery = false
        state.isReplayingSourceRecovery = true
        self.instances[instanceId] = state
        try self.reconcileAndApplyCurrentFrameSnapshots(
          for: instanceId,
          allowNewTransitions: false,
          allowDuringRecovery: true
        )
        guard var updatedState = self.instances[instanceId] else {
          return
        }
        guard updatedState.isReplayingSourceRecovery, !updatedState.isAwaitingSourceRecovery else {
          if attempt < 120 {
            self.scheduleSourceRecoveryReplay(instanceId: instanceId, reason: reason, attempt: attempt + 1)
          }
          return
        }
        try self.applyHighlightedMarkerState(
          for: updatedState,
          instanceId: instanceId,
          allowDuringRecovery: true
        )
        updatedState = self.instances[instanceId] ?? updatedState
        guard updatedState.isReplayingSourceRecovery, !updatedState.isAwaitingSourceRecovery else {
          if attempt < 120 {
            self.scheduleSourceRecoveryReplay(instanceId: instanceId, reason: reason, attempt: attempt + 1)
          }
          return
        }
        if self.shouldSuppressInteractions(state: updatedState) {
          try self.applyInteractionSuppression(
            for: &updatedState,
            instanceId: instanceId,
            allowDuringRecovery: true
          )
        }
        updatedState = self.instances[instanceId] ?? updatedState
        guard updatedState.isReplayingSourceRecovery, !updatedState.isAwaitingSourceRecovery else {
          if attempt < 120 {
            self.scheduleSourceRecoveryReplay(instanceId: instanceId, reason: reason, attempt: attempt + 1)
          }
          return
        }
        try self.applyCurrentPresentationOpacity(
          for: &updatedState,
          instanceId: instanceId,
          reason: "style_reload_replay",
          allowDuringRecovery: true
        )
        updatedState = self.instances[instanceId] ?? updatedState
        guard updatedState.isReplayingSourceRecovery, !updatedState.isAwaitingSourceRecovery else {
          if attempt < 120 {
            self.scheduleSourceRecoveryReplay(instanceId: instanceId, reason: reason, attempt: attempt + 1)
          }
          return
        }
        self.promoteBlockedCommitFencesIfReady(instanceId: instanceId, state: &updatedState)
        updatedState.isAwaitingSourceRecovery = false
        updatedState.isReplayingSourceRecovery = false
        updatedState.isOwnerInvalidated = false
        updatedState.sourceRecoveryPausedAtMs = nil
        self.instances[instanceId] = updatedState
        self.emit([
          "type": "render_owner_recovered_after_style_reload",
          "instanceId": instanceId,
          "frameGenerationId": updatedState.activeFrameGenerationId as Any,
          "ownerEpoch": updatedState.ownerEpoch,
          "recoveredAtMs": Self.nowMs(),
        ])
      } catch {
        if attempt < 120 {
          self.scheduleSourceRecoveryReplay(instanceId: instanceId, reason: reason, attempt: attempt + 1)
        } else {
          self.emit([
            "type": "error",
            "instanceId": instanceId,
            "message": "style reload replay failed: \(error.localizedDescription)",
          ])
        }
      }
    }
    sourceRecoveryWorkItems[instanceId] = workItem
    DispatchQueue.main.asyncAfter(
      deadline: .now() + .milliseconds(sourceRecoveryRetryDelayMs),
      execute: workItem
    )
  }

  private func withMapboxMap(
    for mapTag: NSNumber,
    _ block: (MapboxMap) throws -> Void
  ) throws {
    if let resolvedHandle = currentResolvedMapHandle(for: mapTag) {
      installMapSubscriptions(for: mapTag, handle: resolvedHandle)
      try block(resolvedHandle.mapView.mapboxMap)
      return
    }
    let cacheKey = mapTag.stringValue
    emit([
      "type": "error",
      "instanceId": "__native_diag__",
      "message": "map_lookup_cache_miss_unresolved tag=\(cacheKey) bridge=\(bridge != nil)",
    ])
    throw NSError(
      domain: "SearchMapRenderController",
      code: 4,
      userInfo: [NSLocalizedDescriptionKey: "SearchMapRenderController diag-v2: Mapbox MapView not resolved for react tag \(mapTag)"]
    )
  }

  private func withMapboxMapResult<T>(
    for mapTag: NSNumber,
    _ block: (MapboxMap) throws -> T
  ) throws -> T {
    var result: T?
    try withMapboxMap(for: mapTag) { mapboxMap in
      result = try block(mapboxMap)
    }
    if let result {
      return result
    }
    throw NSError(
      domain: "SearchMapRenderController",
      code: 12,
      userInfo: [NSLocalizedDescriptionKey: "SearchMapRenderController missing Mapbox result for react tag \(mapTag)"]
    )
  }

  private func withResolvedMapHandleResult<T>(
    for mapTag: NSNumber,
    _ block: (ResolvedMapHandle) throws -> T
  ) throws -> T {
    if let resolvedHandle = currentResolvedMapHandle(for: mapTag) {
      installMapSubscriptions(for: mapTag, handle: resolvedHandle)
      return try block(resolvedHandle)
    }
    let cacheKey = mapTag.stringValue
    emit([
      "type": "error",
      "instanceId": "__native_diag__",
      "message": "map_lookup_cache_miss_unresolved tag=\(cacheKey) bridge=\(bridge != nil)",
    ])
    throw NSError(
      domain: "SearchMapRenderController",
      code: 13,
      userInfo: [NSLocalizedDescriptionKey: "SearchMapRenderController missing resolved Mapbox handle for react tag \(mapTag)"]
    )
  }

  private static func pointerSummary(_ object: AnyObject?) -> String {
    guard let object else {
      return "nil"
    }
    return String(describing: Unmanaged.passUnretained(object).toOpaque())
  }

  private static func reactTagSummary(for view: UIView?) -> String {
    guard let view else {
      return "nil"
    }
    if let reactTag = view.value(forKey: "reactTag") as? NSNumber {
      return reactTag.stringValue
    }
    return "nil"
  }

  private static func windowSummary(for view: UIView) -> String {
    guard let window = view.window else {
      return "nil"
    }
    return "\(shortTypeName(window))@\(pointerSummary(window))"
  }

  private static func handleIdentitySummary(_ handle: ResolvedMapHandle) -> String {
    "root=\(shortTypeName(handle.rootView))@\(pointerSummary(handle.rootView)) rootTag=\(reactTagSummary(for: handle.rootView)) map=\(shortTypeName(handle.mapView))@\(pointerSummary(handle.mapView)) mapTag=\(reactTagSummary(for: handle.mapView)) window=\(windowSummary(for: handle.mapView))"
  }

  private func emitMapTagDiag(mapTag: NSNumber, message: String) {
    let instanceIds = instances.compactMap { $0.value.mapTag == mapTag ? $0.key : nil }
    if instanceIds.isEmpty {
      emit([
        "type": "error",
        "instanceId": "__native_diag__",
        "message": message,
      ])
      return
    }
    for instanceId in instanceIds.sorted() {
      emitVisualDiag(instanceId: instanceId, message: message)
    }
  }

  private func installLifecycleProbes(for mapTag: NSNumber, handle: ResolvedMapHandle) {
    let installProbe = { [weak self] (parentView: UIView, probeName: String) -> ViewLifecycleProbeView in
      let probeIdentifier = "search-map-probe-\(probeName)"
      if let existingProbe = parentView.subviews.first(where: { $0.accessibilityIdentifier == probeIdentifier }) as? ViewLifecycleProbeView {
        return existingProbe
      }
      let probe = ViewLifecycleProbeView(probeName: probeName)
      probe.onEvent = { [weak self, weak probe, weak parentView] eventName in
        DispatchQueue.main.async {
          guard let self else {
            return
          }
          let parentSummary = parentView.map {
            "\(Self.shortTypeName($0))@\(Self.pointerSummary($0)) tag=\(Self.reactTagSummary(for: $0))"
          } ?? "nil"
          let probeWindowSummary = probe?.window.map {
            "\(Self.shortTypeName($0))@\(Self.pointerSummary($0))"
          } ?? "nil"
          self.emitMapTagDiag(
            mapTag: mapTag,
            message:
              "view_lifecycle_probe probe=\(probeName) event=\(eventName) parent=\(parentSummary) probeWindow=\(probeWindowSummary)"
          )
        }
      }
      parentView.addSubview(probe)
      return probe
    }

    if handle.rootLifecycleProbeView == nil {
      handle.rootLifecycleProbeView = installProbe(handle.rootView, "root")
    }
    if handle.mapLifecycleProbeView == nil {
      handle.mapLifecycleProbeView = installProbe(handle.mapView, "map")
    }
  }

  private func installMapSubscriptions(for mapTag: NSNumber, handle: ResolvedMapHandle) {
    installLifecycleProbes(for: mapTag, handle: handle)
    if handle.sourceDataLoadedCancelable == nil {
      handle.sourceDataLoadedCancelable = handle.mapView.mapboxMap.onSourceDataLoaded.observe { [weak self] event in
        DispatchQueue.main.async {
          self?.handleSourceDataLoaded(mapTag: mapTag, event: event)
        }
      }
    }
    if handle.styleLoadedCancelable == nil {
      handle.styleLoadedCancelable = handle.mapView.mapboxMap.onStyleLoaded.observe { [weak self] _ in
        DispatchQueue.main.async {
          self?.handleStyleLoaded(mapTag: mapTag)
        }
      }
    }
    if handle.cameraChangedCancelable == nil {
      handle.cameraChangedCancelable = handle.mapView.mapboxMap.onCameraChanged.observe { [weak self, weak handle] _ in
        guard let self, let handle else {
          return
        }
        DispatchQueue.main.async {
          self.handleNativeCameraChanged(mapTag: mapTag, handle: handle, isMoving: true)
        }
      }
    }
    if handle.mapIdleCancelable == nil {
      handle.mapIdleCancelable = handle.mapView.mapboxMap.onMapIdle.observe { [weak self, weak handle] _ in
        guard let self, let handle else {
          return
        }
        DispatchQueue.main.async {
          self.handleNativeCameraChanged(mapTag: mapTag, handle: handle, isMoving: false)
        }
      }
    }
    if !handle.isGestureObserverRegistered {
      if let gestureDelegateHostView = handle.gestureDelegateHostView {
        if Self.addGestureDelegate(handle.gestureObserver, to: gestureDelegateHostView) {
          handle.isGestureObserverRegistered = true
        }
      }
    }
  }

  private func currentResolvedMapHandleResolution(
    for mapTag: NSNumber
  ) -> ResolvedMapHandleResolution? {
    let cacheKey = mapTag.stringValue
    if let cachedHandle = resolvedMapHandles[cacheKey] {
      if cachedHandle.rootView.window != nil, cachedHandle.mapView.window != nil {
        return ResolvedMapHandleResolution(handle: cachedHandle, didRefresh: false)
      }
      if let liveHandle = lookupMapHandle(for: mapTag, emitDiagnostic: false) {
        let sameRoot = cachedHandle.rootView === liveHandle.rootView
        let sameMap = cachedHandle.mapView === liveHandle.mapView
        if !sameRoot || !sameMap {
          cachedHandle.cancelSubscriptions()
          resolvedMapHandles[cacheKey] = liveHandle
          emitMapTagDiag(
            mapTag: mapTag,
            message:
              "map_handle_refresh reason=cached_detached old{\(Self.handleIdentitySummary(cachedHandle))} new{\(Self.handleIdentitySummary(liveHandle))} sameRoot=\(Self.intFlag(sameRoot)) sameMap=\(Self.intFlag(sameMap))"
          )
          return ResolvedMapHandleResolution(handle: liveHandle, didRefresh: true)
        }
      }
      return ResolvedMapHandleResolution(handle: cachedHandle, didRefresh: false)
    }
    if let resolvedHandle = lookupMapHandle(for: mapTag) {
      resolvedMapHandles[cacheKey] = resolvedHandle
      return ResolvedMapHandleResolution(handle: resolvedHandle, didRefresh: false)
    }
    return nil
  }

  private func currentResolvedMapHandle(for mapTag: NSNumber) -> ResolvedMapHandle? {
    currentResolvedMapHandleResolution(for: mapTag)?.handle
  }

  private func cleanupMapHandleIfUnused(for mapTag: NSNumber) {
    guard !instances.values.contains(where: { $0.mapTag == mapTag }) else {
      return
    }
    let key = mapTag.stringValue
    resolvedMapHandles[key]?.cancelSubscriptions()
    resolvedMapHandles.removeValue(forKey: key)
    lastHandleIdentitySignatureByMapTag.removeValue(forKey: key)
  }

  private func handleSourceDataLoaded(mapTag: NSNumber, event: SourceDataLoaded) {
    let sourceId = event.sourceId
    guard let dataId = event.dataId else {
      return
    }
    if event.loaded == false {
      return
    }
    for instanceId in Array(instances.keys) {
      guard var state = instances[instanceId], state.mapTag == mapTag else {
        continue
      }
      guard var pendingDataIds = state.pendingSourceCommitDataIdsBySourceId[sourceId] else {
        continue
      }
      guard Self.removeCommittedPendingDataIds(
        sourceId: sourceId,
        acknowledgedDataId: dataId,
        pendingDataIds: &pendingDataIds
      ) else {
        continue
      }
      if pendingDataIds.isEmpty {
        state.pendingSourceCommitDataIdsBySourceId.removeValue(forKey: sourceId)
      } else {
        state.pendingSourceCommitDataIdsBySourceId[sourceId] = pendingDataIds
      }
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "source_commit_ack sourceId=\(sourceId) dataId=\(dataId) pending=\(hasPendingCommitFence(capturePendingVisualSourceCommitFence(state: state)) ? describeCommitFence(capturePendingVisualSourceCommitFence(state: state)) : "none") \(commitFenceWaitSummary(state: state))"
      )
      removeCommittedPendingDataIds(
        sourceId: sourceId,
        acknowledgedDataId: dataId,
        fenceBySourceId: &state.blockedEnterStartCommitFenceBySourceId
      )
      removeCommittedPendingDataIds(
        sourceId: sourceId,
        acknowledgedDataId: dataId,
        fenceBySourceId: &state.blockedPresentationCommitFenceBySourceId
      )
      if sourceId == state.pinSourceId {
        startAwaitingLivePinTransitions(
          instanceId: instanceId,
          dataId: dataId,
          reason: "source_commit_ack",
          state: &state
        )
      }
      if sourceId == state.dotSourceId {
        startAwaitingLiveDotTransitions(
          instanceId: instanceId,
          dataId: dataId,
          reason: "source_commit_ack",
          state: &state
        )
      }
      if sourceId == state.labelSourceId {
        let labelObservation = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state).labelObservation
        let refreshDelayMs = state.currentViewportIsMoving
          ? labelObservation.refreshMsMoving
          : labelObservation.refreshMsIdle
        if labelObservation.observationEnabled {
          scheduleLabelObservationRefresh(instanceId: instanceId, delayMs: refreshDelayMs)
        }
      }
      promoteBlockedCommitFencesIfReady(instanceId: instanceId, state: &state)
      instances[instanceId] = state
    }
  }

  private func handleStyleLoaded(mapTag: NSNumber) {
    for instanceId in Array(instances.keys) {
      guard var state = instances[instanceId], state.mapTag == mapTag else {
        continue
      }
      beginSourceRecovery(
        instanceId: instanceId,
        state: &state,
        reason: "style_loaded",
        resetTrackedSources: true
      )
    }
  }

  private func handleNativeCameraChanged(
    mapTag: NSNumber,
    handle: ResolvedMapHandle,
    isMoving: Bool
  ) {
    let cameraState = handle.mapView.mapboxMap.cameraState
    let center = cameraState.center
    let visibleBounds = handle.mapView.mapboxMap.coordinateBounds(for: handle.mapView.bounds)
    let signature = [
      String(Int((center.latitude * 10_000).rounded())),
      String(Int((center.longitude * 10_000).rounded())),
      String(Int((cameraState.zoom * 100).rounded())),
    ].joined(separator: "|")
    if isMoving && handle.lastNativeCameraDiagSignature == signature {
      return
    }
    let now = Self.nowMs()
    if isMoving && now - handle.lastNativeCameraDiagAtMs < nativeViewportEventThrottleMs {
      return
    }
    handle.lastNativeCameraDiagAtMs = now
    handle.lastNativeCameraDiagSignature = signature
    for (instanceId, state) in instances where state.mapTag == mapTag {
      var nextState = state
      nextState.currentViewportIsMoving = isMoving
      instances[instanceId] = nextState
      let labelObservation = Self.derivedFamilyState(sourceId: nextState.labelSourceId, state: nextState).labelObservation
      if labelObservation.observationEnabled {
        let refreshDelayMs = isMoving ? labelObservation.refreshMsMoving : 0
        scheduleLabelObservationRefresh(instanceId: instanceId, delayMs: refreshDelayMs)
      }
      emit([
        "type": "camera_changed",
        "instanceId": instanceId,
        "centerLat": center.latitude,
        "centerLng": center.longitude,
        "zoom": cameraState.zoom,
        "northEastLat": visibleBounds.northeast.latitude,
        "northEastLng": visibleBounds.northeast.longitude,
        "southWestLat": visibleBounds.southwest.latitude,
        "southWestLng": visibleBounds.southwest.longitude,
        "isGestureActive": handle.gestureObserver.isGestureActive,
        "isMoving": isMoving,
      ])
    }
  }

  private func registerPendingSourceCommit(
    instanceId: String,
    sourceId: String,
    mutationSummary: MutationSummary,
    state: inout InstanceState
  ) {
    guard mutationSummary.hasMutations, let dataId = mutationSummary.dataId else {
      return
    }
    state.pendingSourceCommitDataIdsBySourceId[sourceId, default: []].insert(dataId)
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "source_commit_pending sourceId=\(sourceId) dataId=\(dataId) pending=\(describeCommitFence(capturePendingVisualSourceCommitFence(state: state))) \(commitFenceWaitSummary(state: state))"
    )
  }

  private static func nextSourceCommitDataId(
    sourceId: String,
    state: inout InstanceState
  ) -> String {
    state.nextSourceCommitSequence += 1
    return "\(sourceId)::\(state.nextSourceCommitSequence)"
  }

  private func promoteBlockedCommitFencesIfReady(instanceId: String, state: inout InstanceState) {
    if let blockedEnterStartRequestKey = state.blockedEnterStartRequestKey,
       !hasPendingCommitFence(state.blockedEnterStartCommitFenceBySourceId) {
      let blockedWaitMs = state.blockedEnterStartCommitFenceStartedAtMs.map { max(0, Int((Self.nowMs() - $0).rounded())) }
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "reveal_start_commit_fence_cleared waitMs=\(blockedWaitMs.map(String.init) ?? "nil") pending=none \(commitFenceWaitSummary(state: state))"
      )
      state.blockedEnterStartRequestKey = nil
      state.blockedEnterStartCommitFenceStartedAtMs = nil
      state.blockedEnterStartCommitFenceBySourceId.removeAll()
      state.currentPresentationRenderPhase = "reveal_preroll"
      instances[instanceId] = state
      maybeEmitExecutionBatchArmed(instanceId: instanceId, state: &state)
      if
        let presentationStateJSON = state.lastPresentationStateJSON,
        Self.readEnterStatus(fromJSON: presentationStateJSON) == "entering",
        let revealStartToken = Self.readEnterStartToken(fromJSON: presentationStateJSON)
      {
        do {
          try startEnterPresentation(
            instanceId: instanceId,
            requestKey: blockedEnterStartRequestKey,
            revealStartToken: revealStartToken
          )
          state = instances[instanceId] ?? state
        } catch {
          emit([
            "type": "error",
            "instanceId": instanceId,
            "message": "reveal_start_opacity_apply_failed: \(error.localizedDescription)",
          ])
          state = instances[instanceId] ?? state
        }
      }
    }
    if let blockedPresentationSettleRequestKey = state.blockedPresentationSettleRequestKey,
       !hasPendingCommitFence(state.blockedPresentationCommitFenceBySourceId) {
      let blockedWaitMs = state.blockedPresentationCommitFenceStartedAtMs.map { max(0, Int((Self.nowMs() - $0).rounded())) }
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "\(state.blockedPresentationSettleKind == "exit" ? "exit" : "enter")_commit_fence_cleared waitMs=\(blockedWaitMs.map(String.init) ?? "nil") pending=none \(commitFenceWaitSummary(state: state))"
      )
      state.pendingPresentationSettleRequestKey = blockedPresentationSettleRequestKey
      state.pendingPresentationSettleKind = state.blockedPresentationSettleKind
      state.currentPresentationRenderPhase =
        state.blockedPresentationSettleKind == "exit" ? "exiting" : "enter_settling"
      state.blockedPresentationSettleRequestKey = nil
      state.blockedPresentationSettleKind = nil
      state.blockedPresentationCommitFenceStartedAtMs = nil
      state.blockedPresentationCommitFenceBySourceId.removeAll()
      if state.pendingPresentationSettleKind == "exit" {
        armNativeDismissSettle(instanceId: instanceId, requestKey: blockedPresentationSettleRequestKey)
      } else {
        armNativeEnterSettle(instanceId: instanceId, requestKey: blockedPresentationSettleRequestKey)
      }
    }
    if !hasPendingCommitFence(capturePendingVisualSourceCommitFence(state: state)) {
      maybeEmitExecutionBatchArmed(instanceId: instanceId, state: &state)
    }
  }

  private func currentMountedSourceRevisions(state: InstanceState) -> [String: String] {
    let sourceRevision: (String) -> String = { sourceId in
      if state.visualSourceLifecycleState == .dismissed,
         let cachedCollection = state.residentDesiredSourceCacheBySourceId[sourceId] {
        return cachedCollection.sourceRevision
      }
      return Self.mountedSourceState(sourceId: sourceId, state: state)?.sourceRevision ?? ""
    }
    return [
      "pins": sourceRevision(state.pinSourceId),
      "pinInteractions": sourceRevision(state.pinInteractionSourceId),
      "dots": sourceRevision(state.dotSourceId),
      "dotInteractions": sourceRevision(state.dotInteractionSourceId),
      "labels": sourceRevision(state.labelSourceId),
      "labelInteractions": sourceRevision(state.labelInteractionSourceId),
      "labelCollisions": sourceRevision(state.labelCollisionSourceId),
    ]
  }

  private func capturePendingVisualSourceCommitFence(state: InstanceState) -> [String: Set<String>] {
    var fenceBySourceId: [String: Set<String>] = [:]
    for sourceId in [state.pinSourceId, state.dotSourceId, state.labelSourceId] {
      let pending = state.pendingSourceCommitDataIdsBySourceId[sourceId] ?? []
      if !pending.isEmpty {
        fenceBySourceId[sourceId] = pending
      }
    }
    return fenceBySourceId
  }

  private func hasPendingCommitFence(_ fenceBySourceId: [String: Set<String>]) -> Bool {
    fenceBySourceId.contains { !$0.value.isEmpty }
  }

  private func commitFenceWaitSummary(state: InstanceState) -> String {
    let pendingFence = capturePendingVisualSourceCommitFence(state: state)
    let pendingSummary = hasPendingCommitFence(pendingFence) ? describeCommitFence(pendingFence) : "none"
    let nowMs = Self.nowMs()
    let revealWaitMs = state.blockedEnterStartCommitFenceStartedAtMs.map { max(0, Int((nowMs - $0).rounded())) }
    let settleWaitMs = state.blockedPresentationCommitFenceStartedAtMs.map { max(0, Int((nowMs - $0).rounded())) }
    return "pendingVisualCommits=\(pendingSummary) blockedRevealWaitMs=\(revealWaitMs.map(String.init) ?? "nil") blockedSettleWaitMs=\(settleWaitMs.map(String.init) ?? "nil")"
  }

  private func describeCommitFence(_ fenceBySourceId: [String: Set<String>]) -> String {
    fenceBySourceId
      .filter { !$0.value.isEmpty }
      .sorted { $0.key < $1.key }
      .map { "\($0.key)=\($0.value.count)" }
      .joined(separator: ",")
  }

  private static func commitSequence(
    from dataId: String?,
    sourceId: String
  ) -> Int? {
    guard let dataId, dataId.hasPrefix("\(sourceId)::") else {
      return nil
    }
    let suffix = dataId.dropFirst(sourceId.count + 2)
    return Int(suffix)
  }

  private static func shouldAcknowledgePendingCommitDataId(
    _ pendingDataId: String?,
    sourceId: String,
    acknowledgedDataId: String
  ) -> Bool {
    guard let pendingDataId else {
      return false
    }
    if pendingDataId == acknowledgedDataId {
      return true
    }
    guard
      let acknowledgedSequence = commitSequence(from: acknowledgedDataId, sourceId: sourceId),
      let pendingSequence = commitSequence(from: pendingDataId, sourceId: sourceId)
    else {
      return false
    }
    return pendingSequence <= acknowledgedSequence
  }

  private static func removeCommittedPendingDataIds(
    sourceId: String,
    acknowledgedDataId: String,
    pendingDataIds: inout Set<String>
  ) -> Bool {
    let removedIds = pendingDataIds.filter {
      shouldAcknowledgePendingCommitDataId(
        $0,
        sourceId: sourceId,
        acknowledgedDataId: acknowledgedDataId
      )
    }
    guard !removedIds.isEmpty else {
      return false
    }
    pendingDataIds.subtract(removedIds)
    return true
  }

  private func removeCommittedPendingDataIds(
    sourceId: String,
    acknowledgedDataId: String,
    fenceBySourceId: inout [String: Set<String>]
  ) {
    guard var pending = fenceBySourceId[sourceId] else {
      return
    }
    guard Self.removeCommittedPendingDataIds(
      sourceId: sourceId,
      acknowledgedDataId: acknowledgedDataId,
      pendingDataIds: &pending
    ) else {
      return
    }
    if pending.isEmpty {
      fenceBySourceId.removeValue(forKey: sourceId)
    } else {
      fenceBySourceId[sourceId] = pending
    }
  }

  private func armNativeEnterSettle(instanceId: String, requestKey: String) {
    revealFrameFallbackWorkItems[instanceId]?.cancel()
    let workItem = DispatchWorkItem { [weak self] in
      guard let self, let state = self.instances[instanceId] else { return }
      guard state.pendingPresentationSettleRequestKey == requestKey else { return }
      guard state.pendingPresentationSettleKind == "enter" else { return }
      self.settleEnterAfterRenderedFrame(instanceId: instanceId, requestKey: requestKey)
    }
    revealFrameFallbackWorkItems[instanceId] = workItem
    DispatchQueue.main.asyncAfter(
      deadline: .now() + .milliseconds(frameSettleFallbackDelayMs),
      execute: workItem
    )
  }

  private func armNativeDismissSettle(instanceId: String, requestKey: String) {
    dismissFrameFallbackWorkItems[instanceId]?.cancel()
    let workItem = DispatchWorkItem { [weak self] in
      guard let self, let state = self.instances[instanceId] else { return }
      guard state.pendingPresentationSettleRequestKey == requestKey else { return }
      guard state.pendingPresentationSettleKind == "exit" else { return }
      self.settleDismissAfterRenderedFrame(instanceId: instanceId, requestKey: requestKey)
    }
    dismissFrameFallbackWorkItems[instanceId] = workItem
    DispatchQueue.main.asyncAfter(
      deadline: .now() + .milliseconds(frameSettleFallbackDelayMs),
      execute: workItem
    )
  }

  private func resolveMapHandle(
    for mapTag: NSNumber,
    attemptCount: Int,
    startTimeMs: Double,
    completion: @escaping (Result<ResolvedMapHandle, Error>) -> Void
  ) {
    if let resolvedHandle = lookupMapHandle(for: mapTag) {
      emit([
        "type": "error",
        "instanceId": "__native_diag__",
        "message": "attach_map_resolved tag=\(mapTag.stringValue) attempt=\(attemptCount) root=\(Unmanaged.passUnretained(resolvedHandle.rootView).toOpaque()) map=\(Unmanaged.passUnretained(resolvedHandle.mapView).toOpaque())",
      ])
      completion(.success(resolvedHandle))
      return
    }
    let elapsedMs = CACurrentMediaTime() * 1000 - startTimeMs
    if elapsedMs >= mapResolveTimeoutMs {
      emit([
        "type": "error",
        "instanceId": "__native_diag__",
        "message": "attach_map_resolve_timeout tag=\(mapTag.stringValue) attempts=\(attemptCount) elapsedMs=\(Int(elapsedMs))",
      ])
      completion(
        .failure(
          NSError(
            domain: "SearchMapRenderController",
            code: 5,
            userInfo: [
              NSLocalizedDescriptionKey:
                "Mapbox MapView not found for react tag \(mapTag) after \(Int(elapsedMs))ms"
            ]
          )
        )
      )
      return
    }
    emit([
      "type": "error",
      "instanceId": "__native_diag__",
      "message": "attach_map_resolve_retry tag=\(mapTag.stringValue) attempt=\(attemptCount) elapsedMs=\(Int(elapsedMs))",
    ])
    let delayMs: Double
    if attemptCount == 0 {
      delayMs = 1
    } else if attemptCount <= 5 {
      delayMs = 10
    } else {
      delayMs = 200
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + delayMs / 1000) { [weak self] in
      guard self != nil else {
        completion(
          .failure(
            NSError(
              domain: "SearchMapRenderController",
              code: 6,
              userInfo: [NSLocalizedDescriptionKey: "controller deallocated during map resolve"]
            )
          )
        )
        return
      }
      self?.resolveMapHandle(
        for: mapTag,
        attemptCount: attemptCount + 1,
        startTimeMs: startTimeMs,
        completion: completion
      )
    }
  }

  private static func applySourceMutation(
    sourceId: String,
    previousSourceLifecyclePhase: SourceLifecyclePhase,
    previousSourceRevision: String,
    next: ParsedFeatureCollection,
    state: inout InstanceState,
    mapboxMap: MapboxMap
  ) throws -> MutationSummary {
    guard previousSourceRevision != next.sourceRevision else {
      return MutationSummary(
        addCount: 0,
        updateCount: 0,
        removeCount: 0,
        dataId: nil,
        addedFeatureIds: []
      )
    }
    if previousSourceLifecyclePhase != .incremental ||
      isInteractionSource(sourceId: sourceId, state: state)
    {
      try replaceSourceData(sourceId: sourceId, next: next, mapboxMap: mapboxMap)
      return MutationSummary(
        addCount: next.idsInOrder.count,
        updateCount: 0,
        removeCount: 0,
        dataId: nil,
        addedFeatureIds: next.idsInOrder
      )
    }
    let removeIds = next.removedFeatureIdsInOrder
    let addFeatureIds = next.addedFeatureIdsInOrder
    let updateFeatureIds = next.updatedFeatureIdsInOrder
    let dataId: String? =
      (!removeIds.isEmpty || !addFeatureIds.isEmpty || !updateFeatureIds.isEmpty)
      ? nextSourceCommitDataId(sourceId: sourceId, state: &state)
      : nil
    if !removeIds.isEmpty {
      mapboxMap.removeGeoJSONSourceFeatures(
        forSourceId: sourceId,
        featureIds: Array(removeIds),
        dataId: dataId
      )
    }
    let addFeatures = next.addedFeatures
    if !addFeatures.isEmpty {
      mapboxMap.addGeoJSONSourceFeatures(
        forSourceId: sourceId,
        features: addFeatures,
        dataId: dataId
      )
    }
    let updateFeatures = next.updatedFeatures
    if !updateFeatures.isEmpty {
      mapboxMap.updateGeoJSONSourceFeatures(
        forSourceId: sourceId,
        features: updateFeatures,
        dataId: dataId
      )
    }
    return MutationSummary(
      addCount: addFeatureIds.count,
      updateCount: updateFeatureIds.count,
      removeCount: removeIds.count,
      dataId: dataId,
      addedFeatureIds: addFeatureIds
    )
  }

  private static func replaceSourceData(
    sourceId: String,
    next: ParsedFeatureCollection,
    mapboxMap: MapboxMap
  ) throws {
    let orderedFeatures = mutationFeatures(idsInOrder: next.idsInOrder, featureById: next.featureById)
    mapboxMap.updateGeoJSONSource(
      withId: sourceId,
      geoJSON: .featureCollection(FeatureCollection(features: orderedFeatures))
    )
  }

  private static func resolveSourceMutationPlan(
    sourceId: String,
    previousSourceLifecyclePhase: SourceLifecyclePhase,
    previousSourceRevision: String,
    next: ParsedFeatureCollection,
    state: inout InstanceState
  ) -> ResolvedSourceMutationPlan {
    guard previousSourceRevision != next.sourceRevision else {
      return ResolvedSourceMutationPlan(
        sourceId: sourceId,
        previousSourceLifecyclePhase: previousSourceLifecyclePhase,
        previousSourceRevision: previousSourceRevision,
        next: next,
        mutationMode: .none,
        mutationSummary: MutationSummary(
          addCount: 0,
          updateCount: 0,
          removeCount: 0,
          dataId: nil,
          addedFeatureIds: []
        ),
        dataId: nil
      )
    }

    if previousSourceLifecyclePhase != .incremental ||
      isInteractionSource(sourceId: sourceId, state: state)
    {
      return ResolvedSourceMutationPlan(
        sourceId: sourceId,
        previousSourceLifecyclePhase: previousSourceLifecyclePhase,
        previousSourceRevision: previousSourceRevision,
        next: next,
        mutationMode: .baselineReplace,
        mutationSummary: MutationSummary(
          addCount: next.idsInOrder.count,
          updateCount: 0,
          removeCount: 0,
          dataId: nil,
          addedFeatureIds: next.idsInOrder
        ),
        dataId: nil
      )
    }

    let removeIds = next.removedFeatureIdsInOrder
    let addFeatureIds = next.addedFeatureIdsInOrder
    let updateFeatureIds = next.updatedFeatureIdsInOrder
    let dataId: String? =
      (!removeIds.isEmpty || !addFeatureIds.isEmpty || !updateFeatureIds.isEmpty)
      ? nextSourceCommitDataId(sourceId: sourceId, state: &state)
      : nil

    return ResolvedSourceMutationPlan(
      sourceId: sourceId,
      previousSourceLifecyclePhase: previousSourceLifecyclePhase,
      previousSourceRevision: previousSourceRevision,
      next: next,
      mutationMode: .incrementalPatch,
      mutationSummary: MutationSummary(
        addCount: addFeatureIds.count,
        updateCount: updateFeatureIds.count,
        removeCount: removeIds.count,
        dataId: dataId,
        addedFeatureIds: addFeatureIds
      ),
      dataId: dataId
    )
  }

  private static func isInteractionSource(
    sourceId: String,
    state: InstanceState
  ) -> Bool {
    sourceId == state.pinInteractionSourceId ||
      sourceId == state.dotInteractionSourceId ||
      sourceId == state.labelInteractionSourceId
  }

  private static func applySourceMutationBatch(
    _ plans: [ResolvedSourceMutationPlan],
    mapboxMap: MapboxMap,
    recordMutationApply: ((String, String, Int, Double) -> Void)? = nil
  ) throws {
    for plan in plans {
      guard plan.mutationMode == .baselineReplace,
            plan.previousSourceRevision != plan.next.sourceRevision
      else {
        continue
      }
      let startedAt = CACurrentMediaTime() * 1000
      try replaceSourceData(sourceId: plan.sourceId, next: plan.next, mapboxMap: mapboxMap)
      recordMutationApply?(
        plan.sourceId,
        "mapbox.replace_source_data",
        plan.next.idsInOrder.count,
        CACurrentMediaTime() * 1000 - startedAt
      )
    }

    for plan in plans {
      guard plan.mutationMode == .incrementalPatch,
            plan.previousSourceRevision != plan.next.sourceRevision,
            !plan.next.removedFeatureIdsInOrder.isEmpty
      else {
        continue
      }
      let startedAt = CACurrentMediaTime() * 1000
      mapboxMap.removeGeoJSONSourceFeatures(
        forSourceId: plan.sourceId,
        featureIds: plan.next.removedFeatureIdsInOrder,
        dataId: plan.dataId
      )
      recordMutationApply?(
        plan.sourceId,
        "mapbox.remove_features",
        plan.next.removedFeatureIdsInOrder.count,
        CACurrentMediaTime() * 1000 - startedAt
      )
    }

    for plan in plans {
      guard plan.mutationMode == .incrementalPatch,
            plan.previousSourceRevision != plan.next.sourceRevision,
            !plan.next.addedFeatures.isEmpty
      else {
        continue
      }
      let startedAt = CACurrentMediaTime() * 1000
      mapboxMap.addGeoJSONSourceFeatures(
        forSourceId: plan.sourceId,
        features: plan.next.addedFeatures,
        dataId: plan.dataId
      )
      recordMutationApply?(
        plan.sourceId,
        "mapbox.add_features",
        plan.next.addedFeatures.count,
        CACurrentMediaTime() * 1000 - startedAt
      )
    }

    for plan in plans {
      guard plan.mutationMode == .incrementalPatch,
            plan.previousSourceRevision != plan.next.sourceRevision,
            !plan.next.updatedFeatures.isEmpty
      else {
        continue
      }
      let startedAt = CACurrentMediaTime() * 1000
      mapboxMap.updateGeoJSONSourceFeatures(
        forSourceId: plan.sourceId,
        features: plan.next.updatedFeatures,
        dataId: plan.dataId
      )
      recordMutationApply?(
        plan.sourceId,
        "mapbox.update_features",
        plan.next.updatedFeatures.count,
        CACurrentMediaTime() * 1000 - startedAt
      )
    }
  }

  private static func sourceStateFromCollection(_ collection: ParsedFeatureCollection) -> SourceState {
    SourceState(
      lifecyclePhase: collection.sourceRevision.isEmpty ? .uninitialized : .incremental,
      sourceRevision: collection.sourceRevision,
      featureStateRevision: collection.featureStateRevision,
      featureStateEntryRevisionById: collection.featureStateEntryRevisionById,
      featureStateChangedIds: collection.featureStateChangedIds,
      idsInOrder: collection.idsInOrder,
      featureIds: collection.featureIds,
      addedFeatureIdsInOrder: collection.addedFeatureIdsInOrder,
      updatedFeatureIdsInOrder: collection.updatedFeatureIdsInOrder,
      removedFeatureIds: collection.removedFeatureIds,
      diffKeyById: collection.diffKeyById,
      markerKeyByFeatureId: collection.markerKeyByFeatureId,
      featureStateById: collection.featureStateById
    )
  }

  private static func applyCollectionMetadataToSourceState(
    _ collection: ParsedFeatureCollection,
    previousSourceState: SourceState?
  ) -> SourceState {
    guard var nextSourceState = previousSourceState else {
      return Self.sourceStateFromCollection(collection)
    }

    nextSourceState.lifecyclePhase = collection.sourceRevision.isEmpty ? .uninitialized : .incremental
    nextSourceState.sourceRevision = collection.sourceRevision
    nextSourceState.featureStateRevision = collection.featureStateRevision
    nextSourceState.featureStateChangedIds = collection.featureStateChangedIds
    nextSourceState.idsInOrder = collection.idsInOrder
    nextSourceState.featureIds = collection.featureIds
    nextSourceState.addedFeatureIdsInOrder = collection.addedFeatureIdsInOrder
    nextSourceState.updatedFeatureIdsInOrder = collection.updatedFeatureIdsInOrder
    nextSourceState.removedFeatureIds = collection.removedFeatureIds

    for featureId in collection.removedFeatureIds {
      nextSourceState.diffKeyById.removeValue(forKey: featureId)
      nextSourceState.markerKeyByFeatureId.removeValue(forKey: featureId)
      nextSourceState.featureStateById.removeValue(forKey: featureId)
      nextSourceState.featureStateEntryRevisionById.removeValue(forKey: featureId)
    }

    for featureId in collection.addedFeatureIdsInOrder {
      if let diffKey = collection.diffKeyById[featureId] {
        nextSourceState.diffKeyById[featureId] = diffKey
      }
      if let markerKey = collection.markerKeyByFeatureId[featureId] {
        nextSourceState.markerKeyByFeatureId[featureId] = markerKey
      }
    }

    for featureId in collection.updatedFeatureIdsInOrder {
      if let diffKey = collection.diffKeyById[featureId] {
        nextSourceState.diffKeyById[featureId] = diffKey
      }
      if let markerKey = collection.markerKeyByFeatureId[featureId] {
        nextSourceState.markerKeyByFeatureId[featureId] = markerKey
      }
    }

    for featureId in collection.featureStateChangedIds {
      if let featureState = collection.featureStateById[featureId], !featureState.isEmpty {
        nextSourceState.featureStateById[featureId] = featureState
      } else {
        nextSourceState.featureStateById.removeValue(forKey: featureId)
      }
      if let entryRevision = collection.featureStateEntryRevisionById[featureId] {
        nextSourceState.featureStateEntryRevisionById[featureId] = entryRevision
      } else {
        nextSourceState.featureStateEntryRevisionById.removeValue(forKey: featureId)
      }
    }

    return nextSourceState
  }

  private static func applyParsedCollection(
    sourceId: String,
    next: ParsedFeatureCollection,
    previousSourceState: SourceState?,
    state: inout InstanceState,
    mapboxMap: MapboxMap
  ) throws -> (sourceState: SourceState, mutationSummary: MutationSummary) {
    let nextSourceState: SourceState
    if let previousSourceState,
       previousSourceState.sourceRevision == next.sourceRevision,
       previousSourceState.featureStateRevision == next.featureStateRevision {
      var reusedSourceState = previousSourceState
      reusedSourceState.featureStateChangedIds.removeAll(keepingCapacity: true)
      reusedSourceState.addedFeatureIdsInOrder.removeAll(keepingCapacity: true)
      reusedSourceState.updatedFeatureIdsInOrder.removeAll(keepingCapacity: true)
      reusedSourceState.removedFeatureIds.removeAll(keepingCapacity: true)
      let mutationSummary = try Self.applySourceMutation(
        sourceId: sourceId,
        previousSourceLifecyclePhase: previousSourceState.lifecyclePhase,
        previousSourceRevision: previousSourceState.sourceRevision,
        next: next,
        state: &state,
        mapboxMap: mapboxMap
      )
      return (reusedSourceState, mutationSummary)
    }
    if let previousSourceState,
       (previousSourceState.sourceRevision != next.baseSourceRevision ||
        previousSourceState.featureStateRevision != next.baseFeatureStateRevision) {
      throw NSError(
        domain: "SearchMapRenderController",
        code: 5,
        userInfo: [
          NSLocalizedDescriptionKey:
            "Parsed collection base mismatch for \(sourceId): expected source=\(previousSourceState.sourceRevision) featureState=\(previousSourceState.featureStateRevision) got source=\(next.baseSourceRevision) featureState=\(next.baseFeatureStateRevision)"
        ]
      )
    }
    nextSourceState = Self.applyCollectionMetadataToSourceState(
      next,
      previousSourceState: previousSourceState
    )
    let mutationSummary = try Self.applySourceMutation(
      sourceId: sourceId,
      previousSourceLifecyclePhase: previousSourceState?.lifecyclePhase ?? .uninitialized,
      previousSourceRevision: previousSourceState?.sourceRevision ?? "",
      next: next,
      state: &state,
      mapboxMap: mapboxMap
    )
    return (nextSourceState, mutationSummary)
  }

  private static func resolveParsedCollectionApplyPlan(
    _ plan: ParsedCollectionApplyPlan
  ) throws -> ResolvedParsedCollectionApplyPlan {
    let nextSourceState: SourceState
    if let previousSourceState = plan.previousSourceState,
       previousSourceState.sourceRevision == plan.next.sourceRevision,
       previousSourceState.featureStateRevision == plan.next.featureStateRevision
    {
      var reusedSourceState = previousSourceState
      reusedSourceState.featureStateChangedIds.removeAll(keepingCapacity: true)
      reusedSourceState.addedFeatureIdsInOrder.removeAll(keepingCapacity: true)
      reusedSourceState.updatedFeatureIdsInOrder.removeAll(keepingCapacity: true)
      reusedSourceState.removedFeatureIds.removeAll(keepingCapacity: true)
      nextSourceState = reusedSourceState
    } else {
      if let previousSourceState = plan.previousSourceState,
         previousSourceState.sourceRevision != plan.next.baseSourceRevision ||
         previousSourceState.featureStateRevision != plan.next.baseFeatureStateRevision
      {
        throw NSError(
          domain: "SearchMapRenderController",
          code: 5,
          userInfo: [
            NSLocalizedDescriptionKey:
              "Parsed collection base mismatch for \(plan.sourceId): expected source=\(previousSourceState.sourceRevision) featureState=\(previousSourceState.featureStateRevision) got source=\(plan.next.baseSourceRevision) featureState=\(plan.next.baseFeatureStateRevision)"
          ]
        )
      }
      nextSourceState = Self.applyCollectionMetadataToSourceState(
        plan.next,
        previousSourceState: plan.previousSourceState
      )
    }
    return ResolvedParsedCollectionApplyPlan(
      sourceId: plan.sourceId,
      next: plan.next,
      previousSourceLifecyclePhase: plan.previousSourceState?.lifecyclePhase ?? .uninitialized,
      previousSourceRevision: plan.previousSourceState?.sourceRevision ?? "",
      previousFeatureStateById: plan.previousFeatureStateById,
      previousFeatureStateRevision: plan.previousFeatureStateRevision,
      nextSourceState: nextSourceState
    )
  }

  private func applyParsedCollectionBatch(
    instanceId: String,
    plans: [ParsedCollectionApplyPlan],
    state: inout InstanceState,
    mapboxMap: MapboxMap
  ) throws -> [String: MutationSummary] {
    if plans.isEmpty {
      return [:]
    }
    let resolvePlansStartedAt = CACurrentMediaTime() * 1000
    let resolvedPlans = try plans.map(Self.resolveParsedCollectionApplyPlan)
    self.recordNativeApply(
      section: "source_batch.resolve_plans",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - resolvePlansStartedAt,
      operationCount: plans.count
    )
    var mutationSummaryBySourceId: [String: MutationSummary] = [:]
    var resolvedMutationPlans: [ResolvedSourceMutationPlan] = []

    let mutationPlansStartedAt = CACurrentMediaTime() * 1000
    for plan in resolvedPlans {
      let resolvedMutationPlan = Self.resolveSourceMutationPlan(
        sourceId: plan.sourceId,
        previousSourceLifecyclePhase: plan.previousSourceLifecyclePhase,
        previousSourceRevision: plan.previousSourceRevision,
        next: plan.next,
        state: &state
      )
      mutationSummaryBySourceId[plan.sourceId] = resolvedMutationPlan.mutationSummary
      resolvedMutationPlans.append(resolvedMutationPlan)
    }
    if let pinMutationPlan = resolvedMutationPlans.first(where: { $0.sourceId == state.pinSourceId }) {
      let summary = pinMutationPlan.mutationSummary
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "pin_source_mutation_plan mode=\(String(describing: pinMutationPlan.mutationMode)) previousLifecycle=\(String(describing: pinMutationPlan.previousSourceLifecyclePhase)) previousRevisionEmpty=\(pinMutationPlan.previousSourceRevision.isEmpty) nextCount=\(pinMutationPlan.next.idsInOrder.count) add=\(summary.addCount) update=\(summary.updateCount) remove=\(summary.removeCount) dataId=\(summary.dataId ?? "nil") activeFrame=\(state.activeFrameGenerationId ?? "nil") sourceReadyFrame=\(state.sourceReadyFrameGenerationId ?? "nil") lifecycle=\(state.visualSourceLifecycleState)"
      )
    }
    if let pinInteractionMutationPlan = resolvedMutationPlans.first(where: { $0.sourceId == state.pinInteractionSourceId }) {
      let summary = pinInteractionMutationPlan.mutationSummary
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "pin_interaction_source_mutation_plan mode=\(String(describing: pinInteractionMutationPlan.mutationMode)) previousLifecycle=\(String(describing: pinInteractionMutationPlan.previousSourceLifecyclePhase)) previousRevisionEmpty=\(pinInteractionMutationPlan.previousSourceRevision.isEmpty) nextCount=\(pinInteractionMutationPlan.next.idsInOrder.count) add=\(summary.addCount) update=\(summary.updateCount) remove=\(summary.removeCount) dataId=\(summary.dataId ?? "nil") activeFrame=\(state.activeFrameGenerationId ?? "nil") lifecycle=\(state.visualSourceLifecycleState)"
      )
    }
    self.recordNativeApply(
      section: "source_batch.resolve_mutation_plans",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - mutationPlansStartedAt,
      operationCount: resolvedPlans.count
    )

    let mutationBatchStartedAt = CACurrentMediaTime() * 1000
    let attributionPhase = state.lastPresentationBatchPhase
    let sourceFamilyBySourceId = [
      state.pinSourceId: "pins",
      state.pinInteractionSourceId: "pinInteractions",
      state.dotSourceId: "dots",
      state.dotInteractionSourceId: "dotInteractions",
      state.labelSourceId: "labels",
      state.labelInteractionSourceId: "labelInteractions",
      state.labelCollisionSourceId: "labelCollisions",
    ]
    try Self.applySourceMutationBatch(
      resolvedMutationPlans,
      mapboxMap: mapboxMap,
      recordMutationApply: { sourceId, section, operationCount, durationMs in
        self.recordNativeApply(
          section: section,
          phase: attributionPhase,
          source: sourceFamilyBySourceId[sourceId] ?? sourceId,
          durationMs: durationMs,
          operationCount: operationCount
        )
      }
    )
    self.recordNativeApply(
      section: "source_batch.apply_mutation_batch",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - mutationBatchStartedAt,
      operationCount: resolvedMutationPlans.count
    )

    for plan in resolvedPlans {
      let mutationSummary = mutationSummaryBySourceId[plan.sourceId] ?? MutationSummary(
        addCount: 0,
        updateCount: 0,
        removeCount: 0,
        dataId: nil,
        addedFeatureIds: []
      )
      let featureStatesStartedAt = CACurrentMediaTime() * 1000
      Self.applyFeatureStates(
        sourceId: plan.sourceId,
        previousFeatureStateRevision: plan.previousFeatureStateRevision,
        nextFeatureStateRevision: plan.next.featureStateRevision,
        changedFeatureStateIds: plan.nextSourceState.featureStateChangedIds,
        featureStateById: plan.next.featureStateById,
        previousFeatureStateById: plan.previousFeatureStateById,
        mapboxMap: mapboxMap
      )
      self.recordNativeApply(
        section: "source_batch.apply_feature_states",
        phase: state.lastPresentationBatchPhase,
        source: nativeApplySourceFamily(sourceId: plan.sourceId, state: state),
        durationMs: CACurrentMediaTime() * 1000 - featureStatesStartedAt,
        operationCount: plan.nextSourceState.featureStateChangedIds.count
      )
      let pendingCommitStartedAt = CACurrentMediaTime() * 1000
      self.registerPendingSourceCommit(
        instanceId: instanceId,
        sourceId: plan.sourceId,
        mutationSummary: mutationSummary,
        state: &state
      )
      self.recordNativeApply(
        section: "source_batch.register_pending_commit",
        phase: state.lastPresentationBatchPhase,
        source: nativeApplySourceFamily(sourceId: plan.sourceId, state: state),
        durationMs: CACurrentMediaTime() * 1000 - pendingCommitStartedAt,
        operationCount: mutationSummary.addCount + mutationSummary.updateCount + mutationSummary.removeCount
      )
      let syncMountedStartedAt = CACurrentMediaTime() * 1000
      Self.syncMountedSourceState(plan.nextSourceState, sourceId: plan.sourceId, state: &state)
      self.recordNativeApply(
        section: "source_batch.sync_mounted_state",
        phase: state.lastPresentationBatchPhase,
        source: nativeApplySourceFamily(sourceId: plan.sourceId, state: state),
        durationMs: CACurrentMediaTime() * 1000 - syncMountedStartedAt,
        operationCount: plan.nextSourceState.idsInOrder.count
      )
    }

    return mutationSummaryBySourceId
  }

  private struct ParsedFeatureCollection {
    var baseSourceRevision: String
    var baseFeatureStateRevision: String
    var sourceRevision: String
    var featureStateRevision: String
    var dirtyGroupIds: Set<String>
    var orderChangedGroupIds: Set<String>
    var removedGroupIds: Set<String>
    var featureStateEntryRevisionById: [String: String]
    var featureStateChangedIds: Set<String>
    var featureIds: Set<String>
    var addedFeatureIdsInOrder: [String]
    var updatedFeatureIdsInOrder: [String]
    var removedFeatureIds: Set<String>
    var removedFeatureIdsInOrder: [String]
    var idsInOrder: [String]
    var groupedFeatureIdsByGroup: [String: [String]]
    var groupOrder: [String]
    var featureById: [String: Feature]
    var diffKeyById: [String: String]
    var featureStateById: [String: [String: Any]]
    var markerKeyByFeatureId: [String: String]
    var addedFeatures: [Feature]
    var updatedFeatures: [Feature]
  }

  private struct ParsedFeatureCollectionDelta {
    let sourceId: String
    let mode: String
    let nextFeatureIdsInOrder: [String]
    let removeIds: Set<String>
    let dirtyGroupIds: Set<String>
    let orderChangedGroupIds: Set<String>
    let removedGroupIds: Set<String>
    let upsertCollection: ParsedFeatureCollection?
  }

  private static func emptyParsedFeatureCollection() -> ParsedFeatureCollection {
    ParsedFeatureCollection(
      baseSourceRevision: "",
      baseFeatureStateRevision: "",
      sourceRevision: "",
      featureStateRevision: "",
      dirtyGroupIds: [],
      orderChangedGroupIds: [],
      removedGroupIds: [],
      featureStateEntryRevisionById: [:],
      featureStateChangedIds: [],
      featureIds: [],
      addedFeatureIdsInOrder: [],
      updatedFeatureIdsInOrder: [],
      removedFeatureIds: [],
      removedFeatureIdsInOrder: [],
      idsInOrder: [],
      groupedFeatureIdsByGroup: [:],
      groupOrder: [],
      featureById: [:],
      diffKeyById: [:],
      featureStateById: [:],
      markerKeyByFeatureId: [:],
      addedFeatures: [],
      updatedFeatures: []
    )
  }

  private static func emptyDerivedFamilyState() -> DerivedFamilyState {
    let collection = emptyParsedFeatureCollection()
    return DerivedFamilyState(
      desiredCollection: collection,
      collection: collection,
      sourceState: sourceStateFromCollection(collection),
      transientFeatureStateById: [:],
      pinRuntime: PinFamilyRuntimeState(),
      dotRuntime: DotFamilyRuntimeState(lastDesiredCollection: collection),
      labelObservation: LabelFamilyObservationState()
    )
  }

  private static func makeInitialDerivedFamilyStates(
    pinSourceId: String,
    pinInteractionSourceId: String,
    dotSourceId: String,
    dotInteractionSourceId: String,
    labelSourceId: String,
    labelInteractionSourceId: String,
    labelCollisionSourceId: String
  ) -> [String: DerivedFamilyState] {
    [
      pinSourceId: emptyDerivedFamilyState(),
      pinInteractionSourceId: emptyDerivedFamilyState(),
      dotSourceId: emptyDerivedFamilyState(),
      dotInteractionSourceId: emptyDerivedFamilyState(),
      labelSourceId: emptyDerivedFamilyState(),
      labelInteractionSourceId: emptyDerivedFamilyState(),
      labelCollisionSourceId: emptyDerivedFamilyState(),
    ]
  }

  private static func derivedFamilyState(
    sourceId: String,
    state: InstanceState
  ) -> DerivedFamilyState {
    state.derivedFamilyStates[sourceId] ?? emptyDerivedFamilyState()
  }

  private static func mountedSourceState(
    sourceId: String,
    state: InstanceState
  ) -> SourceState? {
    state.derivedFamilyStates[sourceId]?.sourceState
  }

  private static func setDerivedFamilyState(
    _ familyState: DerivedFamilyState,
    sourceId: String,
    state: inout InstanceState
  ) {
    state.derivedFamilyStates[sourceId] = familyState
  }

  private static func syncCollectionMetadataFromMountedSourceState(
    _ collection: inout ParsedFeatureCollection,
    sourceState: SourceState
  ) {
    collection.baseSourceRevision = sourceState.sourceRevision
    collection.baseFeatureStateRevision = sourceState.featureStateRevision
    collection.sourceRevision = sourceState.sourceRevision
    collection.featureStateRevision = sourceState.featureStateRevision
    collection.featureStateEntryRevisionById = sourceState.featureStateEntryRevisionById
    collection.featureStateChangedIds = []
    collection.featureStateById = sourceState.featureStateById
  }

  private static func syncMountedSourceState(
    _ sourceState: SourceState,
    sourceId: String,
    familyState: inout DerivedFamilyState,
    state: inout InstanceState
  ) {
    familyState.sourceState = sourceState
    syncCollectionMetadataFromMountedSourceState(&familyState.desiredCollection, sourceState: sourceState)
    syncCollectionMetadataFromMountedSourceState(&familyState.collection, sourceState: sourceState)
    setDerivedFamilyState(familyState, sourceId: sourceId, state: &state)
  }

  private static func syncMountedSourceState(
    _ sourceState: SourceState,
    sourceId: String,
    state: inout InstanceState
  ) {
    if var familyState = state.derivedFamilyStates[sourceId] {
      familyState.sourceState = sourceState
      syncCollectionMetadataFromMountedSourceState(&familyState.desiredCollection, sourceState: sourceState)
      syncCollectionMetadataFromMountedSourceState(&familyState.collection, sourceState: sourceState)
      state.derivedFamilyStates[sourceId] = familyState
    }
  }

  private static func setTransientDerivedFeatureState(
    sourceId: String,
    featureId: String,
    featureState: [String: Any]?,
    state: inout InstanceState
  ) {
    var familyState = derivedFamilyState(sourceId: sourceId, state: state)
    if let featureState {
      familyState.transientFeatureStateById[featureId] = featureState
    } else {
      familyState.transientFeatureStateById.removeValue(forKey: featureId)
    }
    setDerivedFamilyState(familyState, sourceId: sourceId, state: &state)
  }

  private static func applyTransientFeatureState(
    sourceState: inout SourceState,
    familyState: inout DerivedFamilyState,
    featureId: String,
    transientState: [String: Any],
    applyList: inout [(featureId: String, state: [String: Any])],
    sourceStateChanged: inout Bool
  ) {
    let previousState = sourceState.featureStateById[featureId]
    let mergedState = applyRetainedFeatureStatePatch(
      sourceState: &sourceState,
      featureId: featureId,
      statePatch: transientState
    )
    if !featureStatesEqual(previousState, mergedState) {
      applyList.append((featureId: featureId, state: mergedState))
      sourceStateChanged = true
    }
    familyState.transientFeatureStateById[featureId] = transientState
  }

  private static func applyTransientFeatureState(
    sourceState: inout SourceState,
    familyState: inout DerivedFamilyState,
    featureId: String,
    transientState: [String: Any]
  ) {
    _ = applyRetainedFeatureStatePatch(
      sourceState: &sourceState,
      featureId: featureId,
      statePatch: transientState
    )
    familyState.transientFeatureStateById[featureId] = transientState
  }

  private static func clearTransientFeatureState(
    sourceState: inout SourceState,
    familyState: inout DerivedFamilyState,
    featureId: String
  ) {
    if let transientState = familyState.transientFeatureStateById[featureId] {
      clearRetainedFeatureStateKeys(
        sourceState: &sourceState,
        featureId: featureId,
        stateKeys: Array(transientState.keys)
      )
    }
    familyState.transientFeatureStateById.removeValue(forKey: featureId)
  }

  private static func applyRetainedFeatureStatePatch(
    sourceState: inout SourceState,
    featureId: String,
    statePatch: [String: Any]
  ) -> [String: Any] {
    let mergedState = mergedFeatureState(
      sourceState.featureStateById[featureId] ?? [:],
      with: statePatch
    )
    sourceState.featureStateById[featureId] = mergedState
    sourceState.featureStateEntryRevisionById[featureId] = buildFeatureStateEntryRevision(
      state: mergedState
    )
    return mergedState
  }

  private static func clearRetainedFeatureStateKeys(
    sourceState: inout SourceState,
    featureId: String,
    stateKeys: [String]
  ) {
    guard var nextState = sourceState.featureStateById[featureId] else {
      sourceState.featureStateEntryRevisionById.removeValue(forKey: featureId)
      return
    }
    for key in stateKeys {
      nextState.removeValue(forKey: key)
    }
    if nextState.isEmpty {
      sourceState.featureStateById.removeValue(forKey: featureId)
      sourceState.featureStateEntryRevisionById.removeValue(forKey: featureId)
      return
    }
    sourceState.featureStateById[featureId] = nextState
    sourceState.featureStateEntryRevisionById[featureId] = buildFeatureStateEntryRevision(
      state: nextState
    )
  }

  private static func refreshFeatureStateRevision(_ sourceState: inout SourceState) {
    sourceState.featureStateRevision = buildFeatureStateRevision(
      featureStateEntryRevisionById: sourceState.featureStateEntryRevisionById
    )
  }

  private static func mutationFeatures(
    idsInOrder: [String],
    featureById: [String: Feature]
  ) -> [Feature] {
    idsInOrder.compactMap { featureId in featureById[featureId] }
  }

  private static func buildGroupedFeatureIdsByGroup(
    idsInOrder: [String],
    markerKeyByFeatureId: [String: String]
  ) -> ([String: [String]], [String]) {
    var groupedFeatureIdsByGroup: [String: [String]] = [:]
    var groupOrder: [String] = []
    for featureId in idsInOrder {
      let groupId = markerKeyByFeatureId[featureId] ?? featureId
      if groupedFeatureIdsByGroup[groupId] == nil {
        groupedFeatureIdsByGroup[groupId] = []
        groupOrder.append(groupId)
      }
      groupedFeatureIdsByGroup[groupId, default: []].append(featureId)
    }
    return (groupedFeatureIdsByGroup, groupOrder)
  }

  private static func requireUniqueOrderedFeatureIds(
    _ sourceIdsInOrder: [String],
    context: String
  ) throws -> [String] {
    var seenFeatureIds = Set<String>()
    var idsInOrder: [String] = []
    idsInOrder.reserveCapacity(sourceIdsInOrder.count)
    for featureId in sourceIdsInOrder {
      guard !featureId.isEmpty else {
        throw parsedCollectionContractError("Missing feature id in \(context)")
      }
      guard seenFeatureIds.insert(featureId).inserted else {
        throw parsedCollectionContractError("Duplicate feature id \(featureId) in \(context)")
      }
      idsInOrder.append(featureId)
    }
    return idsInOrder
  }

  private static func requireUniqueStringSet(
    _ values: [String],
    context: String
  ) throws -> Set<String> {
    var nextValues = Set<String>()
    for value in values {
      guard !value.isEmpty else {
        throw parsedCollectionContractError("Missing value in \(context)")
      }
      guard nextValues.insert(value).inserted else {
        throw parsedCollectionContractError("Duplicate value \(value) in \(context)")
      }
    }
    return nextValues
  }

  private static func parsedCollectionContractError(_ message: String) -> NSError {
    NSError(
      domain: "SearchMapRenderController",
      code: 5,
      userInfo: [NSLocalizedDescriptionKey: message]
    )
  }

  private static func parseFeatureCollectionJSON(
    _ json: String,
    sourceId: String
  ) throws -> ParsedFeatureCollection {
    guard let data = json.data(using: .utf8) else {
      throw NSError(
        domain: "SearchMapRenderController",
        code: 5,
        userInfo: [NSLocalizedDescriptionKey: "Feature collection JSON was not UTF-8"]
      )
    }
    return try Self.parseFeatureCollectionData(data, sourceId: sourceId)
  }

  private static func parseFeatureCollectionData(
    _ data: Data,
    sourceId: String
  ) throws -> ParsedFeatureCollection {
    let collection = try JSONDecoder().decode(FeatureCollection.self, from: data)
    let rawObject = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    let rawFeatures = rawObject?["features"] as? [[String: Any]] ?? []
    var diffKeyById: [String: String] = [:]
    var idsInOrder: [String] = []
    var featureById: [String: Feature] = [:]
    var featureStateById: [String: [String: Any]] = [:]
    var markerKeyByFeatureId: [String: String] = [:]
    var seenFeatureIds = Set<String>()
    let encoder = JSONEncoder()
    for (index, feature) in collection.features.enumerated() {
      guard let id = feature.identifier.flatMap(Self.featureIdentifierString) else {
        throw NSError(
          domain: "SearchMapRenderController",
          code: 5,
          userInfo: [NSLocalizedDescriptionKey: "Feature missing id in parsed source \(sourceId)"]
        )
      }
      guard seenFeatureIds.insert(id).inserted else {
        throw NSError(
          domain: "SearchMapRenderController",
          code: 5,
          userInfo: [NSLocalizedDescriptionKey: "Duplicate feature id \(id) in parsed source \(sourceId)"]
        )
      }
      idsInOrder.append(id)
      featureById[id] = feature
      let encoded = try encoder.encode(feature)
      guard let encodedString = String(data: encoded, encoding: .utf8) else {
        throw NSError(
          domain: "SearchMapRenderController",
          code: 5,
          userInfo: [NSLocalizedDescriptionKey: "Feature \(id) could not be encoded in parsed source \(sourceId)"]
        )
      }
      let rawFeature = rawFeatures[safe: index]
      diffKeyById[id] = rawFeature.flatMap { Self.makeFeatureDiffKey(rawFeature: $0) } ?? encodedString
      let rawProperties = rawFeature?["properties"]
      featureStateById[id] = Self.extractFeatureState(from: rawProperties)
      let markerKey = try Self.extractMarkerKey(from: rawProperties, featureId: id, sourceId: sourceId)
      markerKeyByFeatureId[id] = markerKey
    }
    let sourceRevision = buildParsedCollectionRevision(
      idsInOrder: idsInOrder,
      diffKeyById: diffKeyById
    )
    let featureStateEntryRevisionById = makeFeatureStateEntryRevisionById(
      featureStateById: featureStateById
    )
    let featureStateRevision = buildFeatureStateRevision(
      featureStateEntryRevisionById: featureStateEntryRevisionById
    )
    let featureIds = Set(idsInOrder)
    let (groupedFeatureIdsByGroup, groupOrder) = buildGroupedFeatureIdsByGroup(
      idsInOrder: idsInOrder,
      markerKeyByFeatureId: markerKeyByFeatureId
    )
    return ParsedFeatureCollection(
      baseSourceRevision: "",
      baseFeatureStateRevision: "",
      sourceRevision: sourceRevision,
      featureStateRevision: featureStateRevision,
      dirtyGroupIds: Set(groupOrder),
      orderChangedGroupIds: Set(groupOrder),
      removedGroupIds: [],
      featureStateEntryRevisionById: featureStateEntryRevisionById,
      featureStateChangedIds: Set(featureStateEntryRevisionById.keys),
      featureIds: featureIds,
      addedFeatureIdsInOrder: idsInOrder,
      updatedFeatureIdsInOrder: [],
      removedFeatureIds: [],
      removedFeatureIdsInOrder: [],
      idsInOrder: idsInOrder,
      groupedFeatureIdsByGroup: groupedFeatureIdsByGroup,
      groupOrder: groupOrder,
      featureById: featureById,
      diffKeyById: diffKeyById,
      featureStateById: featureStateById,
      markerKeyByFeatureId: markerKeyByFeatureId,
      addedFeatures: Self.mutationFeatures(idsInOrder: idsInOrder, featureById: featureById),
      updatedFeatures: []
    )
  }

  private static func parseSourceDeltas(
    _ rawDeltas: [[String: Any]]
  ) throws -> [ParsedFeatureCollectionDelta] {
    return try rawDeltas.map { rawDelta in
      guard let sourceId = rawDelta["sourceId"] as? String else {
        throw NSError(
          domain: "SearchMapRenderController",
          code: 5,
          userInfo: [NSLocalizedDescriptionKey: "Source delta missing sourceId"]
        )
      }
      let nextFeatureIdsInOrder = rawDelta["nextFeatureIdsInOrder"] as? [String] ?? []
      let mode = (rawDelta["mode"] as? String) ?? "patch"
      let validatedNextFeatureIdsInOrder = try Self.requireUniqueOrderedFeatureIds(
        nextFeatureIdsInOrder,
        context: "source delta \(sourceId) nextFeatureIdsInOrder"
      )
      let removeIds = try Self.requireUniqueStringSet(
        rawDelta["removeIds"] as? [String] ?? [],
        context: "source delta \(sourceId) removeIds"
      )
      let dirtyGroupIds = try Self.requireUniqueStringSet(
        rawDelta["dirtyGroupIds"] as? [String] ?? [],
        context: "source delta \(sourceId) dirtyGroupIds"
      )
      let orderChangedGroupIds = try Self.requireUniqueStringSet(
        rawDelta["orderChangedGroupIds"] as? [String] ?? [],
        context: "source delta \(sourceId) orderChangedGroupIds"
      )
      let removedGroupIds = try Self.requireUniqueStringSet(
        rawDelta["removedGroupIds"] as? [String] ?? [],
        context: "source delta \(sourceId) removedGroupIds"
      )
      let upsertCollection: ParsedFeatureCollection?
      if let rawUpsertFeatures = rawDelta["upsertFeatures"] as? [[String: Any]] {
        upsertCollection = try Self.parseTransportFeatureRecords(rawUpsertFeatures)
      } else {
        upsertCollection = nil
      }
      return ParsedFeatureCollectionDelta(
        sourceId: sourceId,
        mode: mode,
        nextFeatureIdsInOrder: validatedNextFeatureIdsInOrder,
        removeIds: removeIds,
        dirtyGroupIds: dirtyGroupIds,
        orderChangedGroupIds: orderChangedGroupIds,
        removedGroupIds: removedGroupIds,
        upsertCollection: upsertCollection
      )
    }
  }

  private static func parseTransportFeatureRecords(
    _ rawRecords: [[String: Any]]
  ) throws -> ParsedFeatureCollection {
    var idsInOrder: [String] = []
    var featureById: [String: Feature] = [:]
    var diffKeyById: [String: String] = [:]
    var featureStateById: [String: [String: Any]] = [:]
    var markerKeyByFeatureId: [String: String] = [:]
    var seenFeatureIds = Set<String>()

    for rawRecord in rawRecords {
      guard let id = rawRecord["id"] as? String, !id.isEmpty else {
        throw NSError(
          domain: "SearchMapRenderController",
          code: 5,
          userInfo: [NSLocalizedDescriptionKey: "Transport feature missing id"]
        )
      }
      guard seenFeatureIds.insert(id).inserted else {
        throw NSError(
          domain: "SearchMapRenderController",
          code: 5,
          userInfo: [NSLocalizedDescriptionKey: "Duplicate feature id \(id) in transport features"]
        )
      }
      guard let lng = numberValue(from: rawRecord["lng"]),
            let lat = numberValue(from: rawRecord["lat"])
      else {
        throw NSError(
          domain: "SearchMapRenderController",
          code: 5,
          userInfo: [NSLocalizedDescriptionKey: "Feature \(id) missing point transport payload"]
        )
      }
      var feature = Feature(geometry: Point(CLLocationCoordinate2D(latitude: lat, longitude: lng)))
      feature.identifier = .string(id)
      feature.properties = transportJSONObject(from: rawRecord["properties"])
      idsInOrder.append(id)
      featureById[id] = feature
      diffKeyById[id] = (rawRecord["diffKey"] as? String)?.isEmpty == false
        ? (rawRecord["diffKey"] as? String ?? id)
        : id
      let markerKey = (rawRecord["markerKey"] as? String)?.isEmpty == false
        ? (rawRecord["markerKey"] as? String ?? id)
        : id
      markerKeyByFeatureId[id] = markerKey
      if let featureState = rawRecord["featureState"] as? [String: Any], !featureState.isEmpty {
        featureStateById[id] = featureState
      }
    }

    let sourceRevision = buildParsedCollectionRevision(
      idsInOrder: idsInOrder,
      diffKeyById: diffKeyById
    )
    let featureStateEntryRevisionById = makeFeatureStateEntryRevisionById(
      featureStateById: featureStateById
    )
    let featureStateRevision = buildFeatureStateRevision(
      featureStateEntryRevisionById: featureStateEntryRevisionById
    )
    let featureIds = Set(idsInOrder)
    let (groupedFeatureIdsByGroup, groupOrder) = buildGroupedFeatureIdsByGroup(
      idsInOrder: idsInOrder,
      markerKeyByFeatureId: markerKeyByFeatureId
    )
    return ParsedFeatureCollection(
      baseSourceRevision: "",
      baseFeatureStateRevision: "",
      sourceRevision: sourceRevision,
      featureStateRevision: featureStateRevision,
      dirtyGroupIds: Set(markerKeyByFeatureId.values),
      orderChangedGroupIds: Set(markerKeyByFeatureId.values),
      removedGroupIds: [],
      featureStateEntryRevisionById: featureStateEntryRevisionById,
      featureStateChangedIds: Set(featureStateEntryRevisionById.keys),
      featureIds: featureIds,
      addedFeatureIdsInOrder: idsInOrder,
      updatedFeatureIdsInOrder: [],
      removedFeatureIds: [],
      removedFeatureIdsInOrder: [],
      idsInOrder: idsInOrder,
      groupedFeatureIdsByGroup: groupedFeatureIdsByGroup,
      groupOrder: groupOrder,
      featureById: featureById,
      diffKeyById: diffKeyById,
      featureStateById: featureStateById,
      markerKeyByFeatureId: markerKeyByFeatureId,
      addedFeatures: Self.mutationFeatures(idsInOrder: idsInOrder, featureById: featureById),
      updatedFeatures: []
    )
  }

  private static func transportJSONObject(from rawProperties: Any?) -> JSONObject? {
    guard let rawProperties = rawProperties as? [String: Any], !rawProperties.isEmpty else {
      return nil
    }
    var properties: JSONObject = [:]
    for (key, value) in rawProperties {
      properties[key] = JSONValue(rawValue: value)
    }
    return properties
  }

  private static func numberValue(from value: Any?) -> Double? {
    if let number = value as? NSNumber {
      return number.doubleValue
    }
    return value as? Double
  }

  private static func applyParsedCollectionDelta(
    _ delta: ParsedFeatureCollectionDelta,
    to base: ParsedFeatureCollection
  ) throws -> ParsedFeatureCollection {
    let effectiveBase = base
    var featureById = effectiveBase.featureById
    var diffKeyById = effectiveBase.diffKeyById
    var featureStateById = effectiveBase.featureStateById
    var featureStateEntryRevisionById = effectiveBase.featureStateEntryRevisionById
    var markerKeyByFeatureId = effectiveBase.markerKeyByFeatureId

    for removeId in delta.removeIds {
      featureById.removeValue(forKey: removeId)
      diffKeyById.removeValue(forKey: removeId)
      featureStateById.removeValue(forKey: removeId)
      featureStateEntryRevisionById.removeValue(forKey: removeId)
      markerKeyByFeatureId.removeValue(forKey: removeId)
    }

    if let upsertCollection = delta.upsertCollection {
      for id in upsertCollection.idsInOrder {
        guard let feature = upsertCollection.featureById[id] else {
          throw NSError(
            domain: "SearchMapRenderController",
            code: 5,
            userInfo: [NSLocalizedDescriptionKey: "Source delta upsert missing feature \(id) for \(delta.sourceId)"]
          )
        }
        featureById[id] = feature
      }
      diffKeyById.merge(upsertCollection.diffKeyById) { _, next in next }
      featureStateById.merge(upsertCollection.featureStateById) { _, next in next }
      featureStateEntryRevisionById.merge(upsertCollection.featureStateEntryRevisionById) { _, next in next }
      markerKeyByFeatureId.merge(upsertCollection.markerKeyByFeatureId) { _, next in next }
    }

    var nextIdsInOrder: [String] = []
    var nextFeatureById: [String: Feature] = [:]
    var nextDiffKeyById: [String: String] = [:]
    var nextFeatureStateById: [String: [String: Any]] = [:]
    var nextFeatureStateEntryRevisionById: [String: String] = [:]
    var nextMarkerKeyByFeatureId: [String: String] = [:]
    var seenFeatureIds = Set<String>()

    for featureId in try Self.requireUniqueOrderedFeatureIds(
      delta.nextFeatureIdsInOrder,
      context: "source delta \(delta.sourceId)"
    ) {
      if !seenFeatureIds.insert(featureId).inserted {
        throw NSError(
          domain: "SearchMapRenderController",
          code: 5,
          userInfo: [NSLocalizedDescriptionKey: "Duplicate feature id \(featureId) in source delta \(delta.sourceId)"]
        )
      }
      guard
        let feature = featureById[featureId],
        let diffKey = diffKeyById[featureId],
        let markerKey = markerKeyByFeatureId[featureId]
      else {
        throw NSError(
          domain: "SearchMapRenderController",
          code: 5,
          userInfo: [NSLocalizedDescriptionKey: "Source delta missing feature \(featureId) for \(delta.sourceId)"]
        )
      }
      nextIdsInOrder.append(featureId)
      nextFeatureById[featureId] = feature
      nextDiffKeyById[featureId] = diffKey
      if let featureState = featureStateById[featureId] {
        nextFeatureStateById[featureId] = featureState
        nextFeatureStateEntryRevisionById[featureId] = featureStateEntryRevisionById[featureId] ??
          Self.buildFeatureStateEntryRevision(state: featureState)
      }
      nextMarkerKeyByFeatureId[featureId] = markerKey
    }

    let sourceRevision: String
    if effectiveBase.idsInOrder == nextIdsInOrder, effectiveBase.diffKeyById == nextDiffKeyById {
      sourceRevision = effectiveBase.sourceRevision
    } else {
      sourceRevision = buildParsedCollectionRevision(
        idsInOrder: nextIdsInOrder,
        diffKeyById: nextDiffKeyById
      )
    }
    let featureStateRevision: String
    if effectiveBase.featureStateEntryRevisionById == nextFeatureStateEntryRevisionById {
      featureStateRevision = effectiveBase.featureStateRevision
    } else {
      featureStateRevision = buildFeatureStateRevision(
        featureStateEntryRevisionById: nextFeatureStateEntryRevisionById
      )
    }
    let featureIds = Set(nextIdsInOrder)
    let featureStateChangedIds =
      effectiveBase.featureStateEntryRevisionById == nextFeatureStateEntryRevisionById
        ? Set<String>()
        : Set(
            nextFeatureStateEntryRevisionById.compactMap { featureId, revision in
              effectiveBase.featureStateEntryRevisionById[featureId] == revision ? nil : featureId
            }
          )
    let addedFeatureIdsInOrder = nextIdsInOrder.filter { !effectiveBase.featureIds.contains($0) }
    let updatedFeatureIdsInOrder = nextIdsInOrder.filter { featureId in
      guard effectiveBase.featureIds.contains(featureId) else {
        return false
      }
      return effectiveBase.diffKeyById[featureId] != nextDiffKeyById[featureId]
    }
    let removedFeatureIds = effectiveBase.featureIds.subtracting(featureIds)
    let removedFeatureIdsInOrder = effectiveBase.idsInOrder.filter { removedFeatureIds.contains($0) }
    let derivedRemovedGroupIds = Set(
      removedFeatureIds.compactMap { featureId in
        effectiveBase.markerKeyByFeatureId[featureId]
      }
    )
    let dirtyGroupIds =
      (
        !delta.dirtyGroupIds.isEmpty ? delta.dirtyGroupIds : Set(nextMarkerKeyByFeatureId.values)
      ).union(derivedRemovedGroupIds)
    let orderChangedGroupIds =
      (
        !delta.orderChangedGroupIds.isEmpty ? delta.orderChangedGroupIds : dirtyGroupIds
      ).union(derivedRemovedGroupIds)
    let removedGroupIds = delta.removedGroupIds.union(derivedRemovedGroupIds)
    let (groupedFeatureIdsByGroup, groupOrder) = buildGroupedFeatureIdsByGroup(
      idsInOrder: nextIdsInOrder,
      markerKeyByFeatureId: nextMarkerKeyByFeatureId
    )
    return ParsedFeatureCollection(
      baseSourceRevision: effectiveBase.sourceRevision,
      baseFeatureStateRevision: effectiveBase.featureStateRevision,
      sourceRevision: sourceRevision,
      featureStateRevision: featureStateRevision,
      dirtyGroupIds: dirtyGroupIds,
      orderChangedGroupIds: orderChangedGroupIds,
      removedGroupIds: removedGroupIds,
      featureStateEntryRevisionById: nextFeatureStateEntryRevisionById,
      featureStateChangedIds: featureStateChangedIds,
      featureIds: featureIds,
      addedFeatureIdsInOrder: addedFeatureIdsInOrder,
      updatedFeatureIdsInOrder: updatedFeatureIdsInOrder,
      removedFeatureIds: removedFeatureIds,
      removedFeatureIdsInOrder: removedFeatureIdsInOrder,
      idsInOrder: nextIdsInOrder,
      groupedFeatureIdsByGroup: groupedFeatureIdsByGroup,
      groupOrder: groupOrder,
      featureById: nextFeatureById,
      diffKeyById: nextDiffKeyById,
      featureStateById: nextFeatureStateById,
      markerKeyByFeatureId: nextMarkerKeyByFeatureId,
      addedFeatures: Self.mutationFeatures(
        idsInOrder: addedFeatureIdsInOrder,
        featureById: nextFeatureById
      ),
      updatedFeatures: Self.mutationFeatures(
        idsInOrder: updatedFeatureIdsInOrder,
        featureById: nextFeatureById
      )
    )
  }

  private static func buildParsedCollectionRevision(
    idsInOrder: [String],
    diffKeyById: [String: String]
  ) -> String {
    var hash = fnv1a64OffsetBasis
    Self.fnv1a64Append(&hash, string: String(idsInOrder.count))
    for featureId in idsInOrder {
      Self.fnv1a64Append(&hash, string: "|")
      Self.fnv1a64Append(&hash, string: featureId)
      Self.fnv1a64Append(&hash, string: "=")
      Self.fnv1a64Append(&hash, string: diffKeyById[featureId] ?? "")
    }
    return "\(idsInOrder.count):\(String(hash, radix: 16))"
  }

  private static let fnv1a64OffsetBasis: UInt64 = 0xcbf29ce484222325
  private static let fnv1a64Prime: UInt64 = 0x100000001b3

  private static func fnv1a64Append(_ hash: inout UInt64, string: String) {
    for byte in string.utf8 {
      hash ^= UInt64(byte)
      hash = hash &* fnv1a64Prime
    }
  }

  private static func buildFeatureStateRevision(
    featureStateById: [String: [String: Any]]
  ) -> String {
    buildFeatureStateRevision(
      featureStateEntryRevisionById: makeFeatureStateEntryRevisionById(featureStateById: featureStateById)
    )
  }

  private static func makeFeatureStateEntryRevisionById(
    featureStateById: [String: [String: Any]]
  ) -> [String: String] {
    var revisionById: [String: String] = [:]
    revisionById.reserveCapacity(featureStateById.count)
    for (featureId, state) in featureStateById {
      revisionById[featureId] = buildFeatureStateEntryRevision(state: state)
    }
    return revisionById
  }

  private static func buildFeatureStateRevision(
    featureStateEntryRevisionById: [String: String]
  ) -> String {
    let orderedFeatureIds = featureStateEntryRevisionById.keys.sorted()
    var hash = fnv1a64OffsetBasis
    Self.fnv1a64Append(&hash, string: String(orderedFeatureIds.count))
    for featureId in orderedFeatureIds {
      Self.fnv1a64Append(&hash, string: "|")
      Self.fnv1a64Append(&hash, string: featureId)
      Self.fnv1a64Append(&hash, string: "=")
      Self.fnv1a64Append(&hash, string: featureStateEntryRevisionById[featureId] ?? "")
    }
    return Self.finishHashedRevision(hash: hash, count: orderedFeatureIds.count)
  }

  private static func finishHashedRevision(hash: UInt64, count: Int) -> String {
    "\(count):\(String(hash, radix: 16))"
  }

  private static func buildFeatureStateEntryRevision(
    state: [String: Any]
  ) -> String {
    guard
      let data = try? JSONSerialization.data(
        withJSONObject: sanitizeFeatureDiffJSONObject(state, isFeatureRoot: false),
        options: [.sortedKeys]
      ),
      let stateString = String(data: data, encoding: .utf8)
    else {
      return ""
    }
    return stateString
  }

  private static func makeFeatureDiffKey(encodedFeatureData: Data) -> String? {
    guard let rawFeature = try? JSONSerialization.jsonObject(with: encodedFeatureData) as? [String: Any] else {
      return nil
    }
    return makeFeatureDiffKey(rawFeature: rawFeature)
  }

  private static func makeFeatureDiffKey(feature: Feature) -> String? {
    var rawFeature: [String: Any] = [
      "type": "Feature",
    ]
    if let properties = feature.properties?.turfRawValue as? [String: Any] {
      rawFeature["properties"] = properties
    }
    if let geometry = feature.geometry {
      switch geometry {
      case .point(let point):
        rawFeature["geometry"] = [
          "type": "Point",
          "coordinates": [
            point.coordinates.longitude,
            point.coordinates.latitude,
          ],
        ]
      default:
        return nil
      }
    }
    return makeFeatureDiffKey(rawFeature: rawFeature)
  }

  private static func makeFeatureDiffKey(rawFeature: [String: Any]) -> String? {
    let normalizedFeature = sanitizeFeatureDiffJSONObject(rawFeature, isFeatureRoot: true)
    guard JSONSerialization.isValidJSONObject(normalizedFeature),
          let data = try? JSONSerialization.data(withJSONObject: normalizedFeature, options: [.sortedKeys])
    else {
      return nil
    }
    return String(data: data, encoding: .utf8)
  }

  private static func sanitizeFeatureDiffJSONObject(
    _ object: [String: Any],
    isFeatureRoot: Bool = false
  ) -> [String: Any] {
    var sanitized: [String: Any] = [:]
    for (key, value) in object {
      if isFeatureRoot && key == "id" {
        continue
      }
      if key == "properties", let properties = value as? [String: Any] {
        sanitized[key] = sanitizeFeatureDiffProperties(properties)
        continue
      }
      sanitized[key] = sanitizeFeatureDiffValue(value)
    }
    return sanitized
  }

  private static func sanitizeFeatureDiffProperties(_ properties: [String: Any]) -> [String: Any] {
    var sanitized: [String: Any] = [:]
    for (key, value) in properties {
      if transientVisualPropertyKeys.contains(key) {
        continue
      }
      sanitized[key] = sanitizeFeatureDiffValue(value)
    }
    return sanitized
  }

  private static func sanitizeFeatureDiffValue(_ value: Any) -> Any {
    switch value {
    case let object as [String: Any]:
      return sanitizeFeatureDiffJSONObject(object)
    case let array as [Any]:
      return array.map { sanitizeFeatureDiffValue($0) }
    default:
      return value
    }
  }

  private static func featureBySettingNumericProperties(
    _ feature: Feature,
    numericProperties: [String: Double],
    stringProperties: [String: String] = [:]
  ) -> Feature {
    var nextFeature = feature
    var properties = nextFeature.properties ?? JSONObject()
    for (key, value) in numericProperties {
      properties[key] = JSONValue(rawValue: value)
    }
    for (key, value) in stringProperties {
      properties[key] = JSONValue(rawValue: value)
    }
    nextFeature.properties = properties
    return nextFeature
  }

  private static func effectiveLabelPreference(
    for feature: Feature,
    markerKey: String,
    stickyCandidateByIdentity: [String: String]
  ) -> String {
    let properties = feature.properties?.turfRawValue as? [String: Any]
    let restaurantId = properties?["restaurantId"] as? String
    if let stickyIdentityKey = Self.buildLabelStickyIdentityKey(
      restaurantId: restaurantId,
      markerKey: markerKey
    ), let stickyCandidate = Self.labelCandidateString(from: stickyCandidateByIdentity[stickyIdentityKey]) {
      return stickyCandidate
    }
    return "bottom"
  }

  private static func retainedLabelFeatureState(
    for feature: Feature,
    markerKey: String,
    stickyCandidateByIdentity: [String: String]
  ) -> [String: Any] {
    [:]
  }

  private static func extractFeatureState(from rawProperties: Any?) -> [String: Any] {
    guard let properties = rawProperties as? [String: Any] else {
      return [:]
    }
    var state: [String: Any] = [:]
    for key in transientVisualPropertyKeys {
      if let value = properties[key] as? NSNumber {
        state[key] = value.doubleValue
      }
    }
    return state
  }

  private static func applyFeatureStates(
    sourceId: String,
    previousFeatureStateRevision: String,
    nextFeatureStateRevision: String,
    changedFeatureStateIds: Set<String>,
    featureStateById: [String: [String: Any]],
    previousFeatureStateById: [String: [String: Any]],
    mapboxMap: MapboxMap
  ) {
    guard previousFeatureStateRevision != nextFeatureStateRevision else {
      return
    }
    guard !changedFeatureStateIds.isEmpty else {
      return
    }
    for featureId in changedFeatureStateIds {
      guard let state = featureStateById[featureId], !state.isEmpty else {
        continue
      }
      if Self.featureStatesEqual(previousFeatureStateById[featureId], state) {
        continue
      }
      mapboxMap.setFeatureState(sourceId: sourceId, featureId: featureId, state: state) { _ in }
    }
  }

  private static func mergedFeatureState(
    _ existing: [String: Any],
    with updates: [String: Any]
  ) -> [String: Any] {
    var merged = existing
    for (key, value) in updates {
      merged[key] = value
    }
    return merged
  }

  private static func featureStatesEqual(_ left: [String: Any]?, _ right: [String: Any]) -> Bool {
    guard let left else {
      return false
    }
    guard left.count == right.count else {
      return false
    }
    for (key, value) in right {
      let lhsNumber = left[key] as? NSNumber
      let rhsNumber = value as? NSNumber
      if let lhsNumber, let rhsNumber {
        if lhsNumber.doubleValue != rhsNumber.doubleValue {
          return false
        }
        continue
      }
      let lhsString = left[key] as? String
      let rhsString = value as? String
      if let lhsString, let rhsString {
        if lhsString != rhsString {
          return false
        }
        continue
      }
      return false
    }
    return true
  }

  private static func featureIdentifierString(_ identifier: FeatureIdentifier) -> String {
    switch identifier {
    case .string(let value):
      return value
    case .number(let value):
      return String(value)
    @unknown default:
      return String(describing: identifier)
    }
  }

  private static func extractMarkerKey(
    from rawProperties: Any?,
    featureId: String,
    sourceId: String
  ) throws -> String {
    guard let properties = rawProperties as? [String: Any] else {
      throw NSError(
        domain: "SearchMapRenderController",
        code: 8,
        userInfo: [
          NSLocalizedDescriptionKey:
            "Feature \(featureId) missing markerKey properties payload sourceId=\(sourceId)"
        ]
      )
    }
    guard let markerKey = properties["markerKey"] as? String, !markerKey.isEmpty else {
      let labelCandidate = properties["labelCandidate"] as? String ?? ""
      let restaurantId = properties["restaurantId"] as? String ?? ""
      throw NSError(
        domain: "SearchMapRenderController",
        code: 9,
        userInfo: [
          NSLocalizedDescriptionKey:
            "Feature \(featureId) missing required markerKey sourceId=\(sourceId) labelCandidate=\(labelCandidate) restaurantId=\(restaurantId)"
        ]
      )
    }
    let labelCandidate = properties["labelCandidate"] as? String ?? ""
    let restaurantId = properties["restaurantId"] as? String ?? ""
    if properties["labelCandidate"] as? String != nil {
      let expectedPrefix = "\(markerKey)::label::"
      guard featureId.hasPrefix(expectedPrefix) else {
        throw NSError(
          domain: "SearchMapRenderController",
          code: 10,
          userInfo: [
            NSLocalizedDescriptionKey:
              "Feature \(featureId) markerKey mismatch sourceId=\(sourceId) labelCandidate=\(labelCandidate) restaurantId=\(restaurantId) expected label feature.id prefix \(expectedPrefix) gotFeatureId=\(featureId) markerKey=\(markerKey)"
          ]
        )
      }
      return markerKey
    }
    guard markerKey == featureId else {
      throw NSError(
        domain: "SearchMapRenderController",
        code: 10,
        userInfo: [
          NSLocalizedDescriptionKey:
            "Feature \(featureId) markerKey mismatch sourceId=\(sourceId) restaurantId=\(restaurantId) expected feature.id contract, got \(markerKey)"
        ]
      )
    }
    return markerKey
  }
  private static func findMapboxMapView(in view: UIView) -> MapView? {
    if let mapView = view as? MapView {
      return mapView
    }
    for subview in view.subviews {
      if let found = findMapboxMapView(in: subview) {
        return found
      }
    }
    return nil
  }

  private static func isGestureDelegateHostView(_ view: UIView) -> Bool {
    view.responds(to: addGestureDelegateSelector) && view.responds(to: removeGestureDelegateSelector)
  }

  private static func addGestureDelegate(_ delegate: GestureManagerDelegate, to view: UIView) -> Bool {
    guard isGestureDelegateHostView(view) else {
      return false
    }
    _ = view.perform(addGestureDelegateSelector, with: delegate)
    return true
  }

  private static func removeGestureDelegate(_ delegate: GestureManagerDelegate, from view: UIView) {
    guard isGestureDelegateHostView(view) else {
      return
    }
    _ = view.perform(removeGestureDelegateSelector, with: delegate)
  }

  private static func findGestureDelegateHostView(in view: UIView) -> UIView? {
    if isGestureDelegateHostView(view) {
      return view
    }
    for subview in view.subviews {
      if let found = findGestureDelegateHostView(in: subview) {
        return found
      }
    }
    return nil
  }

  private func lookupMapHandle(
    for mapTag: NSNumber,
    emitDiagnostic: Bool = true
  ) -> ResolvedMapHandle? {
    if
      let viewRegistry = viewRegistry_DEPRECATED,
      let resolvedView = Self.resolveReactView(from: viewRegistry, mapTag: mapTag),
      let mapView = Self.findMapboxMapView(in: resolvedView)
    {
      let gestureDelegateHostView = Self.findGestureDelegateHostView(in: resolvedView)
      if emitDiagnostic {
        emit([
          "type": "error",
          "instanceId": "__native_diag__",
          "message": "lookup_used_viewRegistry tag=\(mapTag.stringValue)",
        ])
      }
      return ResolvedMapHandle(rootView: resolvedView, gestureDelegateHostView: gestureDelegateHostView, mapView: mapView)
    }

    if
      let bridge,
      let uiManager = bridge.value(forKey: "uiManager") as? NSObject,
      let resolvedView = Self.resolveReactView(from: uiManager, mapTag: mapTag),
      let mapView = Self.findMapboxMapView(in: resolvedView)
    {
      let gestureDelegateHostView = Self.findGestureDelegateHostView(in: resolvedView)
      if emitDiagnostic {
        emit([
          "type": "error",
          "instanceId": "__native_diag__",
          "message": "lookup_used_uiManager tag=\(mapTag.stringValue)",
        ])
      }
      return ResolvedMapHandle(rootView: resolvedView, gestureDelegateHostView: gestureDelegateHostView, mapView: mapView)
    }

    if emitDiagnostic {
      emit([
        "type": "error",
        "instanceId": "__native_diag__",
        "message": "lookup_no_owner tag=\(mapTag.stringValue) hasViewRegistry=\(viewRegistry_DEPRECATED != nil) hasBridge=\(bridge != nil)",
      ])
    }
    return nil
  }

  private static func resolveReactView(
    from owner: NSObject,
    mapTag: NSNumber
  ) -> UIView? {
    let selector = NSSelectorFromString("viewForReactTag:")
    guard owner.responds(to: selector) else {
      return nil
    }
    guard
      let unmanagedView = owner.perform(selector, with: mapTag),
      var resolvedView = unmanagedView.takeUnretainedValue() as? UIView
    else {
      return nil
    }
    if resolvedView.responds(to: Selector(("contentView"))),
       let contentView = resolvedView.value(forKey: "contentView") as? UIView {
      resolvedView = contentView
    }
    return resolvedView
  }

  private func emit(_ body: [String: Any]) {
    guard hasListeners else {
      return
    }
    let startedAt = nativeApplyAttributionEnabled ? CACurrentMediaTime() * 1000 : 0
    sendEvent(withName: eventName, body: body)
    if nativeApplyAttributionEnabled {
      recordNativeApply(
        section: "lifecycle.event_emit",
        phase: "native",
        source: (body["type"] as? String) ?? "unknown",
        durationMs: CACurrentMediaTime() * 1000 - startedAt,
        operationCount: 1
      )
    }
  }

  private func emitVisualDiag(instanceId: String, message: String) {
    guard enableVisualDiagnostics else {
      return
    }
    if lastVisualDiagByInstance[instanceId] == message {
      return
    }
    lastVisualDiagByInstance[instanceId] = message
    emit([
      "type": "visual_diagnostic",
      "instanceId": instanceId,
      "message": message,
    ])
  }

  private func maybeProbeHandleIdentity(
    mapTag: NSNumber,
    handle: ResolvedMapHandle
  ) -> String {
    let mapTagKey = mapTag.stringValue
    let cachedSummary = Self.handleIdentitySummary(handle)
    var parts = ["cached{\(cachedSummary)}"]
    if let liveHandle = lookupMapHandle(for: mapTag, emitDiagnostic: false) {
      installLifecycleProbes(for: mapTag, handle: liveHandle)
      let liveSummary = Self.handleIdentitySummary(liveHandle)
      parts.append("live{\(liveSummary)}")
      parts.append(
        "sameRoot=\(Self.intFlag(handle.rootView === liveHandle.rootView)) sameMap=\(Self.intFlag(handle.mapView === liveHandle.mapView))"
      )
      let signature = parts.joined(separator: " ")
      if signature != lastHandleIdentitySignatureByMapTag[mapTagKey] {
        lastHandleIdentitySignatureByMapTag[mapTagKey] = signature
        emitMapTagDiag(mapTag: mapTag, message: "map_handle_identity \(signature)")
      }
    } else {
      let signature = "\(cachedSummary) live{nil}"
      if signature != lastHandleIdentitySignatureByMapTag[mapTagKey] {
        lastHandleIdentitySignatureByMapTag[mapTagKey] = signature
        emitMapTagDiag(mapTag: mapTag, message: "map_handle_identity cached{\(cachedSummary)} live{nil}")
      }
      parts.append("live{nil}")
    }
    return parts.joined(separator: " ")
  }

  private func managedSourcePresenceSummary(
    for state: InstanceState,
    handle: ResolvedMapHandle
  ) -> String {
    let sourceIds = managedSourceIds(for: state)
    let presentIds = sourceIds.filter { handle.mapView.mapboxMap.sourceExists(withId: $0) }
    let missingIds = sourceIds.filter { !presentIds.contains($0) }
    return
      "sourcesPresent=\(presentIds.count)/\(sourceIds.count) missing=\(missingIds.isEmpty ? "none" : missingIds.joined(separator: ",")) \(managedLayerPresenceSummary(for: state, handle: handle))"
  }

  private func managedLayerPresenceSummary(
    for state: InstanceState,
    handle: ResolvedMapHandle
  ) -> String {
    let sourceIdSet = Set(managedSourceIds(for: state))
    guard !sourceIdSet.isEmpty else {
      return "layersPresent=0 pinLayers=0 pinShadowLayers=0"
    }

    var managedLayerIds: [String] = []
    var pinLayerIds: [String] = []
    do {
      for layerInfo in handle.mapView.mapboxMap.allLayerIdentifiers {
        let properties = try handle.mapView.mapboxMap.layerProperties(for: layerInfo.id)
        guard let sourceId = properties["source"] as? String, sourceIdSet.contains(sourceId) else {
          continue
        }
        managedLayerIds.append(layerInfo.id)
        if sourceId == state.pinSourceId {
          pinLayerIds.append(layerInfo.id)
        }
      }
    } catch {
      return "layersProbeError=\(error.localizedDescription)"
    }

    let pinShadowLayerIds = pinLayerIds.filter {
      $0.hasPrefix("restaurant-style-pins-shadow-slot-")
    }
    let shadowSamples = pinShadowLayerIds.prefix(6).joined(separator: ",")
    return
      "layersPresent=\(managedLayerIds.count) pinLayers=\(pinLayerIds.count) pinShadowLayers=\(pinShadowLayerIds.count) pinShadowSamples=\(shadowSamples.isEmpty ? "none" : shadowSamples)"
  }

  private static func shortTypeName(_ object: AnyObject) -> String {
    let fullName = NSStringFromClass(type(of: object))
    return fullName.components(separatedBy: ".").last ?? fullName
  }

  private static func intFlag(_ value: Bool) -> Int {
    value ? 1 : 0
  }

  private static func opacitySummary(for layer: CALayer?) -> String {
    guard let layer else {
      return "nil"
    }
    return String(Self.round3(Double(layer.opacity)))
  }

  private static func rectSummary(_ rect: CGRect) -> String {
    "\(Int(rect.origin.x.rounded())),\(Int(rect.origin.y.rounded())),\(Int(rect.width.rounded()))x\(Int(rect.height.rounded()))"
  }

  private func isVisibleForCompositionProbe(_ view: UIView) -> Bool {
    !view.isHidden &&
      view.alpha > 0.01 &&
      view.layer.opacity > 0.01 &&
      view.bounds.width > 0 &&
      view.bounds.height > 0
  }

  private func visibleIntersectingSiblingSummary(for view: UIView) -> String {
    guard
      let parent = view.superview,
      let siblingIndex = parent.subviews.firstIndex(of: view)
    else {
      return "0:none"
    }
    let targetRect = parent.convert(view.bounds, from: view)
    guard siblingIndex + 1 < parent.subviews.count else {
      return "0:none"
    }
    var visibleCount = 0
    var samples: [String] = []
    for sibling in parent.subviews[(siblingIndex + 1)...] {
      guard isVisibleForCompositionProbe(sibling) else {
        continue
      }
      let siblingRect = parent.convert(sibling.bounds, from: sibling)
      guard siblingRect.intersects(targetRect) else {
        continue
      }
      visibleCount += 1
      if samples.count < 3 {
        samples.append(
          "\(Self.shortTypeName(sibling))(a=\(Self.round3(Double(sibling.alpha))),h=\(Self.intFlag(sibling.isHidden)),lo=\(Self.round3(Double(sibling.layer.opacity))),po=\(Self.opacitySummary(for: sibling.layer.presentation())))"
        )
      }
    }
    return "\(visibleCount):\(samples.isEmpty ? "none" : samples.joined(separator: ","))"
  }

  private func viewCompositionChainSummary(for handle: ResolvedMapHandle) -> String {
    var entries: [String] = []
    var currentView: UIView? = handle.mapView
    var depth = 0
    while let view = currentView, depth < 6 {
      let layer = view.layer
      let rootRect = handle.rootView.convert(view.bounds, from: view)
      entries.append(
        "\(Self.shortTypeName(view))(a=\(Self.round3(Double(view.alpha))),h=\(Self.intFlag(view.isHidden)),lo=\(Self.round3(Double(layer.opacity))),po=\(Self.opacitySummary(for: layer.presentation())),w=\(Self.intFlag(view.window != nil)),c=\(Self.intFlag(view.clipsToBounds)),b=\(Int(view.bounds.width.rounded()))x\(Int(view.bounds.height.rounded())),r=\(Self.rectSummary(rootRect)),above=\(visibleIntersectingSiblingSummary(for: view)))"
      )
      if view === handle.rootView {
        break
      }
      currentView = view.superview
      depth += 1
    }
    if let currentView, currentView !== handle.rootView {
      entries.append("...")
    }
    return entries.joined(separator: " > ")
  }

  private func maybeProbeViewComposition(
    instanceId: String,
    scope: String,
    state: InstanceState
  ) {
    guard scope.hasPrefix("moving_native_") || scope.hasPrefix("reveal_native_") else {
      return
    }
    guard let frameGenerationId = state.activeFrameGenerationId else {
      return
    }
    let nowMs = Self.nowMs()
    if lastViewCompositionProbeFrameByInstance[instanceId] == frameGenerationId {
      return
    }
    if let lastProbeAtMs = lastViewCompositionProbeAtMsByInstance[instanceId],
       nowMs - lastProbeAtMs < viewCompositionProbeThrottleMs {
      return
    }
    lastViewCompositionProbeAtMsByInstance[instanceId] = nowMs
    lastViewCompositionProbeFrameByInstance[instanceId] = frameGenerationId

    let phase = state.lastPresentationBatchPhase
    let moving = state.currentViewportIsMoving
    let commitSummary = commitFenceWaitSummary(state: state)
    do {
      try withResolvedMapHandleResult(for: state.mapTag) { handle in
        let mapView = handle.mapView
        let windowName = mapView.window.map { Self.shortTypeName($0) } ?? "nil"
        let chainSummary = viewCompositionChainSummary(for: handle)
        let sourcePresenceSummary = managedSourcePresenceSummary(for: state, handle: handle)
        let handleIdentitySummary = maybeProbeHandleIdentity(mapTag: state.mapTag, handle: handle)
        emitVisualDiag(
          instanceId: instanceId,
          message:
            "view_composition_probe scope=\(scope) frame=\(frameGenerationId) phase=\(phase) moving=\(moving) window=\(windowName) chain=\(chainSummary) \(sourcePresenceSummary) \(handleIdentitySummary) \(commitSummary)"
        )
      }
    } catch {
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "view_composition_probe_failed scope=\(scope) frame=\(frameGenerationId) phase=\(phase) error=\(error.localizedDescription)"
      )
    }
  }

  private func slowActionWindowKey(instanceId: String, scope: String) -> String {
    "\(instanceId)::\(scope)"
  }

  private func recordSlowActionWindow(
    instanceId: String,
    scope: String,
    durationMs: Double,
    thresholdMs: Double,
    state: InstanceState,
    extra: String = ""
  ) {
    let key = slowActionWindowKey(instanceId: instanceId, scope: scope)
    let nowMs = Self.nowMs()
    let commitSummary = commitFenceWaitSummary(state: state)
    if durationMs >= thresholdMs {
      var window = slowActionWindowsByInstanceAndScope[key] ?? SlowActionWindowState()
      if window.streak == 0 {
        window.startedAtMs = nowMs
        window.maxDurationMs = durationMs
      }
      window.streak += 1
      window.maxDurationMs = max(window.maxDurationMs, durationMs)
      slowActionWindowsByInstanceAndScope[key] = window
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "slow_action_window scope=\(scope) streak=\(window.streak) windowMs=\(Int((nowMs - window.startedAtMs).rounded())) durationMs=\(Int(durationMs.rounded())) maxDurationMs=\(Int(window.maxDurationMs.rounded())) phase=\(state.lastPresentationBatchPhase) moving=\(state.currentViewportIsMoving) pins=\(state.lastPinCount) dots=\(state.lastDotCount) labels=\(state.lastLabelCount) \(commitSummary)\(extra.isEmpty ? "" : " \(extra)")"
      )
      maybeProbeViewComposition(instanceId: instanceId, scope: scope, state: state)
      return
    }
    guard let window = slowActionWindowsByInstanceAndScope[key], window.streak > 0 else {
      return
    }
    slowActionWindowsByInstanceAndScope.removeValue(forKey: key)
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "slow_action_window_settled scope=\(scope) streak=\(window.streak) windowMs=\(Int((nowMs - window.startedAtMs).rounded())) maxDurationMs=\(Int(window.maxDurationMs.rounded())) phase=\(state.lastPresentationBatchPhase) moving=\(state.currentViewportIsMoving) pins=\(state.lastPinCount) dots=\(state.lastDotCount) labels=\(state.lastLabelCount) \(commitSummary)\(extra.isEmpty ? "" : " \(extra)")"
    )
  }

  private static func readFeatureCount(fromJSON json: String) -> Int {
    guard
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let features = object["features"] as? [Any]
    else {
      return 0
    }
    return features.count
  }

  private static func readPresentationBatchPhase(fromJSON json: String) -> String {
    guard
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return "unknown"
    }
    let executionStage = object["executionStage"] as? String ?? "idle"
    let snapshotKind = object["snapshotKind"] as? String
    if snapshotKind == "results_exit" {
      if executionStage == "exit_executing" {
        return "exiting"
      }
      if executionStage == "exit_requested" {
        return "exit_preroll"
      }
    } else if snapshotKind != nil {
      if executionStage == "enter_executing" {
        return "entering"
      }
      if executionStage == "enter_pending_mount" || executionStage == "enter_mounted_hidden" {
        return "enter_requested"
      }
      if executionStage == "settled" {
        return "live"
      }
    }
    let coverState = object["coverState"] as? String
    if coverState == "initial_loading" {
      return "covered"
    }
    return "idle"
  }

  private static func readCoverState(fromJSON json: String) -> String? {
    guard
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return nil
    }
    return object["coverState"] as? String
  }

  private static func readDismissRequestKey(fromJSON json: String) -> String? {
    guard
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return nil
    }
    if object["snapshotKind"] as? String == "results_exit" {
      return object["transactionId"] as? String
    }
    return nil
  }

  private static func readEnterRequestKey(fromJSON json: String) -> String? {
    guard
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return nil
    }
    if
      let snapshotKind = object["snapshotKind"] as? String,
      snapshotKind != "results_exit"
    {
      return object["transactionId"] as? String
    }
    return nil
  }

  private static func readEnterStatus(fromJSON json: String) -> String? {
    guard
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return nil
    }
    if
      let snapshotKind = object["snapshotKind"] as? String,
      snapshotKind != "results_exit"
    {
      switch object["executionStage"] as? String {
      case "enter_pending_mount":
        return "pending_mount"
      case "enter_mounted_hidden":
        return "mounted_hidden"
      case "enter_executing":
        return "entering"
      default:
        return nil
      }
    }
    return nil
  }

  private static func readEnterStartToken(fromJSON json: String) -> Double? {
    guard
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return nil
    }
    if
      let snapshotKind = object["snapshotKind"] as? String,
      snapshotKind != "results_exit"
    {
      if let value = object["startToken"] as? NSNumber {
        return value.doubleValue
      }
      if let value = object["startToken"] as? Double {
        return value
      }
      return nil
    }
    return nil
  }

  private static func isEnterStatusArmable(_ status: String?) -> Bool {
    status == "pending_mount" || status == "mounted_hidden" || status == "entering"
  }

  private static func shouldHidePresentationWithoutActiveRequests(_ phase: String) -> Bool {
    phase == "covered" ||
    phase == "enter_requested" ||
    phase == "entering" ||
    phase == "exit_preroll" ||
    phase == "exiting"
  }

  private static func readAllowEmptyEnter(fromJSON json: String) -> Bool {
    guard
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return true
    }
    if let value = object["allowEmptyEnter"] as? Bool {
      return value
    }
    if let value = object["allowEmptyEnter"] as? NSNumber {
      return value.boolValue
    }
    return true
  }

  private static func nowMs() -> Double {
    CACurrentMediaTime() * 1000
  }

  private static let emptyFeatureCollectionJSON = #"{"type":"FeatureCollection","features":[]}"#
}

private extension Array {
  subscript(safe index: Int) -> Element? {
    guard indices.contains(index) else {
      return nil
    }
    return self[index]
  }
}
