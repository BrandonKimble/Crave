import Foundation
import CoreLocation
import MapboxMaps
import QuartzCore
import React
import Turf
import UIKit

@objc(UIFrameSampler)
final class UIFrameSampler: RCTEventEmitter {
  private static let windowEventName = "uiFrameSamplerWindow"
  private static let stallEventName = "uiFrameSamplerStall"
  private static let maxFrameMs: Double = 5000
  private static let minWindowMs: Double = 120
  private static let maxWindowMs: Double = 60000
  private static let minFpsThreshold: Double = 1
  private static let maxFpsThreshold: Double = 240
  private static let minStallFrameMs: Double = 16

  private var displayLink: CADisplayLink?
  private var hasListeners = false
  private var windowStartedAtMs: Double = 0
  private var lastFrameAtMs: Double = 0
  private var frameCount = 0
  private var totalFrameMs: Double = 0
  private var maxFrameMs: Double = 0
  private var stallCount = 0
  private var stallLongestMs: Double = 0
  private var frameDurations: [Double] = []
  private var windowMs: Double = 500
  private var stallFrameMs: Double = 80
  private var logOnlyBelowFps: Double = 58
  private var displayHz: Double = 60

  @objc
  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    [Self.windowEventName, Self.stallEventName]
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  @objc
  func start(_ options: NSDictionary?) {
    DispatchQueue.main.async { [weak self] in
      self?.startOnMain(options)
    }
  }

  @objc
  func stop() {
    DispatchQueue.main.async { [weak self] in
      self?.stopOnMain()
    }
  }

  override func invalidate() {
    stopOnMain()
    super.invalidate()
  }

  private func startOnMain(_ options: NSDictionary?) {
    let requestedWindowMs = readNumber(options, key: "windowMs") ?? 500
    let requestedStallFrameMs = readNumber(options, key: "stallFrameMs") ?? 80
    let requestedLogOnlyBelowFps = readNumber(options, key: "logOnlyBelowFps") ?? 58

    windowMs = clamp(requestedWindowMs, min: Self.minWindowMs, max: Self.maxWindowMs)
    stallFrameMs = clamp(
      requestedStallFrameMs,
      min: Self.minStallFrameMs,
      max: Self.maxFrameMs
    )
    logOnlyBelowFps = clamp(
      requestedLogOnlyBelowFps,
      min: Self.minFpsThreshold,
      max: Self.maxFpsThreshold
    )

    stopOnMain()
    resetWindowState(nowMs: nowMs())
    displayHz = resolveDisplayHz()
    let link = CADisplayLink(target: self, selector: #selector(onFrame(_:)))
    link.add(to: .main, forMode: .common)
    displayLink = link
  }

  private func stopOnMain() {
    displayLink?.invalidate()
    displayLink = nil
    resetWindowState(nowMs: nowMs())
  }

  @objc
  private func onFrame(_ link: CADisplayLink) {
    let now = nowMs()
    if windowStartedAtMs <= 0 {
      windowStartedAtMs = now
      lastFrameAtMs = now
      return
    }
    let frameMs = now - lastFrameAtMs
    lastFrameAtMs = now
    if frameMs <= 0 || frameMs > Self.maxFrameMs || !frameMs.isFinite {
      flushWindow(nowMs: now)
      return
    }

    frameCount += 1
    totalFrameMs += frameMs
    maxFrameMs = max(maxFrameMs, frameMs)
    frameDurations.append(frameMs)

    if frameMs >= stallFrameMs {
      stallCount += 1
      stallLongestMs = max(stallLongestMs, frameMs)
      emitStall(nowMs: now, frameMs: frameMs)
    }

    if now - windowStartedAtMs >= windowMs {
      flushWindow(nowMs: now)
    }
  }

  private func flushWindow(nowMs: Double) {
    guard frameCount > 0 else {
      resetWindowState(nowMs: nowMs)
      return
    }
    let elapsedWindowMs = nowMs - windowStartedAtMs
    guard elapsedWindowMs > 0, elapsedWindowMs.isFinite else {
      resetWindowState(nowMs: nowMs)
      return
    }
    let avgFrameMs = totalFrameMs / Double(frameCount)
    let p95FrameMs = percentile(frameDurations, 95)
    let avgFps = toFps(frameMs: avgFrameMs)
    let floorFps = toFps(frameMs: maxFrameMs)
    let p95Fps = toFps(frameMs: p95FrameMs)
    let expectedFrameMs = 1000 / max(displayHz, 1)
    let expectedFrames = elapsedWindowMs / expectedFrameMs
    let droppedFrameEstimate = max(0, expectedFrames - Double(frameCount))
    let droppedFrameRatio = expectedFrames > 0 ? droppedFrameEstimate / expectedFrames : 0
    let shouldEmit = stallCount > 0 || avgFps < logOnlyBelowFps || floorFps < logOnlyBelowFps
    if shouldEmit, hasListeners {
      sendEvent(
        withName: Self.windowEventName,
        body: [
          "event": "window",
          "nowMs": round1(nowMs),
          "windowMs": round1(elapsedWindowMs),
          "frameCount": frameCount,
          "avgFrameMs": round1(avgFrameMs),
          "avgFps": round1(avgFps),
          "floorFps": round1(floorFps),
          "p95FrameMs": round1(p95FrameMs),
          "p95Fps": round1(p95Fps),
          "maxFrameMs": round1(maxFrameMs),
          "stallCount": stallCount,
          "stallLongestMs": round1(stallLongestMs),
          "droppedFrameEstimate": round1(droppedFrameEstimate),
          "droppedFrameRatio": round1(droppedFrameRatio),
          "displayHz": round1(displayHz),
        ]
      )
    }
    resetWindowState(nowMs: nowMs)
  }

  private func emitStall(nowMs: Double, frameMs: Double) {
    guard hasListeners else {
      return
    }
    let fps = toOptionalFps(frameMs: frameMs)
    let fpsValue: Any = fps.map { round1($0) } ?? NSNull()
    sendEvent(
      withName: Self.stallEventName,
      body: [
        "event": "stall",
        "nowMs": round1(nowMs),
        "frameMs": round1(frameMs),
        "fps": fpsValue,
      ]
    )
  }

  private func resetWindowState(nowMs: Double) {
    windowStartedAtMs = nowMs
    lastFrameAtMs = nowMs
    frameCount = 0
    totalFrameMs = 0
    maxFrameMs = 0
    stallCount = 0
    stallLongestMs = 0
    frameDurations.removeAll(keepingCapacity: true)
  }

  private func nowMs() -> Double {
    CACurrentMediaTime() * 1000
  }

  private func resolveDisplayHz() -> Double {
    let hz = Double(UIScreen.main.maximumFramesPerSecond)
    if hz.isFinite, hz > 0 {
      return hz
    }
    return 60
  }

  private func readNumber(_ options: NSDictionary?, key: String) -> Double? {
    guard let raw = options?[key] else {
      return nil
    }
    if let number = raw as? NSNumber {
      return number.doubleValue
    }
    if let value = raw as? Double {
      return value
    }
    if let value = raw as? Int {
      return Double(value)
    }
    return nil
  }

  private func clamp(_ value: Double, min: Double, max: Double) -> Double {
    Swift.min(max, Swift.max(min, value))
  }

  private func percentile(_ values: [Double], _ percentile: Double) -> Double {
    guard !values.isEmpty else {
      return 0
    }
    let sorted = values.sorted()
    let index = Int(clamp(ceil((percentile / 100) * Double(sorted.count)) - 1, min: 0, max: Double(sorted.count - 1)))
    return sorted[index]
  }

  private func toFps(frameMs: Double) -> Double {
    guard frameMs.isFinite, frameMs > 0 else {
      return 0
    }
    return 1000 / frameMs
  }

  private func toOptionalFps(frameMs: Double) -> Double? {
    guard frameMs.isFinite, frameMs > 0 else {
      return nil
    }
    return 1000 / frameMs
  }

  private func round1(_ value: Double) -> Double {
    (value * 10).rounded() / 10
  }
}

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
  private let eventName = "searchMapRenderControllerEvent"
  private let enableVisualDiagnostics = true
  private let dismissSettleDelayMs = 300
  private let revealSettleDelayMs = 300
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
    var lastVisibleLabelFeatureIds: [String] = []
    var lastLayerRenderedFeatureCount: Int = 0
    var lastEffectiveRenderedFeatureCount: Int = 0
    var stickyRevision: Int = 0
    var stickyCandidateByIdentity: [String: String] = [:]
    var stickyLastSeenAtMsByIdentity: [String: Double] = [:]
    var stickyMissingStreakByIdentity: [String: Int] = [:]
    var stickyProposedCandidateByIdentity: [String: String] = [:]
    var stickyProposedSinceAtMsByIdentity: [String: Double] = [:]
    var lastResetRequestKey: String? = nil
    var isRefreshInFlight: Bool = false
    var queuedRefreshDelayMs: Double? = nil
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

  private struct RevealBatchRef: Equatable {
    var requestKey: String
    var batchId: String
    var generationId: String
  }

  private struct RevealLaneState {
    var requestedRequestKey: String? = nil
    var mountedHidden: RevealBatchRef? = nil
    var armed: RevealBatchRef? = nil
    var revealing: RevealBatchRef? = nil
    var liveBaseline: RevealBatchRef? = nil
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
    var lastPresentationPhase: String
    var lastRevealRequestKey: String?
    var revealLane: RevealLaneState
    var lastRevealStartToken: Double?
    var lastRevealStartedRequestKey: String?
    var lastRevealFirstVisibleRequestKey: String?
    var lastRevealSettledRequestKey: String?
    var lastDismissRequestKey: String?
    var presentationExecutionPhase: String
    var lastPresentationStateJSON: String?
    var activeFrameGenerationId: String?
    var activeRevealBatchId: String?
    var highlightedMarkerKey: String?
    var interactionMode: String
    var currentViewportIsMoving: Bool
    var keepSourcesHiddenUntilReveal: Bool
    var allowEmptyReveal: Bool
    var currentPresentationOpacityTarget: Double
    var currentPresentationOpacityValue: Double
    var nextSourceCommitSequence: Int
    var pendingPresentationSettleRequestKey: String?
    var pendingPresentationSettleKind: String?
    var blockedRevealStartRequestKey: String?
    var blockedRevealStartCommitFenceStartedAtMs: Double?
    var blockedPresentationSettleRequestKey: String?
    var blockedPresentationSettleKind: String?
    var blockedPresentationCommitFenceStartedAtMs: Double?
    var blockedRevealStartCommitFenceBySourceId: [String: Set<String>]
    var blockedPresentationCommitFenceBySourceId: [String: Set<String>]
    var pendingSourceCommitDataIdsBySourceId: [String: Set<String>]
    var derivedFamilyStates: [String: DerivedFamilyState]
    var isAwaitingSourceRecovery: Bool
    var isReplayingSourceRecovery: Bool
    var sourceRecoveryPausedAtMs: Double?
  }

  private struct SlowActionWindowState {
    var streak: Int = 0
    var startedAtMs: Double = 0
    var maxDurationMs: Double = 0
  }

  private struct ResolvedMapHandleResolution {
    let handle: ResolvedMapHandle
    let didRefresh: Bool
  }

  private var hasListeners = false
  private var instances: [String: InstanceState] = [:]
  private var resolvedMapHandles: [String: ResolvedMapHandle] = [:]
  private var revealSettleWorkItems: [String: DispatchWorkItem] = [:]
  private var dismissSettleWorkItems: [String: DispatchWorkItem] = [:]
  private var revealFrameFallbackWorkItems: [String: DispatchWorkItem] = [:]
  private var dismissFrameFallbackWorkItems: [String: DispatchWorkItem] = [:]
  private var sourceRecoveryWorkItems: [String: DispatchWorkItem] = [:]
  private var labelObservationRefreshWorkItems: [String: DispatchWorkItem] = [:]
  private var presentationOpacityAnimators: [String: PresentationOpacityAnimator] = [:]
  private var livePinTransitionAnimators: [String: CADisplayLink] = [:]
  private var lastVisualDiagByInstance: [String: String] = [:]
  private var slowActionWindowsByInstanceAndScope: [String: SlowActionWindowState] = [:]
  private var lastRenderedFeatureProbeAtMsByInstance: [String: Double] = [:]
  private var lastRenderedFeatureProbeFrameByInstance: [String: String] = [:]
  private var lastViewCompositionProbeAtMsByInstance: [String: Double] = [:]
  private var lastViewCompositionProbeFrameByInstance: [String: String] = [:]
  private var lastHandleIdentitySignatureByMapTag: [String: String] = [:]
  private let slowActionThresholdMs = 12.0
  private let renderedFeatureProbeThrottleMs = 120.0
  private let frameSettleFallbackDelayMs = 96
  private let sourceRecoveryRetryDelayMs = 32
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
    super.invalidate()
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
        lastPresentationPhase: "idle",
        lastRevealRequestKey: nil,
        revealLane: RevealLaneState(),
        lastRevealStartToken: nil,
        lastRevealStartedRequestKey: nil,
        lastRevealFirstVisibleRequestKey: nil,
        lastRevealSettledRequestKey: nil,
        lastDismissRequestKey: nil,
        presentationExecutionPhase: "idle",
        lastPresentationStateJSON: nil,
        activeFrameGenerationId: nil,
        activeRevealBatchId: nil,
        highlightedMarkerKey: nil,
        interactionMode: "enabled",
        currentViewportIsMoving: false,
        keepSourcesHiddenUntilReveal: false,
        allowEmptyReveal: true,
        currentPresentationOpacityTarget: 1,
        currentPresentationOpacityValue: 1,
        nextSourceCommitSequence: 0,
        pendingPresentationSettleRequestKey: nil,
        pendingPresentationSettleKind: nil,
        blockedRevealStartRequestKey: nil,
        blockedRevealStartCommitFenceStartedAtMs: nil,
        blockedPresentationSettleRequestKey: nil,
        blockedPresentationSettleKind: nil,
        blockedPresentationCommitFenceStartedAtMs: nil,
        blockedRevealStartCommitFenceBySourceId: [:],
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
        isAwaitingSourceRecovery: false,
        isReplayingSourceRecovery: false,
        sourceRecoveryPausedAtMs: nil
      )
      self.lastRenderedFeatureProbeAtMsByInstance.removeValue(forKey: instanceId)
      self.lastRenderedFeatureProbeFrameByInstance.removeValue(forKey: instanceId)
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
          self.emit([
            "type": "attached",
            "instanceId": instanceId,
            "mapTag": mapTag,
          ])
          resolve(nil)
        case .failure(let error):
          self.instances.removeValue(forKey: instanceId)
          self.slowActionWindowsByInstanceAndScope = self.slowActionWindowsByInstanceAndScope.filter {
            !$0.key.hasPrefix("\(instanceId)::")
          }
          self.lastRenderedFeatureProbeAtMsByInstance.removeValue(forKey: instanceId)
          self.lastRenderedFeatureProbeFrameByInstance.removeValue(forKey: instanceId)
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
      self?.revealSettleWorkItems[instanceId]?.cancel()
      self?.revealSettleWorkItems[instanceId] = nil
      self?.dismissSettleWorkItems[instanceId]?.cancel()
      self?.dismissSettleWorkItems[instanceId] = nil
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
      self?.lastRenderedFeatureProbeAtMsByInstance.removeValue(forKey: instanceId)
      self?.lastRenderedFeatureProbeFrameByInstance.removeValue(forKey: instanceId)
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
    DispatchQueue.main.async { [weak self] in
      guard let self else {
        reject("search_map_render_controller_unavailable", "controller deallocated", nil)
        return
      }
      guard let instanceId = payload["instanceId"] as? String else {
        reject("search_map_render_controller_frame_invalid", "invalid render frame payload: missing instanceId", nil)
        return
      }
      guard self.instances[instanceId] != nil else {
        reject("search_map_render_controller_frame_invalid", "unknown instance or frame", nil)
        return
      }
      guard let frameGenerationId = payload["frameGenerationId"] as? String else {
        reject("search_map_render_controller_frame_invalid", "invalid render frame payload: missing frameGenerationId", nil)
        return
      }
      guard let revealBatchId = payload["revealBatchId"] as? String else {
        reject("search_map_render_controller_frame_invalid", "invalid render frame payload: missing revealBatchId", nil)
        return
      }
      guard let presentationStateJSON = payload["presentationStateJson"] as? String else {
        reject("search_map_render_controller_frame_invalid", "invalid render frame payload: missing presentationStateJson", nil)
        return
      }

      let sourceDeltas = payload["sourceDeltas"] as? [[String: Any]]
      let highlightedMarkerKey = payload["highlightedMarkerKey"] as? String
      let interactionMode = (payload["interactionMode"] as? String) ?? "enabled"
      let actionStartedAt = CACurrentMediaTime() * 1000
      do {
        let shouldBypassSnapshotApply =
          Self.readDismissRequestKey(fromJSON: presentationStateJSON) != nil &&
          (sourceDeltas?.isEmpty ?? true)
        let didSyncResidentFrame: Bool
        if shouldBypassSnapshotApply {
          guard var state = self.instances[instanceId] else {
            throw NSError(
              domain: "SearchMapRenderController",
              code: 1,
              userInfo: [NSLocalizedDescriptionKey: "unknown instance"]
            )
          }
          state.activeFrameGenerationId = frameGenerationId
          state.activeRevealBatchId = revealBatchId
          self.instances[instanceId] = state
          self.emitVisualDiag(
            instanceId: instanceId,
            message:
              "frame_snapshot_bypass reason=dismiss_presentation_only phase=\(state.lastPresentationPhase)"
          )
          try self.applyPresentationPayload(
            instanceId: instanceId,
            presentationStateJSON: presentationStateJSON
          )
          didSyncResidentFrame = true
        } else {
          didSyncResidentFrame = try self.applyRenderFrameSnapshotPayload(
            instanceId: instanceId,
            generationId: frameGenerationId,
            revealBatchId: revealBatchId,
            sourceDeltas: sourceDeltas
          )
          try self.applyPresentationPayload(
            instanceId: instanceId,
            presentationStateJSON: presentationStateJSON
          )
        }
        try self.applyInteractionModePayload(
          instanceId: instanceId,
          interactionMode: interactionMode
        )
        try self.applyHighlightedMarkerPayload(
          instanceId: instanceId,
          markerKey: highlightedMarkerKey
        )
        if didSyncResidentFrame, var state = self.instances[instanceId] {
          self.emit([
            "type": "render_frame_synced",
            "instanceId": instanceId,
            "frameGenerationId": frameGenerationId,
            "revealBatchId": revealBatchId,
            "pinCount": state.lastPinCount,
            "dotCount": state.lastDotCount,
            "labelCount": state.lastLabelCount,
            "sourceRevisions": [
              "pins": Self.mountedSourceState(sourceId: state.pinSourceId, state: state)?.sourceRevision ?? "",
              "pinInteractions": Self.mountedSourceState(sourceId: state.pinInteractionSourceId, state: state)?.sourceRevision ?? "",
              "dots": Self.mountedSourceState(sourceId: state.dotSourceId, state: state)?.sourceRevision ?? "",
              "dotInteractions": Self.mountedSourceState(sourceId: state.dotInteractionSourceId, state: state)?.sourceRevision ?? "",
              "labels": Self.mountedSourceState(sourceId: state.labelSourceId, state: state)?.sourceRevision ?? "",
              "labelInteractions": Self.mountedSourceState(sourceId: state.labelInteractionSourceId, state: state)?.sourceRevision ?? "",
              "labelCollisions": Self.mountedSourceState(sourceId: state.labelCollisionSourceId, state: state)?.sourceRevision ?? "",
            ],
          ])
          self.maybeEmitRevealBatchArmed(instanceId: instanceId, state: &state)
          let totalDurationMs = CACurrentMediaTime() * 1000 - actionStartedAt
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
            thresholdMs: state.lastPresentationPhase == "revealing" ? 120 : .greatestFiniteMagnitude,
            state: state,
            extra: "frame=\(frameGenerationId)"
          )
          if totalDurationMs >= self.slowActionThresholdMs {
            self.emit([
              "type": "error",
              "instanceId": "__native_diag__",
              "message":
                "slow_action action=setRenderFrame phase=\(state.lastPresentationPhase) totalMs=\(Int(totalDurationMs.rounded())) pins=\(state.lastPinCount) dots=\(state.lastDotCount) labels=\(state.lastLabelCount)",
            ])
          }
        }
        resolve(nil)
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
    revealBatchId: String,
    sourceDeltas: [[String: Any]]?
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
        "frame_begin phase=\(state.lastPresentationPhase) opacity=\(state.currentPresentationOpacityTarget) revealRequest=\(state.lastRevealRequestKey ?? "nil") revealStarted=\(state.lastRevealStartedRequestKey ?? "nil") revealSettled=\(state.lastRevealSettledRequestKey ?? "nil") dismissRequest=\(state.lastDismissRequestKey ?? "nil")"
    )
    if let sourceDeltas {
      for delta in try Self.parseSourceDeltas(sourceDeltas) {
        var familyState = Self.derivedFamilyState(sourceId: delta.sourceId, state: state)
        familyState.desiredCollection = try Self.applyParsedCollectionDelta(
          delta,
          to: familyState.desiredCollection
        )
        Self.setDerivedFamilyState(familyState, sourceId: delta.sourceId, state: &state)
      }
    }
    state.lastPinCount =
      Self.derivedFamilyState(sourceId: state.pinSourceId, state: state).desiredCollection.idsInOrder.count
    state.lastDotCount =
      Self.derivedFamilyState(sourceId: state.dotSourceId, state: state).desiredCollection.idsInOrder.count
    state.lastLabelCount =
      Self.derivedFamilyState(sourceId: state.labelSourceId, state: state).desiredCollection.idsInOrder.count
    state.activeFrameGenerationId = generationId
    state.activeRevealBatchId = revealBatchId
    self.instances[instanceId] = state
    try self.reconcileAndApplyCurrentFrameSnapshots(for: instanceId)
    state = self.instances[instanceId] ?? state
    if Self.isSourceRecoveryActive(state) {
      self.emitVisualDiag(
        instanceId: instanceId,
        message: "frame_apply_deferred reason=source_recovery phase=\(state.lastPresentationPhase)"
      )
      self.instances[instanceId] = state
      return false
    }
    self.emitVisualDiag(
      instanceId: instanceId,
      message:
        "frame_after_reconcile phase=\(state.lastPresentationPhase) opacity=\(state.currentPresentationOpacityTarget) revealRequest=\(state.lastRevealRequestKey ?? "nil") revealStarted=\(state.lastRevealStartedRequestKey ?? "nil") revealSettled=\(state.lastRevealSettledRequestKey ?? "nil") dismissRequest=\(state.lastDismissRequestKey ?? "nil")"
    )
    try self.applyHighlightedMarkerState(for: state, instanceId: instanceId)
    if self.shouldSuppressInteractions(state: state) {
      try self.applyInteractionSuppression(for: &state, instanceId: instanceId)
    }
    try self.applyCurrentPresentationOpacity(
      for: &state,
      instanceId: instanceId,
      reason: "frame_apply"
    )
    let presentationOpacity = state.currentPresentationOpacityValue
    self.emitVisualDiag(
      instanceId: instanceId,
      message:
        "frame_apply phase=\(state.lastPresentationPhase) opacity=\(presentationOpacity) pins=\(state.lastPinCount) dots=\(state.lastDotCount) labels=\(state.lastLabelCount) \(Self.phaseSummary(for: state))"
    )
    if let latestState = self.instances[instanceId],
       (latestState.lastPresentationPhase != state.lastPresentationPhase ||
         latestState.currentPresentationOpacityTarget != state.currentPresentationOpacityTarget ||
         latestState.lastRevealStartedRequestKey != state.lastRevealStartedRequestKey ||
         latestState.lastRevealSettledRequestKey != state.lastRevealSettledRequestKey) {
      self.emitVisualDiag(
        instanceId: instanceId,
        message:
          "frame_final_write_mismatch localPhase=\(state.lastPresentationPhase) localOpacity=\(state.currentPresentationOpacityTarget) localRevealStarted=\(state.lastRevealStartedRequestKey ?? "nil") localRevealSettled=\(state.lastRevealSettledRequestKey ?? "nil") latestPhase=\(latestState.lastPresentationPhase) latestOpacity=\(latestState.currentPresentationOpacityTarget) latestRevealStarted=\(latestState.lastRevealStartedRequestKey ?? "nil") latestRevealSettled=\(latestState.lastRevealSettledRequestKey ?? "nil")"
      )
    }
    state = self.instances[instanceId] ?? state
    let totalDurationMs = CACurrentMediaTime() * 1000 - actionStartedAt
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
      thresholdMs: state.lastPresentationPhase == "revealing" ? 120 : .greatestFiniteMagnitude,
      state: state,
      extra: "frame=\(generationId)"
    )
    if totalDurationMs >= self.slowActionThresholdMs {
      self.emit([
        "type": "error",
        "instanceId": "__native_diag__",
        "message":
          "slow_action action=applyFrameSnapshot phase=\(state.lastPresentationPhase) totalMs=\(Int(totalDurationMs.rounded())) pins=\(state.lastPinCount) dots=\(state.lastDotCount) labels=\(state.lastLabelCount)",
      ])
    }
    return true
  }

  private static func makeRevealBatchRef(
    requestKey: String?,
    batchId: String?,
    generationId: String?
  ) -> RevealBatchRef? {
    guard let requestKey, let batchId, let generationId else {
      return nil
    }
    return RevealBatchRef(requestKey: requestKey, batchId: batchId, generationId: generationId)
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
      return
    }
    let previousPresentationPhase = state.lastPresentationPhase
    let previousPresentationOpacityTarget = state.currentPresentationOpacityTarget
    state.lastPresentationStateJSON = presentationStateJSON
    state.lastPresentationPhase = Self.readPresentationPhase(fromJSON: presentationStateJSON)
    let revealRequestKey = Self.readRevealRequestKey(fromJSON: presentationStateJSON)
    let revealStatus = Self.readRevealStatus(fromJSON: presentationStateJSON)
    let revealStartToken = Self.readRevealStartToken(fromJSON: presentationStateJSON)
    state.allowEmptyReveal = Self.readAllowEmptyReveal(fromJSON: presentationStateJSON)
    if revealRequestKey != state.lastRevealRequestKey {
      self.revealSettleWorkItems[instanceId]?.cancel()
      self.revealSettleWorkItems[instanceId] = nil
      state.lastRevealRequestKey = revealRequestKey
      state.revealLane = RevealLaneState()
      state.lastRevealStartToken = nil
      state.lastRevealStartedRequestKey = nil
      state.lastRevealFirstVisibleRequestKey = nil
      state.lastRevealSettledRequestKey = nil
      state.pendingPresentationSettleRequestKey = nil
      state.pendingPresentationSettleKind = nil
      state.blockedRevealStartRequestKey = nil
      state.blockedRevealStartCommitFenceStartedAtMs = nil
      state.blockedRevealStartCommitFenceBySourceId.removeAll()
      state.blockedPresentationCommitFenceBySourceId.removeAll()
      state.blockedPresentationSettleRequestKey = nil
      state.blockedPresentationSettleKind = nil
      state.blockedPresentationCommitFenceStartedAtMs = nil
      if let revealRequestKey {
        self.resetLiveMarkerRevealState(
          instanceId: instanceId,
          state: &state,
          reason: "new_reveal_request"
        )
        state.keepSourcesHiddenUntilReveal = false
        state.presentationExecutionPhase = "reveal_preroll"
        state.currentPresentationOpacityTarget = 0
        self.instances[instanceId] = state
        try self.reconcileAndApplyCurrentFrameSnapshots(for: instanceId)
        state = self.instances[instanceId] ?? state
        try self.setPresentationOpacityImmediate(
          0,
          for: &state,
          instanceId: instanceId,
          reason: "reveal_preroll"
        )
        let commitFence = self.capturePendingVisualSourceCommitFence(state: state)
        if self.hasPendingCommitFence(commitFence) {
          state.blockedRevealStartRequestKey = revealRequestKey
          state.blockedRevealStartCommitFenceStartedAtMs = Self.nowMs()
          state.blockedRevealStartCommitFenceBySourceId = commitFence
          state.presentationExecutionPhase = "reveal_wait_commit"
          self.instances[instanceId] = state
          self.emitVisualDiag(
            instanceId: instanceId,
            message:
              "reveal_start_commit_fence_blocked pending=\(self.describeCommitFence(commitFence)) \(self.commitFenceWaitSummary(state: state))"
          )
        } else {
          state.blockedRevealStartCommitFenceStartedAtMs = nil
        }
        self.emitVisualDiag(
          instanceId: instanceId,
          message:
            "reveal_generation_ready frame=\(state.activeFrameGenerationId ?? "nil") phase=\(state.presentationExecutionPhase)"
        )
      }
    }
    state.revealLane.requestedRequestKey = revealRequestKey
    maybeElectMountedHiddenRevealBatch(instanceId: instanceId, state: &state)
    if
      let revealRequestKey,
      let revealStartToken,
      revealStatus == "revealing",
      state.lastPresentationPhase == "revealing",
      state.revealLane.requestedRequestKey == revealRequestKey,
      state.revealLane.mountedHidden != nil,
      state.lastRevealStartToken != revealStartToken,
      state.lastRevealStartedRequestKey != revealRequestKey,
      state.blockedRevealStartRequestKey == nil
    {
      do {
        try self.startRevealPresentation(
          instanceId: instanceId,
          requestKey: revealRequestKey,
          revealStartToken: revealStartToken,
          previousPresentationPhase: previousPresentationPhase,
          previousPresentationOpacityTarget: previousPresentationOpacityTarget
        )
        state = self.instances[instanceId] ?? state
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
      self.revealSettleWorkItems[instanceId]?.cancel()
      self.revealSettleWorkItems[instanceId] = nil
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
        state.keepSourcesHiddenUntilReveal = true
        state.presentationExecutionPhase = "dismissing"
        state.currentPresentationOpacityTarget = 0
        self.instances[instanceId] = state
        try self.animatePresentationOpacity(
          to: 0,
          for: &state,
          instanceId: instanceId,
          reason: "dismiss_start"
        )
        let startedAtMs = Self.nowMs()
        self.emit([
          "type": "presentation_dismiss_started",
          "instanceId": instanceId,
          "requestKey": dismissRequestKey,
          "frameGenerationId": state.activeFrameGenerationId as Any,
          "startedAtMs": startedAtMs,
        ])
        self.emitVisualDiag(
          instanceId: instanceId,
          message:
            "presentation_transition previousPhase=\(previousPresentationPhase) nextPhase=\(state.lastPresentationPhase) previousOpacity=\(previousPresentationOpacityTarget) nextOpacity=\(state.currentPresentationOpacityTarget) revealRequest=\(state.lastRevealRequestKey ?? "nil") dismissRequest=\(dismissRequestKey)"
        )
        let workItem = DispatchWorkItem { [weak self] in
          guard let self else { return }
          self.dismissSettleWorkItems[instanceId] = nil
          guard var latestState = self.instances[instanceId] else { return }
          guard latestState.lastDismissRequestKey == dismissRequestKey else { return }
          let commitFence = self.capturePendingVisualSourceCommitFence(state: latestState)
          if self.hasPendingCommitFence(commitFence) {
            latestState.blockedPresentationSettleRequestKey = dismissRequestKey
            latestState.blockedPresentationSettleKind = "dismiss"
            latestState.blockedPresentationCommitFenceStartedAtMs = Self.nowMs()
            latestState.blockedPresentationCommitFenceBySourceId = commitFence
            latestState.presentationExecutionPhase = "dismiss_preroll"
            self.emitVisualDiag(
              instanceId: instanceId,
              message:
                "dismiss_commit_fence_blocked pending=\(self.describeCommitFence(commitFence)) \(self.commitFenceWaitSummary(state: latestState))"
            )
          } else {
            latestState.blockedPresentationCommitFenceStartedAtMs = nil
            latestState.presentationExecutionPhase = "dismissing"
            latestState.pendingPresentationSettleRequestKey = dismissRequestKey
            latestState.pendingPresentationSettleKind = "dismiss"
            self.armNativeDismissSettle(instanceId: instanceId, requestKey: dismissRequestKey)
          }
          self.instances[instanceId] = latestState
        }
        self.dismissSettleWorkItems[instanceId] = workItem
        DispatchQueue.main.asyncAfter(
          deadline: .now() + .milliseconds(self.dismissSettleDelayMs),
          execute: workItem
        )
      } else if previousDismissRequestKey != nil {
        state.presentationExecutionPhase = state.lastPresentationPhase == "idle" ? "live" : "idle"
        self.instances[instanceId] = state
        try self.reconcileAndApplyCurrentFrameSnapshots(for: instanceId)
        state = self.instances[instanceId] ?? state
        let restoredOpacity =
          state.keepSourcesHiddenUntilReveal
          ? 0.0
          : (state.lastPresentationPhase == "idle" ? 1.0 : state.currentPresentationOpacityTarget)
        state.currentPresentationOpacityTarget = restoredOpacity
        self.instances[instanceId] = state
        try self.setPresentationOpacityImmediate(
          restoredOpacity,
          for: &state,
          instanceId: instanceId,
          reason: "dismiss_clear"
        )
      }
    }
    if
      state.lastDismissRequestKey == nil,
      state.lastRevealRequestKey == nil,
      state.lastPresentationPhase != "idle",
      state.currentPresentationOpacityTarget != 0
    {
      state.currentPresentationOpacityTarget = 0
      self.instances[instanceId] = state
      try self.setPresentationOpacityImmediate(
        0,
        for: &state,
        instanceId: instanceId,
        reason: "presentation_preroll"
      )
    }
    if previousPresentationPhase != "idle", state.lastPresentationPhase == "idle" {
      state.presentationExecutionPhase = "live"
      let idleOpacityTarget = state.keepSourcesHiddenUntilReveal ? 0.0 : 1.0
      if state.currentPresentationOpacityTarget != idleOpacityTarget {
        state.currentPresentationOpacityTarget = idleOpacityTarget
        self.instances[instanceId] = state
        try? self.setPresentationOpacityImmediate(
          idleOpacityTarget,
          for: &state,
          instanceId: instanceId,
          reason: "presentation_idle"
        )
        state = self.instances[instanceId] ?? state
      }
    }
    self.instances[instanceId] = state
    let totalDurationMs = CACurrentMediaTime() * 1000 - actionStartedAt
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
      thresholdMs: state.lastPresentationPhase == "revealing" ? 120 : .greatestFiniteMagnitude,
      state: state
    )
    if totalDurationMs >= self.slowActionThresholdMs {
      self.emit([
        "type": "error",
        "instanceId": "__native_diag__",
        "message":
          "slow_action action=applyFramePresentation phase=\(state.lastPresentationPhase) totalMs=\(Int(totalDurationMs.rounded())) revealKey=\(state.lastRevealRequestKey ?? "nil") dismissKey=\(state.lastDismissRequestKey ?? "nil")",
      ])
    }
  }

  private func applyHighlightedMarkerPayload(
    instanceId: String,
    markerKey: String?
  ) throws {
    guard var state = instances[instanceId] else {
      throw NSError(
        domain: "SearchMapRenderController",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "unknown instance"]
      )
    }
    if state.highlightedMarkerKey == markerKey {
      return
    }
    state.highlightedMarkerKey = markerKey
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
  func querySourceMembership(
    _ payload: NSDictionary,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let instanceId = payload["instanceId"] as? String,
          let sourceId = payload["sourceId"] as? String
    else {
      reject(
        "search_map_render_controller_query_source_membership_invalid",
        "missing instanceId or sourceId",
        nil
      )
      return
    }
    let featureIds = instances[instanceId].flatMap {
      Self.mountedSourceState(sourceId: sourceId, state: $0)
    }.map { Array($0.featureIds) } ?? []
    resolve([
      "sourceId": sourceId,
      "featureIds": featureIds.sorted(),
    ])
  }

  @objc
  func queryRenderedLabelObservation(
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
          "search_map_render_controller_query_rendered_label_observation_invalid",
          "missing instanceId",
          nil
        )
        return
      }
      guard let state = self.instances[instanceId] else {
        reject(
          "search_map_render_controller_query_rendered_label_observation_invalid",
          "unknown instance",
          nil
        )
        return
      }
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
      self.scheduleLabelObservationRefresh(instanceId: instanceId, delayMs: 0)
      resolve(self.currentRenderedLabelObservationSnapshot(instanceId: instanceId))
    }
  }

  @objc
  func queryRenderedDotObservation(
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
          "search_map_render_controller_query_rendered_dot_observation_invalid",
          "missing instanceId",
          nil
        )
        return
      }
      guard let state = self.instances[instanceId] else {
        reject(
          "search_map_render_controller_query_rendered_dot_observation_invalid",
          "unknown instance",
          nil
        )
        return
      }
      let layerIds = (payload["layerIds"] as? [String]) ??
        ((payload["layerIds"] as? [Any])?.compactMap { $0 as? String } ?? [])
      let queryBoxValues = ((payload["queryBox"] as? [NSNumber]) ??
        ((payload["queryBox"] as? [Any])?.compactMap {
          if let value = $0 as? NSNumber {
            return value
          }
          if let value = $0 as? Double {
            return NSNumber(value: value)
          }
          return nil
        } ?? []))
      do {
        try self.withResolvedMapHandleResult(for: state.mapTag) { handle in
          let bounds = handle.mapView.bounds
          guard bounds.width > 0, bounds.height > 0 else {
            resolve(Self.emptyRenderedDotObservationResult())
            return
          }
          let queryRect: CGRect
          if queryBoxValues.count == 4 {
            let x1 = CGFloat(truncating: queryBoxValues[0])
            let y1 = CGFloat(truncating: queryBoxValues[1])
            let x2 = CGFloat(truncating: queryBoxValues[2])
            let y2 = CGFloat(truncating: queryBoxValues[3])
            queryRect = CGRect(
              x: min(x1, x2),
              y: min(y1, y2),
              width: abs(x2 - x1),
              height: abs(y2 - y1)
            )
          } else {
            queryRect = bounds
          }
          guard queryRect.width > 0, queryRect.height > 0 else {
            resolve(Self.emptyRenderedDotObservationResult())
            return
          }
          handle.mapView.mapboxMap.queryRenderedFeatures(
            with: queryRect,
            options: RenderedQueryOptions(layerIds: layerIds, filter: nil)
          ) { result in
            DispatchQueue.main.async {
              switch result {
              case .failure(let error):
                reject(
                  "search_map_render_controller_query_rendered_dot_observation_failed",
                  error.localizedDescription,
                  error
                )
              case .success(let features):
                let observation = Self.buildRenderedDotObservation(
                  from: features,
                  requiredSourceId: state.dotSourceId
                )
                resolve([
                  "restaurantIds": observation.restaurantIds,
                  "renderedDots": observation.renderedDots,
                  "renderedFeatureCount": features.count,
                ])
              }
            }
          }
        }
      } catch {
        reject(
          "search_map_render_controller_query_rendered_dot_observation_failed",
          error.localizedDescription,
          error
        )
      }
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
      do {
        try self.withResolvedMapHandleResult(for: state.mapTag) { handle in
          let queryRect = CGRect(x: x - 0.5, y: y - 0.5, width: 1, height: 1)
          guard !pinLayerIds.isEmpty || !labelLayerIds.isEmpty else {
            resolve(NSNull())
            return
          }
          guard !pinLayerIds.isEmpty else {
            handle.mapView.mapboxMap.queryRenderedFeatures(
              with: queryRect,
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
                    requiredSourceId: state.labelInteractionSourceId
                  ) {
                    resolve(labelTarget)
                  } else {
                    resolve(NSNull())
                  }
                }
              }
            }
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
                  resolve(pinTarget)
                  return
                }
                guard !labelLayerIds.isEmpty else {
                  resolve(NSNull())
                  return
                }
                handle.mapView.mapboxMap.queryRenderedFeatures(
                  with: queryRect,
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
                        requiredSourceId: state.labelInteractionSourceId
                      ) {
                        resolve(labelTarget)
                      } else {
                        resolve(NSNull())
                      }
                    }
                  }
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
      state.lastPresentationPhase = "idle"
      state.lastRevealRequestKey = nil
      state.revealLane = RevealLaneState()
      state.lastRevealStartToken = nil
      state.lastRevealStartedRequestKey = nil
      state.lastRevealFirstVisibleRequestKey = nil
      state.lastRevealSettledRequestKey = nil
      state.lastDismissRequestKey = nil
      state.presentationExecutionPhase = "idle"
      state.lastPresentationStateJSON = nil
      state.activeFrameGenerationId = nil
      state.activeRevealBatchId = nil
      state.highlightedMarkerKey = nil
      state.interactionMode = "enabled"
      state.currentPresentationOpacityTarget = 1
      state.currentPresentationOpacityValue = 1
      state.nextSourceCommitSequence = 0
      state.pendingPresentationSettleRequestKey = nil
      state.pendingPresentationSettleKind = nil
      state.blockedRevealStartRequestKey = nil
      state.blockedRevealStartCommitFenceStartedAtMs = nil
      state.blockedPresentationSettleRequestKey = nil
      state.blockedPresentationSettleKind = nil
      state.blockedPresentationCommitFenceStartedAtMs = nil
      state.blockedRevealStartCommitFenceBySourceId = [:]
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
      self.revealSettleWorkItems[instanceId]?.cancel()
      self.revealSettleWorkItems[instanceId] = nil
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
    let orderedMarkerStates = Self.orderedMarkerRenderStates(pinFamilyState.markerRenderStateByMarkerKey)
    let orderedMarkerKeys = orderedMarkerStates.map(\.markerKey)
    let dirtyPinMarkerKeys = dirtyState.pinMarkerKeys
      .union(pinFamilyState.livePinTransitionsByMarkerKey.keys)
      .union(pinFamilyState.collection.groupOrder)
      .union(orderedMarkerKeys)
    let dirtyPinInteractionMarkerKeys = dirtyState.pinInteractionMarkerKeys
      .union(pinFamilyState.livePinTransitionsByMarkerKey.keys)
      .union(pinInteractionFamilyState.collection.groupOrder)
      .union(orderedMarkerKeys)
    let dirtyLabelMarkerKeys = dirtyState.labelMarkerKeys
      .union(pinFamilyState.livePinTransitionsByMarkerKey.keys)
      .union(labelFamilyState.collection.groupOrder)
      .union(orderedMarkerKeys)
    let dirtyLabelCollisionMarkerKeys = dirtyState.labelCollisionMarkerKeys
      .union(pinFamilyState.livePinTransitionsByMarkerKey.keys)
      .union(labelCollisionFamilyState.collection.groupOrder)
      .union(orderedMarkerKeys)
    let reusePins = dirtyPinMarkerKeys.isEmpty
    let reusePinInteractions = dirtyPinInteractionMarkerKeys.isEmpty
    let reuseLabels = dirtyLabelMarkerKeys.isEmpty
    let reuseLabelCollisions = dirtyLabelCollisionMarkerKeys.isEmpty
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

    for (markerKey, renderState) in orderedMarkerStates {
      if !reusePins {
        nextPinIdsInOrder!.append(markerKey)
        let renderFeature = Self.featureBySettingNumericProperties(
          renderState.pinFeature,
          numericProperties: [
            "nativeLodOpacity": renderState.targetOpacity,
            "nativeLodRankOpacity": renderState.targetOpacity,
            "nativeLodZ": Double(renderState.lodZ),
          ]
        )
        nextPinFeatureById![markerKey] = renderFeature
        nextPinMarkerKeyByFeatureId![markerKey] = markerKey
        if let featureState = pinFamilyState.transientFeatureStateById[markerKey] {
          nextPinFeatureStateById![markerKey] = featureState
        }
      }

      let shouldRenderPinInteraction =
        renderState.isDesiredPresent &&
        renderState.currentOpacity >= 0.999 &&
        desiredPayloads.pinInteractionFeatureByMarkerKey[markerKey] != nil
      if !reusePinInteractions, shouldRenderPinInteraction, let feature = renderState.pinInteractionFeature {
        nextPinInteractionIdsInOrder!.append(markerKey)
        nextPinInteractionFeatureById![markerKey] = Self.featureBySettingNumericProperties(
          feature,
          numericProperties: ["nativeLodZ": Double(renderState.lodZ)]
        )
        nextPinInteractionMarkerKeyByFeatureId![markerKey] = markerKey
      }

      if !reuseLabels {
        for labelFeature in renderState.labelFeatures {
          nextLabelIdsInOrder!.append(labelFeature.id)
          nextLabelFeatureById![labelFeature.id] = Self.featureBySettingNumericProperties(
            labelFeature.feature,
            numericProperties: [
              "nativeLabelOpacity": renderState.targetOpacity,
            ]
          )
          nextLabelMarkerKeyByFeatureId![labelFeature.id] = markerKey
          if let featureState = labelFamilyState.transientFeatureStateById[labelFeature.id] {
            nextLabelFeatureStateById![labelFeature.id] = featureState
          }
        }
      }
    }
    let previousPinsSourceState = pinFamilyState.sourceState
    let nextPins: ParsedFeatureCollection
    if reusePins {
      nextPins = pinFamilyState.collection
    } else {
      let nextPinGroupIds = orderedMarkerKeys
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
        removedGroupIds: Set(pinFamilyState.collection.groupOrder).subtracting(nextPinGroupIds)
      )
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
      try Self.replaceParsedFeatureCollection(
        &pinInteractionFamilyState.collection,
        baseSourceState: previousPinInteractionsSourceState,
        idsInOrder: nextPinInteractionIdsInOrder!,
        featureById: nextPinInteractionFeatureById!,
        markerKeyByFeatureId: nextPinInteractionMarkerKeyByFeatureId!,
        dirtyGroupIds: Set(pinInteractionFamilyState.collection.groupOrder).union(nextPinInteractionGroupIds),
        orderChangedGroupIds:
          pinInteractionFamilyState.collection.groupOrder == nextPinInteractionGroupIds
            ? dirtyPinInteractionMarkerKeys
            : Set(pinInteractionFamilyState.collection.groupOrder).union(nextPinInteractionGroupIds),
        removedGroupIds: Set(pinInteractionFamilyState.collection.groupOrder).subtracting(nextPinInteractionGroupIds)
      )
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
      let nextLabelGroupIds = orderedMarkerStates.compactMap { markerKey, renderState in
        renderState.labelFeatures.isEmpty ? nil : markerKey
      }
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
        removedGroupIds: Set(labelFamilyState.collection.groupOrder).subtracting(nextLabelGroupIds)
      )
      Self.setDerivedFamilyState(labelFamilyState, sourceId: state.labelSourceId, state: &state)
      nextLabels = labelFamilyState.collection
    }
    let previousLabelCollisionSourceState = labelCollisionFamilyState.sourceState
    let nextLabelCollisions: ParsedFeatureCollection
    if reuseLabelCollisions {
      nextLabelCollisions = labelCollisionFamilyState.collection
    } else {
      let nextLabelCollisionIdsInOrder = orderedMarkerStates.compactMap { markerKey, renderState in
        renderState.labelCollisionFeature == nil ? nil : markerKey
      }
      var nextLabelCollisionFeatureById: [String: Feature] = [:]
      var nextLabelCollisionMarkerKeyByFeatureId: [String: String] = [:]
      for (markerKey, renderState) in orderedMarkerStates {
        guard let feature = renderState.labelCollisionFeature else {
          continue
        }
        nextLabelCollisionFeatureById[markerKey] = feature
        nextLabelCollisionMarkerKeyByFeatureId[markerKey] = markerKey
      }
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
        removedGroupIds: Set(labelCollisionFamilyState.collection.groupOrder).subtracting(nextLabelCollisionIdsInOrder)
      )
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
      var nextLabelInteractionMarkerKeyByFeatureId: [String: String] = [:]
      for (markerKey, renderState) in orderedMarkerStates {
        for labelFeature in renderState.labelFeatures where settledVisibleLabelFeatureIds.contains(labelFeature.id) {
          nextLabelInteractionFeatureById[labelFeature.id] = labelFeature.feature
          nextLabelInteractionMarkerKeyByFeatureId[labelFeature.id] = markerKey
        }
      }
      try Self.replaceParsedFeatureCollection(
        &labelInteractionFamilyState.collection,
        baseSourceState: previousLabelInteractionSourceState,
        idsInOrder: nextLabelInteractionIdsInOrder,
        featureById: nextLabelInteractionFeatureById,
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
      state.lastPresentationPhase == "live" &&
      state.lastDismissRequestKey == nil
  }

  private func reconcileAndApplyCurrentFrameSnapshots(
    for instanceId: String,
    allowNewTransitions: Bool = true,
    allowDuringRecovery: Bool = false
  ) throws {
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
    let desiredPinSnapshotInputRevision = Self.desiredPinSnapshotInputRevision(
      desiredPins: desiredPins,
      desiredPinInteractions: desiredPinInteractions,
      desiredLabels: desiredLabels,
      desiredLabelCollisions: desiredLabelCollisions
    )
    let pinFamilyState = Self.derivedFamilyState(sourceId: state.pinSourceId, state: state)
    let previousDesiredPinSnapshot = pinFamilyState.lastDesiredPinSnapshot
    let desiredPinSnapshot: DesiredPinSnapshotState
    if previousDesiredPinSnapshot.inputRevision == desiredPinSnapshotInputRevision {
      desiredPinSnapshot = previousDesiredPinSnapshot
    } else {
      let nextDesiredPinSnapshot = Self.makeDesiredPinSnapshotState(
        desiredPins: desiredPins,
        desiredPinInteractions: desiredPinInteractions,
        desiredLabels: desiredLabels,
        desiredLabelCollisions: desiredLabelCollisions,
        previousSnapshot: previousDesiredPinSnapshot
      )
      desiredPinSnapshot = nextDesiredPinSnapshot
    }
    let desiredMarkerFamilyPayloads = Self.makeDesiredMarkerFamilyPayloads(
      desiredPins: desiredPins,
      desiredPinInteractions: desiredPinInteractions,
      desiredLabels: desiredLabels,
      desiredLabelCollisions: desiredLabelCollisions
    )
    let desiredPinDirtyState = Self.makeDesiredPinSnapshotDirtyState(
      previousSnapshot: previousDesiredPinSnapshot,
      nextSnapshot: desiredPinSnapshot
    )
    let nowMs = Self.nowMs()
    let shouldAnimateIncrementalTransitions = Self.allowsIncrementalMarkerTransitions(
      state,
      allowNewTransitions: allowNewTransitions
    )
    updateLivePinTransitions(
      state: &state,
      previousPinSnapshot: previousDesiredPinSnapshot,
      desiredPinSnapshot: desiredPinSnapshot,
      desiredPayloads: desiredMarkerFamilyPayloads,
      nowMs: nowMs,
      allowNewTransitions: shouldAnimateIncrementalTransitions
    )
    updateLiveDotTransitions(
      state: &state,
      desiredDots: desiredDots,
      nowMs: nowMs,
      allowNewTransitions: shouldAnimateIncrementalTransitions
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
    let preparedPinAndLabelOutput = try prepareDerivedPinAndLabelOutput(
      desiredPinSnapshot: desiredPinSnapshot,
      dirtyState: desiredPinDirtyState,
      desiredPayloads: desiredMarkerFamilyPayloads,
      nowMs: nowMs,
      state: &state
    )
    let preparedDotOutput = try prepareDerivedDotOutput(
      desiredDots: desiredDots,
      desiredDotInteractions: desiredDotInteractions,
      nowMs: nowMs,
      state: &state
    )
    let labelInteractionPlans = try prepareDerivedLabelInteractionOutputPlans(state: &state)
    let mutationSummaryBySourceId = try applyParsedCollectionBatch(
      instanceId: instanceId,
      plans: preparedPinAndLabelOutput.plans + preparedDotOutput.plans + labelInteractionPlans,
      state: &state,
      mapboxMap: mapboxMap
    )
    if state.lastRevealRequestKey != nil && state.lastPresentationPhase != "live" {
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
          "reveal_apply_result frame=\(state.activeFrameGenerationId ?? "nil") phase=\(state.lastPresentationPhase) execution=\(state.presentationExecutionPhase) pinAdd=\(pinMutationSummary.addCount) pinUpdate=\(pinMutationSummary.updateCount) pinRemove=\(pinMutationSummary.removeCount) dotAdd=\(dotMutationSummary.addCount) dotUpdate=\(dotMutationSummary.updateCount) dotRemove=\(dotMutationSummary.removeCount) labelAdd=\(labelMutationSummary.addCount) labelUpdate=\(labelMutationSummary.updateCount) labelRemove=\(labelMutationSummary.removeCount) \(Self.phaseSummary(for: state))"
      )
    }
    finalizePreparedPinAndLabelOutput(
      instanceId: instanceId,
      prepared: preparedPinAndLabelOutput,
      mutationSummaryBySourceId: mutationSummaryBySourceId,
      state: &state
    )
    finalizePreparedDotOutput(
      prepared: preparedDotOutput,
      mutationSummaryBySourceId: mutationSummaryBySourceId,
      state: &state
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
    maybeElectMountedHiddenRevealBatch(instanceId: instanceId, state: &state)
    instances[instanceId] = state
    updateLivePinTransitionAnimation(instanceId: instanceId, state: state)
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
              "nativeDotOpacity": shouldSeedHidden ? 0 : 1,
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
    previousSnapshot: DesiredPinSnapshotState? = nil
  ) -> DesiredPinSnapshotState {
    var snapshot = previousSnapshot ?? DesiredPinSnapshotState()
    snapshot.inputRevision = desiredPinSnapshotInputRevision(
      desiredPins: desiredPins,
      desiredPinInteractions: desiredPinInteractions,
      desiredLabels: desiredLabels,
      desiredLabelCollisions: desiredLabelCollisions
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
      .union(dirtyState.pinMarkerKeys)
    for markerKey in pinInteractionMarkerKeys {
      if
        previousSnapshot.pinInteractionFeatureRevisionByMarkerKey[markerKey] != nextSnapshot.pinInteractionFeatureRevisionByMarkerKey[markerKey] ||
        previousSnapshot.pinLodZByMarkerKey[markerKey] != nextSnapshot.pinLodZByMarkerKey[markerKey]
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
      payloads.labelFeaturesByMarkerKey[markerKey, default: []].append((featureId, feature))
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
    desiredLabelCollisions: ParsedFeatureCollection
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
    return Self.finishHashedRevision(hash: hash, count: 4)
  }

  private func startRevealPresentation(
    instanceId: String,
    requestKey: String,
    revealStartToken: Double,
    previousPresentationPhase: String? = nil,
    previousPresentationOpacityTarget: Double? = nil
  ) throws {
    guard var state = instances[instanceId] else {
      return
    }
    guard
      let requestedRevealRequestKey = state.revealLane.requestedRequestKey,
      requestedRevealRequestKey == requestKey,
      let mountedHiddenRevealBatch = state.revealLane.mountedHidden,
      state.activeFrameGenerationId == mountedHiddenRevealBatch.generationId
    else {
      return
    }
    guard state.lastRevealRequestKey == requestKey else {
      return
    }
    guard state.lastRevealStartedRequestKey != requestKey else {
      return
    }
    guard state.lastDismissRequestKey == nil else {
      return
    }
    state.blockedRevealStartRequestKey = nil
    state.blockedRevealStartCommitFenceStartedAtMs = nil
    state.blockedRevealStartCommitFenceBySourceId.removeAll()
    state.lastRevealStartToken = revealStartToken
    state.revealLane.revealing = mountedHiddenRevealBatch
    state.presentationExecutionPhase = "revealing"
    instances[instanceId] = state
    try animatePresentationOpacity(
      to: 1,
      for: &state,
      instanceId: instanceId,
      reason: "reveal_start"
    )
    state.lastRevealStartedRequestKey = requestKey
    instances[instanceId] = state
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "presentation_transition previousPhase=\(previousPresentationPhase ?? state.lastPresentationPhase) nextPhase=\(state.lastPresentationPhase) previousOpacity=\(previousPresentationOpacityTarget ?? state.currentPresentationOpacityTarget) nextOpacity=\(state.currentPresentationOpacityTarget) revealRequest=\(requestKey) dismissRequest=\(state.lastDismissRequestKey ?? "nil")"
    )
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "reveal_started phase=\(state.lastPresentationPhase) pins=\(state.lastPinCount) dots=\(state.lastDotCount) labels=\(state.lastLabelCount) \(Self.phaseSummary(for: state))"
    )
    emit([
      "type": "presentation_reveal_started",
      "instanceId": instanceId,
      "requestKey": requestKey,
      "frameGenerationId": state.revealLane.revealing?.generationId as Any,
      "revealBatchId": state.revealLane.revealing?.batchId as Any,
      "startedAtMs": Self.nowMs(),
    ])
    let workItem = DispatchWorkItem { [weak self] in
      guard let self else { return }
      self.revealSettleWorkItems[instanceId] = nil
      guard var latestState = self.instances[instanceId] else { return }
      guard latestState.lastRevealRequestKey == requestKey else { return }
      guard latestState.lastRevealStartedRequestKey == requestKey else { return }
      guard latestState.lastRevealSettledRequestKey != requestKey else { return }
      guard latestState.lastDismissRequestKey == nil else { return }
      let commitFence = self.capturePendingVisualSourceCommitFence(state: latestState)
      if self.hasPendingCommitFence(commitFence) {
        latestState.blockedPresentationSettleRequestKey = requestKey
        latestState.blockedPresentationSettleKind = "reveal"
        latestState.blockedPresentationCommitFenceStartedAtMs = Self.nowMs()
        latestState.blockedPresentationCommitFenceBySourceId = commitFence
        latestState.presentationExecutionPhase = "reveal_wait_commit"
        self.emitVisualDiag(
          instanceId: instanceId,
          message:
            "reveal_commit_fence_blocked pending=\(self.describeCommitFence(commitFence)) \(self.commitFenceWaitSummary(state: latestState))"
        )
      } else {
        latestState.blockedPresentationCommitFenceStartedAtMs = nil
        latestState.presentationExecutionPhase = "reveal_settling"
        latestState.pendingPresentationSettleRequestKey = requestKey
        latestState.pendingPresentationSettleKind = "reveal"
        self.armNativeRevealSettle(instanceId: instanceId, requestKey: requestKey)
      }
      self.instances[instanceId] = latestState
    }
    revealSettleWorkItems[instanceId] = workItem
    DispatchQueue.main.asyncAfter(
      deadline: .now() + .milliseconds(revealSettleDelayMs),
      execute: workItem
    )
  }

  private func emitRevealBatchMountedHidden(
    instanceId: String,
    revealBatch: RevealBatchRef,
    state: inout InstanceState
  ) {
    guard state.lastRevealRequestKey == revealBatch.requestKey else {
      return
    }
    guard state.revealLane.requestedRequestKey == revealBatch.requestKey else {
      return
    }
    guard state.revealLane.mountedHidden != revealBatch else {
      return
    }
    state.revealLane.mountedHidden = revealBatch
    instances[instanceId] = state
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "reveal_batch_mounted_hidden phase=\(state.lastPresentationPhase) frame=\(state.activeFrameGenerationId ?? "nil") \(Self.phaseSummary(for: state))"
    )
    emit([
      "type": "presentation_reveal_batch_mounted_hidden",
      "instanceId": instanceId,
      "requestKey": revealBatch.requestKey,
      "frameGenerationId": revealBatch.generationId,
      "revealBatchId": revealBatch.batchId,
      "readyAtMs": Self.nowMs(),
    ])
    maybeEmitRevealBatchArmed(instanceId: instanceId, state: &state)
  }

  private func maybeEmitRevealBatchArmed(
    instanceId: String,
    state: inout InstanceState
  ) {
    guard let revealBatch = state.revealLane.mountedHidden else {
      return
    }
    guard state.lastRevealRequestKey == revealBatch.requestKey else {
      return
    }
    guard state.revealLane.requestedRequestKey == revealBatch.requestKey else {
      return
    }
    guard state.revealLane.armed != revealBatch else {
      return
    }
    guard state.lastDismissRequestKey == nil else {
      return
    }
    guard state.lastRevealStartedRequestKey != revealBatch.requestKey else {
      return
    }
    guard state.blockedRevealStartRequestKey == nil else {
      return
    }
    guard state.activeFrameGenerationId == revealBatch.generationId else {
      return
    }
    state.revealLane.armed = revealBatch
    instances[instanceId] = state
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "reveal_armed phase=\(state.lastPresentationPhase) frame=\(state.activeFrameGenerationId ?? "nil") \(Self.phaseSummary(for: state))"
    )
    emit([
      "type": "presentation_reveal_armed",
      "instanceId": instanceId,
      "requestKey": revealBatch.requestKey,
      "frameGenerationId": revealBatch.generationId,
      "revealBatchId": revealBatch.batchId,
      "armedAtMs": Self.nowMs(),
    ])
  }

  private func maybeElectMountedHiddenRevealBatch(
    instanceId: String,
    state: inout InstanceState
  ) {
    guard let requestKey = state.revealLane.requestedRequestKey else {
      return
    }
    guard state.lastRevealRequestKey == requestKey else {
      return
    }
    guard state.lastDismissRequestKey == nil else {
      return
    }
    guard state.lastRevealStartedRequestKey != requestKey else {
      return
    }
    guard let activeRevealBatchId = state.activeRevealBatchId else {
      return
    }
    guard let activeFrameGenerationId = state.activeFrameGenerationId else {
      return
    }
    if !state.allowEmptyReveal, state.lastPinCount + state.lastDotCount + state.lastLabelCount == 0 {
      return
    }
    emitRevealBatchMountedHidden(
      instanceId: instanceId,
      revealBatch: RevealBatchRef(
        requestKey: requestKey,
        batchId: activeRevealBatchId,
        generationId: activeFrameGenerationId
      ),
      state: &state
    )
  }

  private func settleRevealAfterRenderedFrame(instanceId: String, requestKey: String) {
    revealFrameFallbackWorkItems[instanceId]?.cancel()
    revealFrameFallbackWorkItems[instanceId] = nil
    guard var state = instances[instanceId] else {
      return
    }
    guard state.lastRevealRequestKey == requestKey else {
      return
    }
    guard state.lastRevealStartedRequestKey == requestKey else {
      return
    }
    guard state.lastRevealSettledRequestKey != requestKey else {
      return
    }
    guard state.lastDismissRequestKey == nil else {
      return
    }
    state.revealLane.liveBaseline = state.revealLane.revealing
    state.revealLane.requestedRequestKey = nil
    state.revealLane.mountedHidden = nil
    state.revealLane.armed = nil
    state.revealLane.revealing = nil
    state.lastRevealSettledRequestKey = requestKey
    state.pendingPresentationSettleRequestKey = nil
    state.pendingPresentationSettleKind = nil
    state.blockedPresentationSettleRequestKey = nil
    state.blockedPresentationSettleKind = nil
    state.blockedPresentationCommitFenceStartedAtMs = nil
    state.blockedPresentationCommitFenceBySourceId.removeAll()
    state.presentationExecutionPhase = "live"
    instances[instanceId] = state
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "reveal_settled phase=\(state.lastPresentationPhase) pins=\(state.lastPinCount) dots=\(state.lastDotCount) labels=\(state.lastLabelCount) \(Self.phaseSummary(for: state))"
    )
    emit([
      "type": "presentation_reveal_settled",
      "instanceId": instanceId,
      "requestKey": requestKey,
      "frameGenerationId": state.revealLane.liveBaseline?.generationId as Any,
      "revealBatchId": state.revealLane.liveBaseline?.batchId as Any,
      "settledAtMs": Self.nowMs(),
    ])
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
    state.presentationExecutionPhase = "idle"
    state.keepSourcesHiddenUntilReveal = true
    state.currentPresentationOpacityTarget = 0
    state.currentPresentationOpacityValue = 0
    do {
      try clearResidentSources(for: state)
    } catch {
      emit([
        "type": "error",
        "instanceId": instanceId,
        "message": "dismiss_clear_sources_failed: \(error.localizedDescription)",
      ])
    }
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
    cancelLivePinTransitionAnimation(instanceId: instanceId)
    instances[instanceId] = state
    emit([
      "type": "presentation_dismiss_settled",
      "instanceId": instanceId,
      "requestKey": requestKey,
      "frameGenerationId": state.activeFrameGenerationId as Any,
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
    removedGroupIds explicitRemovedGroupIds: Set<String>
  ) throws {
    let baseCollection = baseSourceState.map(Self.parsedCollectionBase) ?? collection
    var idsInOrder: [String] = []
    var nextFeatureById: [String: Feature] = [:]
    var diffKeyById: [String: String] = [:]
    var nextFeatureStateById: [String: [String: Any]] = [:]
    var nextMarkerKeyByFeatureId: [String: String] = [:]
    let previousFeatureById = collection.featureById
    let dedupedSourceIdsInOrder = try Self.requireUniqueOrderedFeatureIds(
      sourceIdsInOrder,
      context: "replaceParsedFeatureCollection"
    )
    var matchesBaseSourceShape = baseCollection.idsInOrder.count == dedupedSourceIdsInOrder.count
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
      let reusedDiffKey =
        previousFeatureById[id] == feature
          ? collection.diffKeyById[id]
          : nil
      if let diffKey = reusedDiffKey ?? Self.makeFeatureDiffKey(feature: feature) {
        diffKeyById[id] = diffKey
        if matchesBaseSourceShape && baseCollection.diffKeyById[id] != diffKey {
          matchesBaseSourceShape = false
        }
      } else {
        matchesBaseSourceShape = false
      }
      if let featureState = featureStateById[id] {
        nextFeatureStateById[id] = featureState
      }
      nextMarkerKeyByFeatureId[id] = markerKeyByFeatureId?[id] ?? id
    }
    let sourceRevision =
      matchesBaseSourceShape
        ? baseCollection.sourceRevision
        : buildParsedCollectionRevision(
            idsInOrder: idsInOrder,
            diffKeyById: diffKeyById
          )
    let featureIds = Set(idsInOrder)
    let featureStateEntryRevisionById = makeFeatureStateEntryRevisionById(
      featureStateById: nextFeatureStateById
    )
    let featureStateChangedIds =
      baseCollection.featureStateEntryRevisionById == featureStateEntryRevisionById
        ? Set<String>()
        : Set(
            featureStateEntryRevisionById.compactMap { featureId, revision in
              baseCollection.featureStateEntryRevisionById[featureId] == revision ? nil : featureId
            }
          )
    let featureStateRevision =
      baseCollection.featureStateEntryRevisionById == featureStateEntryRevisionById
        ? baseCollection.featureStateRevision
        : buildFeatureStateRevision(
            featureStateEntryRevisionById: featureStateEntryRevisionById
          )
    let addedFeatureIdsInOrder = idsInOrder.filter { !baseCollection.featureIds.contains($0) }
    let updatedFeatureIdsInOrder = idsInOrder.filter { featureId in
      guard baseCollection.featureIds.contains(featureId) else {
        return false
      }
      return baseCollection.diffKeyById[featureId] != diffKeyById[featureId]
    }
    let removedFeatureIds = baseCollection.featureIds.subtracting(featureIds)
    let removedFeatureIdsInOrder = baseCollection.idsInOrder.filter { removedFeatureIds.contains($0) }
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
    collection.addedFeatures = Self.mutationFeatures(
      idsInOrder: addedFeatureIdsInOrder,
      featureById: nextFeatureById
    )
    collection.updatedFeatures = Self.mutationFeatures(
      idsInOrder: updatedFeatureIdsInOrder,
      featureById: nextFeatureById
    )
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
    if
      Self.isSourceRecoveryActive(state) ||
      (
        Self.derivedFamilyState(sourceId: state.pinSourceId, state: state).livePinTransitionsByMarkerKey.isEmpty &&
        Self.derivedFamilyState(sourceId: state.dotSourceId, state: state).liveDotTransitionsByMarkerKey.isEmpty
      ) ||
      state.lastPresentationPhase != "live"
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

  private func resetLiveMarkerRevealState(
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
        "live_reveal_state_reset reason=\(reason) pinTransitions=\(pinTransitionCount) dotTransitions=\(dotTransitionCount) pinTransient=\(pinTransientIds.count) dotTransient=\(dotTransientIds.count) labelTransient=\(labelTransientIds.count)"
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

  private func startAwaitingLivePinTransitions(
    instanceId: String,
    dataId: String,
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
            Self.shouldAcknowledgePendingCommitDataId(
              transition.awaitingSourceDataId,
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
      updateLivePinTransitionAnimation(instanceId: instanceId, state: state)
    }
  }

  private func startAwaitingLiveDotTransitions(
    instanceId: String,
    dataId: String,
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
            Self.shouldAcknowledgePendingCommitDataId(
              transition.awaitingSourceDataId,
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
      updateLivePinTransitionAnimation(instanceId: instanceId, state: state)
    }
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
        state.lastPresentationPhase != "live"
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
    let snapshots = [
      (state.pinInteractionSourceId, Self.emptyFeatureCollectionJSON),
      (state.dotInteractionSourceId, Self.emptyFeatureCollectionJSON),
      (state.labelInteractionSourceId, Self.emptyFeatureCollectionJSON),
    ]
    try applySnapshots(
      instanceId: instanceId,
      snapshots,
      allowDuringRecovery: allowDuringRecovery,
      state: &state
    )
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
        for featureId in sourceState.featureIds {
          let markerKey = sourceState.markerKeyByFeatureId[featureId] ?? featureId
          mapboxMap.setFeatureState(
            sourceId: sourceId,
            featureId: featureId,
            state: [
              "nativeHighlighted": state.highlightedMarkerKey == markerKey ? 1 : 0,
            ]
          ) { _ in }
        }
      }
    }
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
    emitPinOpacitySummary(instanceId: instanceId, state: state, reason: reason)
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
    emitPinOpacitySummary(instanceId: instanceId, state: state, reason: reason)
  }

  private func animatePresentationOpacity(
    to targetOpacity: Double,
    for state: inout InstanceState,
    instanceId: String,
    reason: String,
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
      emitPinOpacitySummary(instanceId: instanceId, state: state, reason: reason)
      return
    }

    emitVisualDiag(
      instanceId: instanceId,
      message:
        "presentation_opacity_animation_start reason=\(reason) start=\(Self.round3(startOpacity)) target=\(Self.round3(clampedTarget)) durationMs=\(Int(revealSettleDelayMs))"
    )

    let animator = PresentationOpacityAnimator(
      owner: self,
      instanceId: instanceId,
      reason: reason,
      startOpacity: startOpacity,
      targetOpacity: clampedTarget,
      durationMs: Double(revealSettleDelayMs),
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
      emitRevealFirstVisibleFrameIfNeeded(instanceId: instanceId, state: &state, opacity: opacity)
      if rawProgress >= 1 {
        emitVisualDiag(
          instanceId: instanceId,
          message:
            "presentation_opacity_animation_complete reason=\(animator.reason) target=\(Self.round3(animator.targetOpacity))"
        )
        emitPinOpacitySummary(instanceId: instanceId, state: state, reason: animator.reason)
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

  private func emitRevealFirstVisibleFrameIfNeeded(
    instanceId: String,
    state: inout InstanceState,
    opacity: Double
  ) {
    guard opacity > 0.001 else {
      return
    }
    guard state.lastPresentationPhase == "revealing" else {
      return
    }
    guard let requestKey = state.lastRevealRequestKey else {
      return
    }
    guard state.lastRevealStartedRequestKey == requestKey else {
      return
    }
    guard state.lastRevealFirstVisibleRequestKey != requestKey else {
      return
    }
    state.lastRevealFirstVisibleRequestKey = requestKey
    instances[instanceId] = state
    emit([
      "type": "presentation_reveal_first_visible_frame",
      "instanceId": instanceId,
      "requestKey": requestKey,
      "frameGenerationId": state.revealLane.revealing?.generationId as Any,
      "revealBatchId": state.revealLane.revealing?.batchId as Any,
      "syncedAtMs": Self.nowMs(),
    ])
  }

  private func emitPinOpacitySummary(instanceId: String, state: InstanceState, reason: String) {
    let visiblePinIds = Self.mountedSourceState(sourceId: state.pinSourceId, state: state).map {
      Array($0.featureIds).sorted()
    } ?? []
    let sampleVisiblePinIds = Array(visiblePinIds.prefix(3)).joined(separator: ",")
    emit([
      "type": "error",
      "instanceId": "__native_diag__",
      "message":
        "pin_opacity_summary reason=\(reason) presentationOpacity=\(Self.round3(state.currentPresentationOpacityValue)) target=\(Self.round3(state.currentPresentationOpacityTarget)) visible=\(visiblePinIds.count) sampleVisible=\(sampleVisiblePinIds.isEmpty ? "none" : sampleVisiblePinIds)"
    ])
  }

  private static func round3(_ value: Double) -> Double {
    (value * 1000).rounded() / 1000
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
      if emitDiagnostic && ((featureCount > 0 && opacity > 0) || durationMs >= self.slowActionThresholdMs) {
        self.emit([
          "type": "error",
          "instanceId": "__native_diag__",
          "message":
            "presentation_opacity_apply reason=\(reason) opacity=\(opacity) phase=\(state.lastPresentationPhase) featureCount=\(featureCount) pins=\(state.lastPinCount) dots=\(state.lastDotCount) labels=\(state.lastLabelCount) durationMs=\(Int(durationMs.rounded()))",
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
      "pinTransient=\(pinFamilyState.transientFeatureStateById.count)",
      "dotTransient=\(dotFamilyState.transientFeatureStateById.count)",
      "labelTransient=\(labelFamilyState.transientFeatureStateById.count)",
      "pinLive=\(pinFamilyState.livePinTransitionsByMarkerKey.count)",
      "dotLive=\(dotFamilyState.liveDotTransitionsByMarkerKey.count)",
    ].joined(separator: " ")
  }

  private func recoveryContextSummary(for state: InstanceState) -> String {
    let recoveryPausedMs = state.sourceRecoveryPausedAtMs.map { max(0, Int((Self.nowMs() - $0).rounded())) }
    return "phase=\(state.lastPresentationPhase) moving=\(state.currentViewportIsMoving) pins=\(state.lastPinCount) dots=\(state.lastDotCount) labels=\(state.lastLabelCount) \(Self.phaseSummary(for: state)) \(commitFenceWaitSummary(state: state)) recoveryPausedMs=\(recoveryPausedMs.map(String.init) ?? "nil")"
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
    var labelFamilyState = Self.derivedFamilyState(sourceId: mutableState.labelSourceId, state: mutableState)
    if commitInteractionVisibility {
      labelFamilyState.settledVisibleFeatureIds = Set(observation.visibleLabelFeatureIds)
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
    Self.setDerivedFamilyState(
      labelFamilyState,
      sourceId: mutableState.labelSourceId,
      state: &mutableState
    )
    instances[instanceId] = mutableState
    let dirtyStickyIdentityKeys = Array(resetIdentityKeys.union(changedIdentityKeys)).sorted()
    return [
      "visibleLabelFeatureIds": observation.visibleLabelFeatureIds,
      "placedLabels": Self.serializeRenderedPlacedLabels(observation.placedLabels),
      "layerRenderedFeatureCount": layerRenderedFeatureCount,
      "effectiveRenderedFeatureCount": effectiveRenderedFeatureCount,
      "stickyRevision": labelFamilyState.labelObservation.stickyRevision,
      "stickyCandidates": Self.serializedStickyLabelCandidates(
        labelFamilyState.labelObservation.stickyCandidateByIdentity
      ),
      "dirtyStickyIdentityKeys": dirtyStickyIdentityKeys,
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
      "stickyRevision": labelObservation.stickyRevision,
      "stickyCandidates": Self.serializedStickyLabelCandidates(labelObservation.stickyCandidateByIdentity),
      "dirtyStickyIdentityKeys": [],
    ]
  }

  private func configureLabelObservation(
    instanceId: String,
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
    labelFamilyState.labelObservation.observationEnabled = true
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
    labelFamilyState.labelObservation.configuredResetRequestKey = labelResetRequestKey
    Self.setDerivedFamilyState(labelFamilyState, sourceId: state.labelSourceId, state: &state)
    instances[instanceId] = state
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
    if labelFamilyState.labelObservation.isRefreshInFlight {
      let currentQueuedDelayMs = labelFamilyState.labelObservation.queuedRefreshDelayMs
      labelFamilyState.labelObservation.queuedRefreshDelayMs =
        currentQueuedDelayMs.map { min($0, delayMs) } ?? delayMs
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
    DispatchQueue.main.asyncAfter(deadline: .now() + max(0, delayMs) / 1000, execute: workItem)
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
    if let nextDelayMs {
      scheduleLabelObservationRefresh(instanceId: instanceId, delayMs: nextDelayMs)
    }
  }

  private func performLabelObservationRefresh(instanceId: String) {
    guard var state = instances[instanceId] else {
      return
    }
    var labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    guard labelFamilyState.labelObservation.observationEnabled else {
      return
    }
    guard let handle = currentResolvedMapHandle(for: state.mapTag) else {
      return
    }
    let queryRect = handle.mapView.bounds
    guard queryRect.width > 0, queryRect.height > 0 else {
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
      emit(snapshot.merging(["type": "label_observation_updated", "instanceId": instanceId]) { _, new in new })
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
      guard !resolvedLayerIds.isEmpty else {
        let snapshot = currentRenderedLabelObservationSnapshot(instanceId: instanceId)
        emit(snapshot.merging(["type": "label_observation_updated", "instanceId": instanceId]) { _, new in new })
        completeLabelObservationRefresh(instanceId: instanceId)
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
          switch result {
          case .failure:
            self.completeLabelObservationRefresh(instanceId: instanceId)
          case .success(let features):
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
              self.emit(snapshot.merging(["type": "label_observation_updated", "instanceId": instanceId]) { _, new in new })
              self.completeLabelObservationRefresh(instanceId: instanceId)
              return
            }
            handle.mapView.mapboxMap.queryRenderedFeatures(
              with: queryRect,
              options: queryOptions
            ) { fallbackResult in
              DispatchQueue.main.async {
                switch fallbackResult {
                case .failure:
                  self.completeLabelObservationRefresh(instanceId: instanceId)
                case .success(let fallbackFeatures):
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
                  self.emit(snapshot.merging(["type": "label_observation_updated", "instanceId": instanceId]) { _, new in new })
                  self.completeLabelObservationRefresh(instanceId: instanceId)
                }
              }
            }
          }
        }
      }
    } catch {
      completeLabelObservationRefresh(instanceId: instanceId)
    }
  }

  private static func emptyRenderedLabelObservationResult(
    stickyRevision: Int = 0,
    stickyCandidates: [[String: Any]] = [],
    dirtyStickyIdentityKeys: [String] = []
  ) -> [String: Any] {
    [
      "visibleLabelFeatureIds": [],
      "placedLabels": [],
      "layerRenderedFeatureCount": 0,
      "effectiveRenderedFeatureCount": 0,
      "stickyRevision": stickyRevision,
      "stickyCandidates": stickyCandidates,
      "dirtyStickyIdentityKeys": dirtyStickyIdentityKeys,
    ]
  }

  private static func emptyRenderedDotObservationResult() -> [String: Any] {
    [
      "restaurantIds": [],
      "renderedDots": [],
      "renderedFeatureCount": 0,
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
    labelObservation.stickyLastSeenAtMsByIdentity = [:]
    labelObservation.stickyMissingStreakByIdentity = [:]
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
      labelObservation.stickyLastSeenAtMsByIdentity = [:]
      labelObservation.stickyMissingStreakByIdentity = [:]
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
      labelObservation.stickyLastSeenAtMsByIdentity[stickyIdentityKey] = nowMs
      labelObservation.stickyMissingStreakByIdentity[stickyIdentityKey] = 0
      let locked = labelObservation.stickyCandidateByIdentity[stickyIdentityKey]
      if locked == candidate {
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
      let proposed = labelObservation.stickyProposedCandidateByIdentity[stickyIdentityKey]
      if proposed != candidate {
        labelObservation.stickyProposedCandidateByIdentity[stickyIdentityKey] = candidate
        labelObservation.stickyProposedSinceAtMsByIdentity[stickyIdentityKey] = nowMs
        continue
      }
      let sinceAt = labelObservation.stickyProposedSinceAtMsByIdentity[stickyIdentityKey] ?? nowMs
      if nowMs - sinceAt < stableMs {
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
        let nextStreak = (labelObservation.stickyMissingStreakByIdentity[stickyIdentityKey] ?? 0) + 1
        labelObservation.stickyMissingStreakByIdentity[stickyIdentityKey] = nextStreak
        let seenAt = labelObservation.stickyLastSeenAtMsByIdentity[stickyIdentityKey] ?? 0
        if nextStreak >= requiredStreak && nowMs - seenAt > unlockMs {
          labelObservation.stickyCandidateByIdentity.removeValue(forKey: stickyIdentityKey)
          labelObservation.stickyProposedCandidateByIdentity.removeValue(forKey: stickyIdentityKey)
          labelObservation.stickyProposedSinceAtMsByIdentity.removeValue(forKey: stickyIdentityKey)
          labelObservation.stickyMissingStreakByIdentity.removeValue(forKey: stickyIdentityKey)
          changedIdentityKeys.insert(stickyIdentityKey)
        }
      }
    }

    if !changedIdentityKeys.isEmpty {
      labelObservation.stickyRevision += 1
    }
    return changedIdentityKeys
  }

  private static func serializedStickyLabelCandidates(
    _ candidateByIdentity: [String: String]
  ) -> [[String: Any]] {
    candidateByIdentity.keys.sorted().compactMap { identityKey in
      guard let candidate = candidateByIdentity[identityKey] else {
        return nil
      }
      return [
        "identityKey": identityKey,
        "candidate": candidate,
      ]
    }
  }

  private static func buildRenderedDotObservation(
    from features: [QueriedRenderedFeature],
    requiredSourceId: String
  ) -> (
    restaurantIds: [String],
    renderedDots: [[String: Any]]
  ) {
    var restaurantIds = Set<String>()
    var renderedDots: [[String: Any]] = []
    for feature in features {
      guard feature.queriedFeature.source == requiredSourceId,
            let parsed = Self.parseRenderedDotObservationFeature(feature)
      else {
        continue
      }
      restaurantIds.insert(parsed.restaurantId)
      renderedDots.append(parsed.renderedDot)
    }
    return (
      restaurantIds: Array(restaurantIds).sorted(),
      renderedDots: renderedDots
    )
  }

  private static func parseRenderedDotObservationFeature(
    _ feature: QueriedRenderedFeature
  ) -> (
    restaurantId: String,
    renderedDot: [String: Any]
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
      renderedDot: [
        "restaurantId": restaurantId,
        "coordinate": coordinatePayload ?? NSNull(),
      ]
    )
  }

  private static func buildRenderedPinPressTarget(
    from features: [QueriedRenderedFeature],
    requiredSourceId: String
  ) -> [String: Any]? {
    var bestTarget: (
      restaurantId: String,
      coordinate: [String: Any]?,
      lodZ: Double,
      rank: Double,
      featureIndex: Int
    )?

    for (featureIndex, feature) in features.enumerated() {
      guard feature.queriedFeature.source == requiredSourceId,
            let parsed = Self.parseRenderedPinPressFeature(feature)
      else {
        continue
      }
      guard let existing = bestTarget else {
        bestTarget = (
          restaurantId: parsed.restaurantId,
          coordinate: parsed.coordinate,
          lodZ: parsed.lodZ,
          rank: parsed.rank,
          featureIndex: featureIndex
        )
        continue
      }
      if parsed.lodZ > existing.lodZ ||
          (parsed.lodZ == existing.lodZ && parsed.rank < existing.rank) ||
          (parsed.lodZ == existing.lodZ && parsed.rank == existing.rank && featureIndex < existing.featureIndex) {
        bestTarget = (
          restaurantId: parsed.restaurantId,
          coordinate: parsed.coordinate,
          lodZ: parsed.lodZ,
          rank: parsed.rank,
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
    requiredSourceId: String
  ) -> [String: Any]? {
    for feature in features {
      guard feature.queriedFeature.source == requiredSourceId,
            let parsed = Self.parseRenderedLabelPressFeature(feature)
      else {
        continue
      }
      return parsed
    }
    return nil
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
      state.blockedRevealStartRequestKey = nil
      state.blockedRevealStartCommitFenceStartedAtMs = nil
      state.blockedPresentationSettleRequestKey = nil
      state.blockedPresentationSettleKind = nil
      state.blockedPresentationCommitFenceStartedAtMs = nil
      state.blockedRevealStartCommitFenceBySourceId = [:]
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
          sourceIds: self.managedSourceIds(for: state),
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
        updatedState.sourceRecoveryPausedAtMs = nil
        self.instances[instanceId] = updatedState
        self.emit([
          "type": "render_owner_recovered_after_style_reload",
          "instanceId": instanceId,
          "frameGenerationId": updatedState.activeFrameGenerationId as Any,
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
        fenceBySourceId: &state.blockedRevealStartCommitFenceBySourceId
      )
      removeCommittedPendingDataIds(
        sourceId: sourceId,
        acknowledgedDataId: dataId,
        fenceBySourceId: &state.blockedPresentationCommitFenceBySourceId
      )
      if sourceId == state.pinSourceId {
        startAwaitingLivePinTransitions(instanceId: instanceId, dataId: dataId, state: &state)
      }
      if sourceId == state.dotSourceId {
        startAwaitingLiveDotTransitions(instanceId: instanceId, dataId: dataId, state: &state)
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
    if let blockedRevealStartRequestKey = state.blockedRevealStartRequestKey,
       !hasPendingCommitFence(state.blockedRevealStartCommitFenceBySourceId) {
      let blockedWaitMs = state.blockedRevealStartCommitFenceStartedAtMs.map { max(0, Int((Self.nowMs() - $0).rounded())) }
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "reveal_start_commit_fence_cleared waitMs=\(blockedWaitMs.map(String.init) ?? "nil") pending=none \(commitFenceWaitSummary(state: state))"
      )
      state.blockedRevealStartRequestKey = nil
      state.blockedRevealStartCommitFenceStartedAtMs = nil
      state.blockedRevealStartCommitFenceBySourceId.removeAll()
      state.presentationExecutionPhase = "reveal_preroll"
      instances[instanceId] = state
      maybeEmitRevealBatchArmed(instanceId: instanceId, state: &state)
      if
        let presentationStateJSON = state.lastPresentationStateJSON,
        Self.readRevealStatus(fromJSON: presentationStateJSON) == "revealing",
        let revealStartToken = Self.readRevealStartToken(fromJSON: presentationStateJSON)
      {
        do {
          try startRevealPresentation(
            instanceId: instanceId,
            requestKey: blockedRevealStartRequestKey,
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
          "\(state.blockedPresentationSettleKind == "dismiss" ? "dismiss" : "reveal")_commit_fence_cleared waitMs=\(blockedWaitMs.map(String.init) ?? "nil") pending=none \(commitFenceWaitSummary(state: state))"
      )
      state.pendingPresentationSettleRequestKey = blockedPresentationSettleRequestKey
      state.pendingPresentationSettleKind = state.blockedPresentationSettleKind
      state.presentationExecutionPhase =
        state.blockedPresentationSettleKind == "dismiss" ? "dismissing" : "reveal_settling"
      state.blockedPresentationSettleRequestKey = nil
      state.blockedPresentationSettleKind = nil
      state.blockedPresentationCommitFenceStartedAtMs = nil
      state.blockedPresentationCommitFenceBySourceId.removeAll()
      if state.pendingPresentationSettleKind == "dismiss" {
        armNativeDismissSettle(instanceId: instanceId, requestKey: blockedPresentationSettleRequestKey)
      } else {
        armNativeRevealSettle(instanceId: instanceId, requestKey: blockedPresentationSettleRequestKey)
      }
    }
  }

  private func hasPendingVisualSourceCommits(state: InstanceState) -> Bool {
    [state.pinSourceId, state.dotSourceId, state.labelSourceId].contains { sourceId in
      !(state.pendingSourceCommitDataIdsBySourceId[sourceId] ?? []).isEmpty
    }
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
    let revealWaitMs = state.blockedRevealStartCommitFenceStartedAtMs.map { max(0, Int((nowMs - $0).rounded())) }
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

  private func armNativeRevealSettle(instanceId: String, requestKey: String) {
    revealFrameFallbackWorkItems[instanceId]?.cancel()
    let workItem = DispatchWorkItem { [weak self] in
      guard let self, let state = self.instances[instanceId] else { return }
      guard state.pendingPresentationSettleRequestKey == requestKey else { return }
      guard state.pendingPresentationSettleKind == "reveal" else { return }
      self.settleRevealAfterRenderedFrame(instanceId: instanceId, requestKey: requestKey)
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
      guard state.pendingPresentationSettleKind == "dismiss" else { return }
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
    if previousSourceLifecyclePhase != .incremental {
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

    if previousSourceLifecyclePhase != .incremental {
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

  private static func applySourceMutationBatch(
    _ plans: [ResolvedSourceMutationPlan],
    mapboxMap: MapboxMap
  ) throws {
    for plan in plans {
      guard plan.mutationMode == .baselineReplace,
            plan.previousSourceRevision != plan.next.sourceRevision
      else {
        continue
      }
      try replaceSourceData(sourceId: plan.sourceId, next: plan.next, mapboxMap: mapboxMap)
    }

    for plan in plans {
      guard plan.mutationMode == .incrementalPatch,
            plan.previousSourceRevision != plan.next.sourceRevision,
            !plan.next.removedFeatureIdsInOrder.isEmpty
      else {
        continue
      }
      mapboxMap.removeGeoJSONSourceFeatures(
        forSourceId: plan.sourceId,
        featureIds: plan.next.removedFeatureIdsInOrder,
        dataId: plan.dataId
      )
    }

    for plan in plans {
      guard plan.mutationMode == .incrementalPatch,
            plan.previousSourceRevision != plan.next.sourceRevision,
            !plan.next.addedFeatures.isEmpty
      else {
        continue
      }
      mapboxMap.addGeoJSONSourceFeatures(
        forSourceId: plan.sourceId,
        features: plan.next.addedFeatures,
        dataId: plan.dataId
      )
    }

    for plan in plans {
      guard plan.mutationMode == .incrementalPatch,
            plan.previousSourceRevision != plan.next.sourceRevision,
            !plan.next.updatedFeatures.isEmpty
      else {
        continue
      }
      mapboxMap.updateGeoJSONSourceFeatures(
        forSourceId: plan.sourceId,
        features: plan.next.updatedFeatures,
        dataId: plan.dataId
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
    let resolvedPlans = try plans.map(Self.resolveParsedCollectionApplyPlan)
    var mutationSummaryBySourceId: [String: MutationSummary] = [:]
    var resolvedMutationPlans: [ResolvedSourceMutationPlan] = []

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

    try Self.applySourceMutationBatch(resolvedMutationPlans, mapboxMap: mapboxMap)

    for plan in resolvedPlans {
      let mutationSummary = mutationSummaryBySourceId[plan.sourceId] ?? MutationSummary(
        addCount: 0,
        updateCount: 0,
        removeCount: 0,
        dataId: nil,
        addedFeatureIds: []
      )
      Self.applyFeatureStates(
        sourceId: plan.sourceId,
        previousFeatureStateRevision: plan.previousFeatureStateRevision,
        nextFeatureStateRevision: plan.next.featureStateRevision,
        changedFeatureStateIds: plan.nextSourceState.featureStateChangedIds,
        featureStateById: plan.next.featureStateById,
        previousFeatureStateById: plan.previousFeatureStateById,
        mapboxMap: mapboxMap
      )
      self.registerPendingSourceCommit(
        instanceId: instanceId,
        sourceId: plan.sourceId,
        mutationSummary: mutationSummary,
        state: &state
      )
      Self.syncMountedSourceState(plan.nextSourceState, sourceId: plan.sourceId, state: &state)
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
    numericProperties: [String: Double]
  ) -> Feature {
    var nextFeature = feature
    var properties = nextFeature.properties ?? JSONObject()
    for (key, value) in numericProperties {
      properties[key] = JSONValue(rawValue: value)
    }
    nextFeature.properties = properties
    return nextFeature
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
    sendEvent(withName: eventName, body: body)
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
      "type": "error",
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
      "sourcesPresent=\(presentIds.count)/\(sourceIds.count) missing=\(missingIds.isEmpty ? "none" : missingIds.joined(separator: ","))"
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
       nowMs - lastProbeAtMs < renderedFeatureProbeThrottleMs {
      return
    }
    lastViewCompositionProbeAtMsByInstance[instanceId] = nowMs
    lastViewCompositionProbeFrameByInstance[instanceId] = frameGenerationId

    let phase = state.lastPresentationPhase
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

  private func maybeProbeRenderedFeatures(
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
    if lastRenderedFeatureProbeFrameByInstance[instanceId] == frameGenerationId {
      return
    }
    if let lastProbeAtMs = lastRenderedFeatureProbeAtMsByInstance[instanceId],
       nowMs - lastProbeAtMs < renderedFeatureProbeThrottleMs {
      return
    }
    let sourcePinCount = Self.mountedSourceState(sourceId: state.pinSourceId, state: state)?.diffKeyById.count ?? 0
    let sourceDotCount = Self.mountedSourceState(sourceId: state.dotSourceId, state: state)?.diffKeyById.count ?? 0
    let sourceLabelCount = Self.mountedSourceState(sourceId: state.labelSourceId, state: state)?.diffKeyById.count ?? 0
    guard sourcePinCount > 0 || sourceDotCount > 0 || sourceLabelCount > 0 else {
      return
    }
    lastRenderedFeatureProbeAtMsByInstance[instanceId] = nowMs
    lastRenderedFeatureProbeFrameByInstance[instanceId] = frameGenerationId

    let mapTag = state.mapTag
    let phase = state.lastPresentationPhase
    let moving = state.currentViewportIsMoving
    let commitSummary = commitFenceWaitSummary(state: state)
    let visualSourceIds = visualSourceIds(for: state)
    do {
      try withResolvedMapHandleResult(for: mapTag) { handle in
        let queryRect = handle.mapView.bounds
        guard queryRect.width > 0, queryRect.height > 0 else {
          emitVisualDiag(
            instanceId: instanceId,
            message:
              "rendered_feature_probe_skip scope=\(scope) frame=\(frameGenerationId) phase=\(phase) reason=empty_bounds width=\(Int(queryRect.width.rounded())) height=\(Int(queryRect.height.rounded()))"
          )
          return
        }
        let layerIds = try resolveRenderedProbeLayerIds(for: visualSourceIds, mapboxMap: handle.mapView.mapboxMap)
        guard !layerIds.isEmpty else {
          emitVisualDiag(
            instanceId: instanceId,
            message:
              "rendered_feature_probe_skip scope=\(scope) frame=\(frameGenerationId) phase=\(phase) reason=no_visual_layers sources=\(visualSourceIds.joined(separator: ","))"
          )
          return
        }
        let queryStartedAtMs = Self.nowMs()
        _ = handle.mapView.mapboxMap.queryRenderedFeatures(
          with: queryRect,
          options: RenderedQueryOptions(layerIds: layerIds, filter: nil)
        ) { [weak self] result in
          DispatchQueue.main.async {
            guard let self else {
              return
            }
            let queryDurationMs = Self.nowMs() - queryStartedAtMs
            switch result {
            case .success(let features):
              let renderedPinCount = features.reduce(into: 0) { count, feature in
                if feature.queriedFeature.source == state.pinSourceId {
                  count += 1
                }
              }
              let renderedDotCount = features.reduce(into: 0) { count, feature in
                if feature.queriedFeature.source == state.dotSourceId {
                  count += 1
                }
              }
              let renderedLabelCount = features.reduce(into: 0) { count, feature in
                if feature.queriedFeature.source == state.labelSourceId {
                  count += 1
                }
              }
              var zeroRenderedSources: [String] = []
              if sourcePinCount > 0 && renderedPinCount == 0 {
                zeroRenderedSources.append("pins")
              }
              if sourceDotCount > 0 && renderedDotCount == 0 {
                zeroRenderedSources.append("dots")
              }
              if sourceLabelCount > 0 && renderedLabelCount == 0 {
                zeroRenderedSources.append("labels")
              }
              self.emitVisualDiag(
                instanceId: instanceId,
                message:
                  "rendered_feature_probe scope=\(scope) frame=\(frameGenerationId) phase=\(phase) moving=\(moving) sourcePins=\(sourcePinCount) sourceDots=\(sourceDotCount) sourceLabels=\(sourceLabelCount) renderedPins=\(renderedPinCount) renderedDots=\(renderedDotCount) renderedLabels=\(renderedLabelCount) layerCount=\(layerIds.count) queryMs=\(Int(queryDurationMs.rounded())) zeroRendered=\(zeroRenderedSources.isEmpty ? "none" : zeroRenderedSources.joined(separator: ",")) \(commitSummary)"
              )
            case .failure(let error):
              self.emitVisualDiag(
                instanceId: instanceId,
                message:
                  "rendered_feature_probe_failed scope=\(scope) frame=\(frameGenerationId) phase=\(phase) queryMs=\(Int(queryDurationMs.rounded())) error=\(error.localizedDescription)"
              )
            }
          }
        }
      }
    } catch {
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "rendered_feature_probe_failed scope=\(scope) frame=\(frameGenerationId) phase=\(phase) error=\(error.localizedDescription)"
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
          "slow_action_window scope=\(scope) streak=\(window.streak) windowMs=\(Int((nowMs - window.startedAtMs).rounded())) durationMs=\(Int(durationMs.rounded())) maxDurationMs=\(Int(window.maxDurationMs.rounded())) phase=\(state.lastPresentationPhase) moving=\(state.currentViewportIsMoving) pins=\(state.lastPinCount) dots=\(state.lastDotCount) labels=\(state.lastLabelCount) \(commitSummary)\(extra.isEmpty ? "" : " \(extra)")"
      )
      maybeProbeViewComposition(instanceId: instanceId, scope: scope, state: state)
      maybeProbeRenderedFeatures(instanceId: instanceId, scope: scope, state: state)
      return
    }
    guard let window = slowActionWindowsByInstanceAndScope[key], window.streak > 0 else {
      return
    }
    slowActionWindowsByInstanceAndScope.removeValue(forKey: key)
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "slow_action_window_settled scope=\(scope) streak=\(window.streak) windowMs=\(Int((nowMs - window.startedAtMs).rounded())) maxDurationMs=\(Int(window.maxDurationMs.rounded())) phase=\(state.lastPresentationPhase) moving=\(state.currentViewportIsMoving) pins=\(state.lastPinCount) dots=\(state.lastDotCount) labels=\(state.lastLabelCount) \(commitSummary)\(extra.isEmpty ? "" : " \(extra)")"
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

  private static func readPresentationPhase(fromJSON json: String) -> String {
    guard
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let phase = object["batchPhase"] as? String
    else {
      return "unknown"
    }
    return phase
  }

  private static func readDismissRequestKey(fromJSON json: String) -> String? {
    guard
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return nil
    }
    let laneObject = object["lane"] as? [String: Any]
    if laneObject?["kind"] as? String == "dismiss" {
      return laneObject?["requestKey"] as? String
    }
    return object["dismissRequestKey"] as? String
  }

  private static func readRevealRequestKey(fromJSON json: String) -> String? {
    guard
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return nil
    }
    let revealObject =
      ((object["lane"] as? [String: Any])?["kind"] as? String) == "reveal"
      ? object["lane"] as? [String: Any]
      : object["reveal"] as? [String: Any]
    if let requestKey = revealObject?["requestKey"] as? String {
      return requestKey
    }
    return (revealObject?["batch"] as? [String: Any])?["requestKey"] as? String
  }

  private static func readRevealStatus(fromJSON json: String) -> String? {
    guard
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return nil
    }
    let revealObject =
      ((object["lane"] as? [String: Any])?["kind"] as? String) == "reveal"
      ? object["lane"] as? [String: Any]
      : object["reveal"] as? [String: Any]
    return revealObject?["status"] as? String
  }

  private static func readRevealStartToken(fromJSON json: String) -> Double? {
    guard
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return nil
    }
    let revealObject =
      ((object["lane"] as? [String: Any])?["kind"] as? String) == "reveal"
      ? object["lane"] as? [String: Any]
      : object["reveal"] as? [String: Any]
    if let value = revealObject?["startToken"] as? NSNumber {
      return value.doubleValue
    }
    if let value = revealObject?["startToken"] as? Double {
      return value
    }
    return nil
  }

  private static func readAllowEmptyReveal(fromJSON json: String) -> Bool {
    guard
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return true
    }
    if let value = object["allowEmptyReveal"] as? Bool {
      return value
    }
    if let value = object["allowEmptyReveal"] as? NSNumber {
      return value.boolValue
    }
    let revealObject = object["reveal"] as? [String: Any]
    if let value = revealObject?["allowEmptyReveal"] as? Bool {
      return value
    }
    if let value = revealObject?["allowEmptyReveal"] as? NSNumber {
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
