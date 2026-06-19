import Foundation
import CoreLocation
import MapLodKit
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
    SearchMapRenderController.configureDisplayLink(displayLink)
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
  // Stage B: screen-space visibility pad. A marker whose projected screen point
  // is within the view rect expanded by this many px counts as "on-screen" — the
  // pad keeps markers just past the edge promotable so they don't pop in/out at
  // the boundary (mirrors the JS padded-AABB intent, but in true screen space).
  private let nativeScreenSpaceVisibilityPadPx: CGFloat = 64
  // Exit ring for the spatial visibility hysteresis: a marker already on-screen
  // stays "visible" until its projection crosses this looser pad. The 64px gap vs
  // the enter pad absorbs per-frame projection noise at the screen edge so an edge
  // marker cannot oscillate in/out of the visible set (and flip its LOD role).
  private let nativeScreenSpaceVisibilityExitPadPx: CGFloat = 128
  private let nativePressCancelMovementThresholdPx: CGFloat = 10
  private let settledVisibleLabelMissingGraceStreak = 2
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
    case hidden
    case preparingReveal
    case revealing
    case visible
    case dismissing
  }

  private struct VisualFrameTransaction {
    var kind: String
    var presentationPhase: String
    var requestKey: String?
    var visualCycleKey: String?
    var readinessKey: String?
    var shortcutCoverageRequestKey: String?
    var markersRenderKey: String?
    var sourceFrameKey: String
    var sourceDataKey: String
    var sourceSnapshotKind: String
  }

  private struct VisualFrameSnapshotApplyResult {
    var didSyncResidentFrame: Bool
    var sourceAdmissionOutcome: String
  }

  private static func isVisualSourceInactiveOrDismissing(_ state: InstanceState) -> Bool {
    state.visualSourceLifecycleState == .dismissing ||
      state.visualSourceLifecycleState == .hidden
  }

  private static func isVisualSourceDismissing(_ state: InstanceState) -> Bool {
    state.visualSourceLifecycleState == .dismissing
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

  private final class NativePressLifecycleGestureRecognizer: UIGestureRecognizer, UIGestureRecognizerDelegate {
    var onPressBegan: ((CGPoint) -> Void)?
    var onPressMoved: ((CGPoint) -> Void)?
    var onPressEnded: ((CGPoint) -> Void)?
    var onPressCancelled: (() -> Void)?

    private weak var activeTouch: UITouch?

    override init(target: Any?, action: Selector?) {
      super.init(target: target, action: action)
      delegate = self
      cancelsTouchesInView = false
      delaysTouchesBegan = false
      delaysTouchesEnded = false
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
      guard activeTouch == nil, touches.count == 1, let touch = touches.first, let view else {
        onPressCancelled?()
        state = .failed
        return
      }
      activeTouch = touch
      state = .began
      onPressBegan?(touch.location(in: view))
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
      guard let activeTouch, touches.contains(activeTouch), let view else {
        return
      }
      if state == .began || state == .changed {
        state = .changed
      }
      onPressMoved?(activeTouch.location(in: view))
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
      guard let activeTouch, touches.contains(activeTouch), let view else {
        onPressCancelled?()
        state = .failed
        return
      }
      onPressEnded?(activeTouch.location(in: view))
      state = .ended
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
      onPressCancelled?()
      state = .cancelled
    }

    override func canPrevent(_ preventedGestureRecognizer: UIGestureRecognizer) -> Bool {
      false
    }

    override func canBePrevented(by preventingGestureRecognizer: UIGestureRecognizer) -> Bool {
      false
    }

    func gestureRecognizer(
      _ gestureRecognizer: UIGestureRecognizer,
      shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
      true
    }

    override func reset() {
      activeTouch = nil
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
    var nativePressGestureRecognizer: NativePressLifecycleGestureRecognizer?
    var nativePressSession: NativePressSession?
    var nativePressSequence: Int = 0
    let gestureObserver = NativeCameraGestureObserver()
    var isGestureObserverRegistered = false
    var lastNativeCameraDiagAtMs: Double = 0
    var lastNativeCameraDiagSignature: String?

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
      if let nativePressGestureRecognizer {
        mapView.removeGestureRecognizer(nativePressGestureRecognizer)
      }
      nativePressGestureRecognizer = nil
      nativePressSession = nil
      if isGestureObserverRegistered {
        if let gestureDelegateHostView {
          SearchMapRenderController.removeGestureDelegate(gestureObserver, from: gestureDelegateHostView)
        }
        isGestureObserverRegistered = false
      }
      gestureObserver.reset()
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
    var forceReplaceSourceData: Bool = false
  }

  private struct ResolvedParsedCollectionApplyPlan {
    var sourceId: String
    var next: ParsedFeatureCollection
    var previousSourceLifecyclePhase: SourceLifecyclePhase
    var previousSourceRevision: String
    var previousFeatureStateById: [String: [String: Any]]
    var previousFeatureStateRevision: String
    var nextSourceState: SourceState
    var forceReplaceSourceData: Bool
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
    var pinSourceIds: [String]
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
    var commitVisibleLabelHits: Bool = false
    var refreshMsIdle: Double = 0
    var refreshMsMoving: Double = 0
    var configuredResetRequestKey: String? = nil
    var hasCommittedObservationForConfiguredRequest: Bool = false
    var lastVisibleLabelFeatureIds: [String] = []
    var lastLayerRenderedFeatureCount: Int = 0
    var lastEffectiveRenderedFeatureCount: Int = 0
    var lastResetRequestKey: String? = nil
    var settledVisibleMissingStreakByFeatureId: [String: Int] = [:]
    var isRefreshInFlight: Bool = false
    var queuedRefreshDelayMs: Double? = nil
    var movingNoopRefreshStreak: Int = 0
    var movingAdaptiveRefreshMs: Double = 0
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
    var pinFeatureDiffKeyByMarkerKey: [String: String] = [:]
    var pinInteractionFeatureByMarkerKey: [String: Feature] = [:]
    var pinInteractionFeatureDiffKeyByMarkerKey: [String: String] = [:]
    var labelFeaturesByMarkerKey: [String: [(id: String, feature: Feature, diffKey: String)]] = [:]
    var labelCollisionFeatureByMarkerKey: [String: Feature] = [:]
    var labelCollisionFeatureDiffKeyByMarkerKey: [String: String] = [:]
  }

  private struct ParsedTransportFeatureRecord {
    var id: String
    var feature: Feature
    var diffKey: String
    var featureState: [String: Any]
    var markerKey: String
  }

  private struct ParsedMarkerRoleRow {
    var markerKey: String
    var role: String
    var slotIndex: Int?
    var pinFeature: ParsedTransportFeatureRecord?
    var pinInteractionFeature: ParsedTransportFeatureRecord?
    var dotFeature: ParsedTransportFeatureRecord?
    var labelFeatures: [ParsedTransportFeatureRecord]
    var labelCollisionFeature: ParsedTransportFeatureRecord?
  }

  private struct MarkerRoleTable {
    var pinnedMarkerKeysInOrder: [String] = []
    var dotMarkerKeysInOrder: [String] = []
    var residentDotMarkerKeysInOrder: [String] = []
    var rowByMarkerKey: [String: ParsedMarkerRoleRow] = [:]
  }

  private struct MarkerFamilyRenderState {
    var pinFeature: Feature
    var pinFeatureDiffKey: String
    var pinInteractionFeature: Feature?
    var pinInteractionFeatureDiffKey: String?
    var labelFeatures: [(id: String, feature: Feature, diffKey: String)]
    var labelCollisionFeature: Feature?
    var labelCollisionFeatureDiffKey: String?
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
    var hasAppliedTargetState: Bool
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
    var hasAppliedTargetState: Bool
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

  private struct NativePressTargetConfig {
    var enabled: Bool = false
    var pinLayerIds: [String] = []
    var labelLayerIds: [String] = []
    var labelTapHitbox: LabelTapHitboxConfig? = nil
    var dotLayerIds: [String] = []
    var dotTapIntentRadiusPx: CGFloat = 0
  }

  private struct NativePressSession {
    let sequence: Int
    let instanceId: String
    let startedAtMs: Double
    let startPoint: CGPoint
    var latestPoint: CGPoint
    var resolvedTarget: [String: Any]? = nil
    var didResolve: Bool = false
    var didRelease: Bool = false
    var didCancel: Bool = false
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

  // Stage B: the full ranked candidate catalog JS pushes once per results change.
  // Native projects these to screen space each camera tick to decide which markers
  // are actually on-screen under the live camera (pitch/twist-accurate), which JS
  // then uses for promotion/demotion instead of a padded lat/lng AABB.
  private struct CandidateCatalogEntry {
    let markerKey: String
    let coordinate: CLLocationCoordinate2D
    let rank: Int
  }

  private struct InstanceState {
    // The single RENDERED bundle source id (pin art + interaction + labels for
    // every promoted marker, slot-scoped by `nativeLodZ` in the layer filters).
    // Distinct from `pinSourceId`, which stays the in-memory pin STAGING family
    // (marker render state / transitions) and is never applied to Mapbox. Must
    // match the JS render tree: `"\(pinSourceId)-bundle"`.
    var pinBundleSourceId: String { "\(pinSourceId)-bundle" }
    var mapTag: NSNumber
    var pinSourceId: String
    var pinInteractionSourceId: String
    var dotSourceId: String
    var labelSourceId: String
    var labelCollisionSourceId: String
    var labelLayerIds: [String]
    var labelCollisionLayerIds: [String]
    var lastPinVisualGroupOrderSlots: [Int]
    var lastPinVisualGroupOrderSignature: String?
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
    var lastPresentationStateJSON: String?
    var activeFrameGenerationId: String?
    var activeExecutionBatchId: String?
    var sourceReadyFrameGenerationId: String?
    var sourceReadyExecutionBatchId: String?
    var residentSourceFrameKey: String?
    var residentSourceDataKey: String?
    var highlightedMarkerKey: String?
    var highlightedMarkerKeys: Set<String>
    var highlightedRestaurantId: String?
    var interactionMode: String
    var nativePressTargetConfig: NativePressTargetConfig
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
    var markerRoleTable: MarkerRoleTable
    var isAwaitingSourceRecovery: Bool
    var isReplayingSourceRecovery: Bool
    var sourceRecoveryPausedAtMs: Double?
    // Stage B: ranked candidate catalog (markerKey + coordinate + rank), pushed by
    // JS once per results change; projected per camera tick for screen-space LOD.
    var candidateCatalog: [CandidateCatalogEntry]
    // Throttle signature so the native-visible-marker emit only fires when the
    // on-screen set actually changes (avoids redundant per-tick bridge traffic).
    var lastVisibleMarkerSetSignature: String?
    // GRANULAR LOD (native-owned, Phase 2): the promoted set the native projector decided
    // this frame (top-maxFullPins by rank among the on-screen set). driveNativeLod applies it
    // to the role table per camera frame so promote/demote happens per-pin natively, with no
    // JS round-trip / whole-frame republish.
    var nativePromotedKeysInOrder: [String] = []
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

  private struct NativeApplyAttributionFrameContext {
    let transactionKind: String
    let sourceSnapshotKind: String
    let sourcePayloadDisposition: String
    let rawSourceDeltaCount: Int
    let appliedSourceDeltaCount: Int
    let sourceFamilySignature: String
    let sourceModeSignature: String
    let sourceOperationSignature: String

    var key: String {
      [
        transactionKind,
        sourceSnapshotKind,
        sourcePayloadDisposition,
        "raw:\(rawSourceDeltaCount)",
        "applied:\(appliedSourceDeltaCount)",
        sourceFamilySignature,
        sourceModeSignature,
        sourceOperationSignature,
      ].joined(separator: "|")
    }

    func dictionary() -> [String: Any] {
      [
        "transactionKind": transactionKind,
        "sourceSnapshotKind": sourceSnapshotKind,
        "sourcePayloadDisposition": sourcePayloadDisposition,
        "rawSourceDeltaCount": rawSourceDeltaCount,
        "appliedSourceDeltaCount": appliedSourceDeltaCount,
        "sourceFamilySignature": sourceFamilySignature,
        "sourceModeSignature": sourceModeSignature,
        "sourceOperationSignature": sourceOperationSignature,
      ]
    }
  }

  private struct NativeApplyContextAttributionBucket {
    let section: String
    let phase: String
    let source: String
    let context: NativeApplyAttributionFrameContext
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
      var payload = context.dictionary()
      payload["section"] = section
      payload["phase"] = phase
      payload["source"] = source
      payload["count"] = count
      payload["totalMs"] = SearchMapRenderController.round1(totalMs)
      payload["maxMs"] = SearchMapRenderController.round1(maxMs)
      payload["operationCount"] = operationCount
      return payload
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
  // Non-camera safety watchdog that RE-ATTEMPTS label placement if the label-placement gate
  // has not opened by its deadline (reveal-start deadlock guard). It re-wakes the dormant
  // label render layers and re-schedules the observation refresh from the last-known config —
  // it never bypasses the gate or starts the reveal with unplaced pins. Separate from
  // revealFrameFallbackWorkItems, which only settles a reveal that has ALREADY started.
  private var revealStartDeadlockFallbackWorkItems: [String: DispatchWorkItem] = [:]
  // Per-instance count of placement re-attempts the watchdog has spent on the current reveal.
  // Reset when a reveal is armed (`armRevealStartDeadlockFallback`) and when the reveal starts
  // or is dismissed. Bounds the watchdog so it cannot spin forever.
  private var revealStartDeadlockReattemptCountByInstance: [String: Int] = [:]
  private var dismissFrameFallbackWorkItems: [String: DispatchWorkItem] = [:]
  private var sourceRecoveryWorkItems: [String: DispatchWorkItem] = [:]
  private var nextOwnerEpoch: Int = 1
  private var labelObservationRefreshWorkItems: [String: DispatchWorkItem] = [:]
  private var presentationOpacityAnimators: [String: PresentationOpacityAnimator] = [:]
  private var livePinTransitionAnimators: [String: CADisplayLink] = [:]
  private var lastVisualDiagByInstance: [String: String] = [:]
  // Harness: last [lodev] step emit time, for the per-frame render-cadence (jank) delta.
  private var lastHarnessStepMs: Double = 0
  private var slowActionWindowsByInstanceAndScope: [String: SlowActionWindowState] = [:]
  private var nativeApplyAttributionEnabled = false
  private var nativeApplyAttributionStartedAtMs: Double?
  private var nativeApplyAttributionBuckets: [String: NativeApplyAttributionBucket] = [:]
  private var nativeApplyAttributionContextBuckets: [String: NativeApplyContextAttributionBucket] = [:]
  private var nativeApplyAttributionCurrentContext: NativeApplyAttributionFrameContext?
  private let slowActionThresholdMs = 12.0
  private let frameSettleFallbackDelayMs = 96
  // Reveal-start deadlock watchdog cadence: if placement has not committed and the reveal has
  // not started by this delay after the reveal is armed/preparing, RE-ATTEMPT placement
  // (re-wake the label render layers + re-schedule the observation refresh from the last-known
  // config). Long enough that the normal observe+commit path wins under normal conditions
  // (the common case starts the reveal via the gate well before this fires), short enough that
  // a dropped enable is recovered without a perceptible stuck frame. Re-armed each attempt.
  private let revealStartDeadlockFallbackDelayMs = 96
  // Upper bound on placement re-attempts before the watchdog gives up and emits a loud
  // diagnostic. With `revealStartDeadlockFallbackDelayMs` cadence this bounds total watchdog
  // time (~96ms * attempts). The reveal is NEVER force-started with unplaced pins; if the gate
  // still cannot open after this many attempts the deeper bug is surfaced via the diagnostic
  // and the reveal stays gated (the camera-move rescue path remains as a last resort).
  private let revealStartDeadlockMaxReattempts = 12
  private let sourceRecoveryRetryDelayMs = 32
  private let deferredDismissSourceCleanupDelayMs = 760
  private let revealPrerollPlacementOpacity = 0.001
  private static let searchLabelsZAnchorLayerId = "search-labels-z-anchor-layer"
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

  fileprivate static func configureDisplayLink(_ displayLink: CADisplayLink) {
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

  private func nativeApplyAttributionContextKey(
    section: String,
    phase: String,
    source: String,
    context: NativeApplyAttributionFrameContext
  ) -> String {
    "\(nativeApplyAttributionKey(section: section, phase: phase, source: source))|\(context.key)"
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

    guard let context = nativeApplyAttributionCurrentContext else {
      return
    }
    let contextKey = nativeApplyAttributionContextKey(
      section: section,
      phase: phase,
      source: source,
      context: context
    )
    var contextBucket = nativeApplyAttributionContextBuckets[contextKey] ??
      NativeApplyContextAttributionBucket(
        section: section,
        phase: phase,
        source: source,
        context: context
      )
    contextBucket.record(durationMs: durationMs, operationCount: operationCount)
    nativeApplyAttributionContextBuckets[contextKey] = contextBucket
  }

  private func nativeApplySourceFamily(sourceId: String, state: InstanceState) -> String {
    if sourceId == state.pinSourceId {
      return "pins"
    }
    if sourceId == state.pinBundleSourceId {
      return "promotedSlots"
    }
    if sourceId == state.pinInteractionSourceId {
      return "pinInteractions"
    }
    if sourceId == state.dotSourceId {
      return "dots"
    }
    if sourceId == state.labelSourceId {
      return "labels"
    }
    if sourceId == state.labelCollisionSourceId {
      return "labelCollisions"
    }
    return sourceId
  }

  private func nativeApplyFrameContext(
    visualFrameTransaction: VisualFrameTransaction,
    sourceDeltas: [[String: Any]]?,
    markerRoleFrame: [String: Any]?,
    hasSourcePayload: Bool,
    shouldApplySourcePayload: Bool,
    state: InstanceState
  ) -> NativeApplyAttributionFrameContext {
    let rawDeltas = sourceDeltas ?? []
    let appliedDeltas = shouldApplySourcePayload ? rawDeltas : []
    let sourcePayloadDisposition =
      hasSourcePayload
        ? (shouldApplySourcePayload ? "applied" : "blocked")
        : "none"
    var familyCounts: [String: Int] = [:]
    var modeCounts: [String: Int] = [:]
    var removeFeatureCount = 0
    var upsertFeatureCount = 0
    var nextFeatureCount = 0
    var dirtyGroupCount = 0
    var orderChangedGroupCount = 0
    var removedGroupCount = 0

    for rawDelta in appliedDeltas {
      let sourceId = (rawDelta["sourceId"] as? String) ?? "unknown"
      let sourceFamily = nativeApplySourceFamily(sourceId: sourceId, state: state)
      familyCounts[sourceFamily, default: 0] += 1
      let mode = (rawDelta["mode"] as? String) ?? "patch"
      modeCounts[mode, default: 0] += 1
      removeFeatureCount += (rawDelta["removeIds"] as? [Any])?.count ?? 0
      upsertFeatureCount += (rawDelta["upsertFeatures"] as? [Any])?.count ?? 0
      nextFeatureCount += (rawDelta["nextFeatureIdsInOrder"] as? [Any])?.count ?? 0
      dirtyGroupCount += (rawDelta["dirtyGroupIds"] as? [Any])?.count ?? 0
      orderChangedGroupCount += (rawDelta["orderChangedGroupIds"] as? [Any])?.count ?? 0
      removedGroupCount += (rawDelta["removedGroupIds"] as? [Any])?.count ?? 0
    }
    if shouldApplySourcePayload, let markerRoleFrame {
      familyCounts["markerRoles", default: 0] += 1
      modeCounts[(markerRoleFrame["mode"] as? String) ?? "patch", default: 0] += 1
      let dirtyCount = (markerRoleFrame["dirtyMarkerKeys"] as? [Any])?.count ?? 0
      let removedCount = (markerRoleFrame["removedMarkerKeys"] as? [Any])?.count ?? 0
      let upsertCount = (markerRoleFrame["upsertRoles"] as? [Any])?.count ?? 0
      dirtyGroupCount += dirtyCount
      removedGroupCount += removedCount
      upsertFeatureCount += upsertCount
    }

    let sourceFamilySignature =
      familyCounts.isEmpty
        ? "none"
        : familyCounts.keys.sorted().map { "\($0):\(familyCounts[$0] ?? 0)" }.joined(separator: ",")
    let sourceModeSignature =
      modeCounts.isEmpty
        ? "none"
        : modeCounts.keys.sorted().map { "\($0):\(modeCounts[$0] ?? 0)" }.joined(separator: ",")
    let sourceOperationSignature = [
      "remove:\(removeFeatureCount)",
      "upsert:\(upsertFeatureCount)",
      "next:\(nextFeatureCount)",
      "dirty:\(dirtyGroupCount)",
      "order:\(orderChangedGroupCount)",
      "removed:\(removedGroupCount)",
    ].joined(separator: "|")

    return NativeApplyAttributionFrameContext(
      transactionKind: visualFrameTransaction.kind,
      sourceSnapshotKind: visualFrameTransaction.sourceSnapshotKind,
      sourcePayloadDisposition: sourcePayloadDisposition,
      rawSourceDeltaCount: rawDeltas.count,
      appliedSourceDeltaCount: appliedDeltas.count,
      sourceFamilySignature: sourceFamilySignature,
      sourceModeSignature: sourceModeSignature,
      sourceOperationSignature: sourceOperationSignature
    )
  }

  private func flushNativeApplyAttributionSummary(reason: String, reset: Bool) -> [String: Any] {
    let flushedAtMs = Self.nowMs()
    let buckets = nativeApplyAttributionBuckets.values.sorted {
      if $0.totalMs == $1.totalMs {
        return $0.count > $1.count
      }
      return $0.totalMs > $1.totalMs
    }
    let contextBuckets = nativeApplyAttributionContextBuckets.values.sorted {
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
      "contextBucketCount": contextBuckets.count,
      "topContextBuckets": contextBuckets.prefix(120).map { $0.dictionary() },
    ]
    if reset {
      nativeApplyAttributionEnabled = false
      nativeApplyAttributionStartedAtMs = nil
      nativeApplyAttributionBuckets.removeAll(keepingCapacity: true)
      nativeApplyAttributionContextBuckets.removeAll(keepingCapacity: true)
      nativeApplyAttributionCurrentContext = nil
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
      self.nativeApplyAttributionContextBuckets.removeAll(keepingCapacity: true)
      self.nativeApplyAttributionCurrentContext = nil
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
    state.residentSourceFrameKey = nil
    state.residentSourceDataKey = nil
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
        let labelSourceId = payload["labelSourceId"] as? String,
        let labelCollisionSourceId = payload["labelCollisionSourceId"] as? String
      else {
        reject("search_map_render_controller_attach_invalid", "invalid attach payload", nil)
        return
      }
      let labelLayerIds = Self.parseStringArray(payload["labelLayerIds"])
      let labelCollisionLayerIds = Self.parseStringArray(payload["labelCollisionLayerIds"])
      guard
        !labelLayerIds.isEmpty,
        !labelCollisionLayerIds.isEmpty
      else {
        reject(
          "search_map_render_controller_attach_invalid",
          "missing label source/layer ids",
          nil
        )
        return
      }
      self.instances[instanceId] = InstanceState(
        mapTag: mapTag,
        pinSourceId: pinSourceId,
        pinInteractionSourceId: pinInteractionSourceId,
        dotSourceId: dotSourceId,
        labelSourceId: labelSourceId,
        labelCollisionSourceId: labelCollisionSourceId,
        labelLayerIds: labelLayerIds,
        labelCollisionLayerIds: labelCollisionLayerIds,
        lastPinVisualGroupOrderSlots: [],
        lastPinVisualGroupOrderSignature: nil,
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
        visualSourceLifecycleState: .hidden,
        labelCollisionObstacleLayersVisible: false,
        lastPresentationStateJSON: nil,
        activeFrameGenerationId: nil,
        activeExecutionBatchId: nil,
        sourceReadyFrameGenerationId: nil,
        sourceReadyExecutionBatchId: nil,
        residentSourceFrameKey: nil,
        residentSourceDataKey: nil,
        highlightedMarkerKey: nil,
        highlightedMarkerKeys: [],
        highlightedRestaurantId: nil,
        interactionMode: "enabled",
        nativePressTargetConfig: NativePressTargetConfig(),
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
          labelSourceId: labelSourceId,
          labelCollisionSourceId: labelCollisionSourceId
        ),
        markerRoleTable: MarkerRoleTable(),
        isAwaitingSourceRecovery: false,
        isReplayingSourceRecovery: false,
        sourceRecoveryPausedAtMs: nil,
        candidateCatalog: [],
        lastVisibleMarkerSetSignature: nil
      )
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
      self?.revealStartDeadlockFallbackWorkItems[instanceId]?.cancel()
      self?.revealStartDeadlockFallbackWorkItems[instanceId] = nil
      self?.revealStartDeadlockReattemptCountByInstance[instanceId] = nil
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

  // Stage B (B1): JS pushes the full ranked candidate catalog once per results
  // change. Native stores it and projects it to screen space on each camera tick
  // (see handleNativeCameraChanged) to compute the on-screen marker set. Benign
  // data — no owner-epoch fence needed; a stale catalog just gets replaced.
  @objc
  func setCandidateCatalog(
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
        reject("search_map_render_controller_catalog_invalid", "missing instanceId", nil)
        return
      }
      guard var state = self.instances[instanceId] else {
        reject("search_map_render_controller_catalog_invalid", "unknown instance", nil)
        return
      }
      let rawEntries = (payload["entries"] as? [NSDictionary]) ?? []
      var catalog: [CandidateCatalogEntry] = []
      catalog.reserveCapacity(rawEntries.count)
      for raw in rawEntries {
        guard let markerKey = raw["markerKey"] as? String,
              let lng = (raw["lng"] as? NSNumber)?.doubleValue,
              let lat = (raw["lat"] as? NSNumber)?.doubleValue,
              lng.isFinite, lat.isFinite
        else {
          continue
        }
        let rank = (raw["rank"] as? NSNumber)?.intValue ?? Int.max
        catalog.append(CandidateCatalogEntry(
          markerKey: markerKey,
          coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lng),
          rank: rank
        ))
      }
      state.candidateCatalog = catalog
      // Force the next camera tick to re-emit the on-screen set against the new catalog.
      state.lastVisibleMarkerSetSignature = nil
      self.instances[instanceId] = state
      resolve(["catalogCount": catalog.count])
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
      guard let frameSourceRevisions = Self.parseRenderSourceRevisions(payload["sourceRevisions"]) else {
        reject("search_map_render_controller_frame_invalid", "invalid render frame payload: missing sourceRevisions", nil)
        return
      }

      let sourceDeltas = payload["sourceDeltas"] as? [[String: Any]]
      let markerRoleFrame = payload["markerRoleFrame"] as? [String: Any]
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
          let visualFrameTransaction = try Self.parseVisualFrameTransaction(from: payload)
          let hasSourcePayload = !(sourceDeltas?.isEmpty ?? true) || markerRoleFrame != nil
          let sourceFrameIsReady =
            visualFrameTransaction.sourceSnapshotKind == "ready" ||
            visualFrameTransaction.sourceSnapshotKind == "empty"
          let shouldApplySourcePayload =
            hasSourcePayload &&
            sourceFrameIsReady &&
            visualFrameTransaction.kind != "dismiss" &&
            visualFrameTransaction.kind != "clear_hidden"
          let previousAttributionContext = self.nativeApplyAttributionCurrentContext
          self.nativeApplyAttributionCurrentContext = self.nativeApplyFrameContext(
            visualFrameTransaction: visualFrameTransaction,
            sourceDeltas: sourceDeltas,
            markerRoleFrame: markerRoleFrame,
            hasSourcePayload: hasSourcePayload,
            shouldApplySourcePayload: shouldApplySourcePayload,
            state: attachedState
          )
          defer {
            self.nativeApplyAttributionCurrentContext = previousAttributionContext
          }
          let didSyncResidentFrame: Bool
          let sourceAdmissionOutcome: String
          func markFrameSourceAdmission(sourceReady: Bool) throws {
            guard var state = self.instances[instanceId] else {
              throw NSError(
                domain: "SearchMapRenderController",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "unknown instance"]
              )
            }
            state.activeFrameGenerationId = frameGenerationId
            state.activeExecutionBatchId = executionBatchId
            if sourceReady {
              state.sourceReadyFrameGenerationId = frameGenerationId
              state.sourceReadyExecutionBatchId = executionBatchId
              state.residentSourceFrameKey = visualFrameTransaction.sourceFrameKey
              state.residentSourceDataKey = visualFrameTransaction.sourceDataKey
            } else {
              state.sourceReadyFrameGenerationId = nil
              state.sourceReadyExecutionBatchId = nil
            }
            self.instances[instanceId] = state
          }
          func applyPresentation() throws {
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
          }
          func applySnapshot() throws -> VisualFrameSnapshotApplyResult {
            let snapshotStartedAt = CACurrentMediaTime() * 1000
            let result = try self.applyRenderFrameSnapshotPayload(
              instanceId: instanceId,
              generationId: frameGenerationId,
              executionBatchId: executionBatchId,
              visualFrameTransaction: visualFrameTransaction,
              sourceDeltas: shouldApplySourcePayload ? sourceDeltas : nil,
              markerRoleFrame: shouldApplySourcePayload ? markerRoleFrame : nil
            )
            attributionPhase = self.instances[instanceId]?.lastPresentationBatchPhase ?? attributionPhase
            self.recordNativeApply(
              section: "set_frame.apply_snapshot",
              phase: attributionPhase,
              durationMs: CACurrentMediaTime() * 1000 - snapshotStartedAt,
              operationCount: shouldApplySourcePayload ? (sourceDeltas?.count ?? 0) : 0
            )
            return result
          }
          switch visualFrameTransaction.kind {
          case "dismiss":
            try markFrameSourceAdmission(sourceReady: true)
            try applyPresentation()
            didSyncResidentFrame = true
            sourceAdmissionOutcome = hasSourcePayload ? "source_apply_blocked_dismissing" : "presentation_only_dismiss"
          case "clear_hidden":
            try markFrameSourceAdmission(sourceReady: true)
            try applyPresentation()
            if var state = self.instances[instanceId],
               state.visualSourceLifecycleState == .hidden,
               state.currentPresentationRenderPhase == "idle",
               state.keepSourcesHiddenUntilEnter {
              try self.clearHiddenResidentSourceState(
                instanceId: instanceId,
                state: &state,
                reason: "clear_hidden_transaction"
              )
              self.instances[instanceId] = state
            }
            didSyncResidentFrame = true
            sourceAdmissionOutcome = hasSourcePayload ? "sources_cleared_hidden" : "presentation_only_clear_hidden"
          case "enter":
            try markFrameSourceAdmission(sourceReady: false)
            try applyPresentation()
            if sourceFrameIsReady && shouldApplySourcePayload {
              // Real new/changed source data → apply the delta. applySnapshot sets source
              // readiness SYNCHRONOUSLY (applyRenderFrameSnapshotPayload assigns
              // sourceReadyFrameGenerationId = generationId). Readiness is NOT gated on any async
              // paint callback — the JS `notifyFrameRendered` bridge method is a dead no-op.
              let result = try applySnapshot()
              didSyncResidentFrame = result.didSyncResidentFrame
              sourceAdmissionOutcome = result.sourceAdmissionOutcome
            } else if sourceFrameIsReady {
              // RESIDENT + UNCHANGED re-reveal (resident-data end state): Mapbox already holds the
              // painted resident frame, so skip the snapshot reconcile entirely — that avoids
              // rebuilding ~3000 feature payloads on every re-reveal (the intermittent 56-75ms
              // reveal cost). Because applySnapshot (which would set readiness synchronously) is
              // skipped, set readiness directly here: markFrameSourceAdmission(sourceReady:true)
              // assigns sourceReadyFrameGenerationId == activeFrameGenerationId so
              // startEnterPresentationIfReady's isActiveFrameSourceReady gate passes. (Readiness is
              // synchronous — there is no paint handshake to wait on.) Label placement readiness
              // still comes from the preparing-enter observation, and live transitions were
              // cancelled at dismiss, so there is nothing to step here.
              try markFrameSourceAdmission(sourceReady: true)
              didSyncResidentFrame = true
              sourceAdmissionOutcome = "sources_reused_resident"
            } else {
              didSyncResidentFrame = true
              sourceAdmissionOutcome = "source_pending"
            }
          case "hidden_preload", "bootstrap", "live_update":
            if sourceFrameIsReady {
              try applyPresentation()
              let result = try applySnapshot()
              didSyncResidentFrame = result.didSyncResidentFrame
              sourceAdmissionOutcome = result.sourceAdmissionOutcome
            } else {
              try markFrameSourceAdmission(sourceReady: false)
              try applyPresentation()
              didSyncResidentFrame = true
              sourceAdmissionOutcome = "source_pending"
            }
          default:
            throw NSError(
              domain: "SearchMapRenderController",
              code: 1,
              userInfo: [NSLocalizedDescriptionKey: "unsupported visual frame transaction kind: \(visualFrameTransaction.kind)"]
            )
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
        // Pin z-order is now native (single-symbol pin layer, symbol-z-order:
        // 'viewport-y') — no per-slot moveLayer pass needed.
        if didSyncResidentFrame, var state = self.instances[instanceId] {
          let emitStartedAt = CACurrentMediaTime() * 1000
          let mountedSourceRevisions = self.currentMountedSourceRevisions(state: state)
          let sourceRevisions =
            Self.doesSourceAdmissionPublishResidentSnapshot(sourceAdmissionOutcome)
              ? frameSourceRevisions
              : mountedSourceRevisions
          self.emit([
            "type": "render_frame_synced",
            "instanceId": instanceId,
            "frameGenerationId": frameGenerationId,
            "executionBatchId": executionBatchId,
            "ownerEpoch": state.ownerEpoch,
            "pinCount": state.lastPinCount,
            "dotCount": state.lastDotCount,
            "labelCount": state.lastLabelCount,
            "sourceAdmissionOutcome": sourceAdmissionOutcome,
            "sourceFrameKey": visualFrameTransaction.sourceFrameKey,
            "sourceDataKey": visualFrameTransaction.sourceDataKey,
            "sourceRevisions": sourceRevisions,
            "nativeSourceRevisions": mountedSourceRevisions,
          ])
          self.recordNativeApply(
            section: "set_frame.emit_synced",
            phase: state.lastPresentationBatchPhase,
            durationMs: CACurrentMediaTime() * 1000 - emitStartedAt
          )
          if let sourceDeltas,
             !sourceDeltas.isEmpty,
             state.visualSourceLifecycleState == .hidden,
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
          if var readyState = self.instances[instanceId] {
            self.startEnterPresentationIfReady(instanceId: instanceId, state: &readyState)
          }
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
        // Per-frame timing payload is only consumed by the perf-attribution-gated
        // `native_set_render_frame_bridge_slice` diagnostic (JS side). When attribution is
        // OFF (production default) the JS logger early-returns, so assembling/bridging the
        // pure-timing fields every frame is wasted work. `nativeApplyAttributionEnabled` is
        // the same native scenario signal (set true by resetNativeApplyAttribution, cleared
        // by flushNativeApplyAttributionSummary) the bridge slice depends on — gate on it.
        // `nativeSetFramePhase` / `nativeDidSyncResidentFrame` are semantic frame outcome
        // fields (not pure timing) and are always returned. The TS layer already treats the
        // gated timing fields as optional, so their absence is benign when attribution is off.
        var resolveResult: [String: Any] = [
          "nativeSetFramePhase": syncedFramePhase,
          "nativeDidSyncResidentFrame": didSyncResidentFrame,
        ]
        if self.nativeApplyAttributionEnabled {
          let nativeResolveStartedAtMs = CACurrentMediaTime() * 1000
          let nativeResolveStartedAtEpochMs = Date().timeIntervalSince1970 * 1000
          resolveResult["nativeModuleQueueWaitDurationMs"] =
            Self.round1(nativeMainStartedAtMs - nativeModuleReceivedAtMs)
          resolveResult["nativeMainExecutionDurationMs"] =
            Self.round1(nativeResolveStartedAtMs - nativeMainStartedAtMs)
          resolveResult["nativeSetFrameActionDurationMs"] = Self.round1(actionDurationMs)
          resolveResult["nativeResolveStartedAtMs"] = Self.round1(nativeResolveStartedAtMs)
          resolveResult["nativeModuleReceivedAtEpochMs"] = Self.round1(nativeModuleReceivedAtEpochMs)
          resolveResult["nativeMainStartedAtEpochMs"] = Self.round1(nativeMainStartedAtEpochMs)
          resolveResult["nativeResolveStartedAtEpochMs"] = Self.round1(nativeResolveStartedAtEpochMs)
        }
        resolve(resolveResult)
      } catch {
        reject(
          "search_map_render_controller_frame_apply_failed",
          error.localizedDescription,
          error
        )
      }
    }
  }

  private static func markerRoleFrameStringArray(
    _ payload: [String: Any],
    _ key: String
  ) -> [String] {
    (payload[key] as? [String]) ?? []
  }

  private static func transportFeatureId(from rawFeature: [String: Any]) -> String? {
    guard let id = rawFeature["id"] as? String, !id.isEmpty else {
      return nil
    }
    return id
  }

  private static func roleFrameFeatureRecords(
    row: [String: Any],
    key: String
  ) -> [[String: Any]] {
    if let feature = row[key] as? [String: Any] {
      return [feature]
    }
    if let features = row[key] as? [[String: Any]] {
      return features
    }
    return []
  }

  private static func parsedRoleFrameFeatureRecords(
    row: [String: Any],
    key: String
  ) throws -> [ParsedTransportFeatureRecord] {
    try roleFrameFeatureRecords(row: row, key: key).map(Self.parseTransportFeatureRecord)
  }

  private static func parseMarkerRoleRow(
    _ row: [String: Any]
  ) throws -> ParsedMarkerRoleRow {
    guard let markerKey = row["markerKey"] as? String, !markerKey.isEmpty else {
      throw Self.parsedCollectionContractError("Marker role row missing markerKey")
    }
    guard let role = row["role"] as? String, role == "pin" || role == "dot" else {
      throw Self.parsedCollectionContractError("Marker \(markerKey) has unsupported role \(row["role"] ?? "nil")")
    }
    let rawSlotIndex = row["slotIndex"]
    let slotIndex = rawSlotIndex is NSNull ? nil : numberValue(from: rawSlotIndex).map { Int($0) }
    let pinFeatures = try parsedRoleFrameFeatureRecords(row: row, key: "pinFeature")
    let pinInteractionFeatures = try parsedRoleFrameFeatureRecords(row: row, key: "pinInteractionFeature")
    let dotFeatures = try parsedRoleFrameFeatureRecords(row: row, key: "dotFeature")
    let labelFeatures = try parsedRoleFrameFeatureRecords(row: row, key: "labelFeatures")
    let labelCollisionFeatures = try parsedRoleFrameFeatureRecords(row: row, key: "labelCollisionFeature")
    if role == "pin" {
      guard pinFeatures.count == 1,
            pinInteractionFeatures.count == 1,
            labelFeatures.count == 4,
            labelCollisionFeatures.count == 1
      else {
        throw Self.parsedCollectionContractError("Promoted marker \(markerKey) missing pin/interaction/label/collision role payload")
      }
      return ParsedMarkerRoleRow(
        markerKey: markerKey,
        role: role,
        slotIndex: slotIndex,
        pinFeature: pinFeatures.first,
        pinInteractionFeature: pinInteractionFeatures.first,
        dotFeature: dotFeatures.first,
        labelFeatures: labelFeatures,
        labelCollisionFeature: labelCollisionFeatures.first
      )
    }
    guard dotFeatures.count == 1 else {
      throw Self.parsedCollectionContractError("Demoted marker \(markerKey) missing dot role payload")
    }
    return ParsedMarkerRoleRow(
      markerKey: markerKey,
      role: role,
      slotIndex: nil,
      pinFeature: nil,
      pinInteractionFeature: nil,
      dotFeature: dotFeatures.first,
      labelFeatures: [],
      labelCollisionFeature: nil
    )
  }

  private static func markerRoleFeatureRecord(
    collection: ParsedFeatureCollection,
    featureId: String
  ) -> ParsedTransportFeatureRecord? {
    guard let feature = collection.featureById[featureId] else {
      return nil
    }
    return ParsedTransportFeatureRecord(
      id: featureId,
      feature: feature,
      diffKey: collection.diffKeyById[featureId] ?? featureId,
      featureState: collection.featureStateById[featureId] ?? [:],
      markerKey: collection.markerKeyByFeatureId[featureId] ?? featureId
    )
  }

  private static func markerRoleTableFromDerivedCollections(
    state: InstanceState
  ) -> MarkerRoleTable {
    let pins = derivedFamilyState(sourceId: state.pinSourceId, state: state).desiredCollection
    let pinInteractions =
      derivedFamilyState(sourceId: state.pinInteractionSourceId, state: state).desiredCollection
    let dots = derivedFamilyState(sourceId: state.dotSourceId, state: state).desiredCollection
    let labels = derivedFamilyState(sourceId: state.labelSourceId, state: state).desiredCollection
    let labelCollisions =
      derivedFamilyState(sourceId: state.labelCollisionSourceId, state: state).desiredCollection
    var labelRecordsByMarkerKey: [String: [ParsedTransportFeatureRecord]] = [:]
    for featureId in labels.idsInOrder {
      guard let record = markerRoleFeatureRecord(collection: labels, featureId: featureId) else {
        continue
      }
      labelRecordsByMarkerKey[record.markerKey, default: []].append(record)
    }
    let visibleDotMarkerKeys = dots.idsInOrder.filter { markerKey in
      let explicitOpacity =
        Self.numberValue(from: dots.featureStateById[markerKey]?["nativeDotOpacity"]) ??
        Self.numberValue(
          from: (dots.featureById[markerKey]?.properties?.turfRawValue as? [String: Any])?["nativeDotOpacity"]
        )
      return (explicitOpacity ?? 1) > 0.001
    }
    // RESIDENT LOD: pins are now resident for every candidate (demoted at opacity 0), so
    // the PINNED role is opacity-driven (mirrors the dot filter above) — NOT raw pin-source
    // membership. A pin with nativeLodOpacity > 0 is promoted; 0 is a resident-invisible pin
    // ready to fade in. residentPinMarkerKeys (all pin-source members) is the membership.
    let promotedPinMarkerKeys = pins.idsInOrder.filter { markerKey in
      let explicitOpacity =
        Self.numberValue(from: pins.featureStateById[markerKey]?["nativeLodOpacity"]) ??
        Self.numberValue(
          from: (pins.featureById[markerKey]?.properties?.turfRawValue as? [String: Any])?["nativeLodOpacity"]
        )
      return (explicitOpacity ?? 1) > 0.001
    }
    var table = MarkerRoleTable(
      pinnedMarkerKeysInOrder: promotedPinMarkerKeys,
      dotMarkerKeysInOrder: visibleDotMarkerKeys,
      residentDotMarkerKeysInOrder: dots.idsInOrder,
      rowByMarkerKey: [:]
    )
    // RESIDENT LOD: every marker is in BOTH sources, so a row carries BOTH its pin and dot
    // feature; the `role` is OPACITY-driven (promoted → "pin", demoted → "dot"), NOT
    // "pin-wins-if-present". The dots loop attaches dotFeature to whatever row the pins loop
    // built (any role), so resident markers keep both features.
    let promotedPinMarkerKeySet = Set(promotedPinMarkerKeys)
    for markerKey in pins.idsInOrder {
      guard let pinFeature = markerRoleFeatureRecord(collection: pins, featureId: markerKey) else {
        continue
      }
      let pinInteractionFeature =
        markerRoleFeatureRecord(collection: pinInteractions, featureId: markerKey)
      let labelCollisionFeature =
        markerRoleFeatureRecord(collection: labelCollisions, featureId: markerKey)
      table.rowByMarkerKey[markerKey] = ParsedMarkerRoleRow(
        markerKey: markerKey,
        role: promotedPinMarkerKeySet.contains(markerKey) ? "pin" : "dot",
        slotIndex: Self.slotIndex(from: pinFeature.feature),
        pinFeature: pinFeature,
        pinInteractionFeature: pinInteractionFeature,
        dotFeature: nil,
        labelFeatures: labelRecordsByMarkerKey[markerKey] ?? [],
        labelCollisionFeature: labelCollisionFeature
      )
    }
    for markerKey in dots.idsInOrder {
      guard let dotFeature = markerRoleFeatureRecord(collection: dots, featureId: markerKey) else {
        continue
      }
      if var existingRow = table.rowByMarkerKey[markerKey] {
        existingRow.dotFeature = dotFeature
        table.rowByMarkerKey[markerKey] = existingRow
        continue
      }
      table.rowByMarkerKey[markerKey] = ParsedMarkerRoleRow(
        markerKey: markerKey,
        role: "dot",
        slotIndex: nil,
        pinFeature: nil,
        pinInteractionFeature: nil,
        dotFeature: dotFeature,
        labelFeatures: [],
        labelCollisionFeature: nil
      )
    }
    return table
  }

  private static func existingFeatureIdsForMarker(
    markerKey: String,
    sourceId: String,
    state: InstanceState
  ) -> [String] {
    let familyState = derivedFamilyState(sourceId: sourceId, state: state)
    return familyState.desiredCollection.groupedFeatureIdsByGroup[markerKey] ??
      familyState.collection.groupedFeatureIdsByGroup[markerKey] ??
      []
  }

  private static func applyMarkerRoleFamilyDelta(
    sourceId: String,
    nextFeatureIdsInOrder: [String],
    dirtyGroupIds: Set<String>,
    removedGroupIds: Set<String>,
    rawUpsertFeatures: [[String: Any]],
    state: inout InstanceState
  ) throws {
    var familyState = derivedFamilyState(sourceId: sourceId, state: state)
    let previousCollection = familyState.desiredCollection
    let previousSourceState = familyState.sourceState
    let upsertCollection = rawUpsertFeatures.isEmpty
      ? nil
      : try Self.parseTransportFeatureRecords(rawUpsertFeatures)
    var nextMarkerKeyByFeatureId = previousCollection.markerKeyByFeatureId
    if let upsertCollection {
      nextMarkerKeyByFeatureId.merge(upsertCollection.markerKeyByFeatureId) { _, next in next }
    }
    let (nextGroupedFeatureIdsByGroup, nextGroupOrder) = Self.buildGroupedFeatureIdsByGroup(
      idsInOrder: nextFeatureIdsInOrder,
      markerKeyByFeatureId: nextMarkerKeyByFeatureId
    )
    let previousGroupIds = Set(previousCollection.groupOrder)
    let nextGroupIds = Set(nextGroupOrder)
    let effectiveRemovedGroupIds = removedGroupIds.union(previousGroupIds.subtracting(nextGroupIds))
    let effectiveDirtyGroupIds = dirtyGroupIds.union(effectiveRemovedGroupIds)
    let effectiveOrderChangedGroupIds =
      previousCollection.groupOrder == nextGroupOrder
        ? effectiveDirtyGroupIds
        : effectiveDirtyGroupIds.union(previousGroupIds.symmetricDifference(nextGroupIds))

    var desiredFeatureIdsByGroup: [String: [String]] = [:]
    var dirtyFeatureById: [String: Feature] = [:]
    var dirtyFeatureStateById: [String: [String: Any]] = [:]
    var dirtyMarkerKeyByFeatureId: [String: String] = [:]
    let dirtyGroupsWithPayloads = effectiveDirtyGroupIds.subtracting(effectiveRemovedGroupIds)

    for groupId in dirtyGroupsWithPayloads {
      guard let featureIds = nextGroupedFeatureIdsByGroup[groupId] else {
        continue
      }
      desiredFeatureIdsByGroup[groupId] = featureIds
      for featureId in featureIds {
        guard let feature =
          upsertCollection?.featureById[featureId] ??
            previousCollection.featureById[featureId]
        else {
          throw Self.parsedCollectionContractError(
            "Marker role patch missing feature \(featureId) for \(sourceId)"
          )
        }
        dirtyFeatureById[featureId] = feature
        if let featureState =
          upsertCollection?.featureStateById[featureId] ??
            previousCollection.featureStateById[featureId]
        {
          dirtyFeatureStateById[featureId] = featureState
        }
        dirtyMarkerKeyByFeatureId[featureId] =
          upsertCollection?.markerKeyByFeatureId[featureId] ??
            previousCollection.markerKeyByFeatureId[featureId] ??
            groupId
      }
    }

    try Self.patchParsedFeatureCollection(
      &familyState.desiredCollection,
      baseSourceState: previousSourceState,
      desiredGroupOrder: nextGroupOrder,
      desiredFeatureIdsByGroup: desiredFeatureIdsByGroup,
      featureById: dirtyFeatureById,
      featureStateById: dirtyFeatureStateById,
      markerKeyByFeatureId: dirtyMarkerKeyByFeatureId,
      dirtyGroupIds: effectiveDirtyGroupIds,
      orderChangedGroupIds: effectiveOrderChangedGroupIds,
      removedGroupIds: effectiveRemovedGroupIds,
      useCurrentCollectionBase: false
    )
    Self.setDerivedFamilyState(familyState, sourceId: sourceId, state: &state)
  }

  private func applyMarkerRoleTableFrame(
    _ payload: [String: Any],
    state: inout InstanceState
  ) throws -> Set<String> {
    let nextPinnedMarkerKeys = try Self.requireUniqueOrderedFeatureIds(
      Self.markerRoleFrameStringArray(payload, "nextPinnedMarkerKeysInOrder"),
      context: "marker role frame nextPinnedMarkerKeysInOrder"
    )
    let nextDotMarkerKeys = try Self.requireUniqueOrderedFeatureIds(
      Self.markerRoleFrameStringArray(payload, "nextDotMarkerKeysInOrder"),
      context: "marker role frame nextDotMarkerKeysInOrder"
    )
    let residentDotMarkerKeys = try Self.requireUniqueOrderedFeatureIds(
      Self.markerRoleFrameStringArray(payload, "residentDotMarkerKeysInOrder"),
      context: "marker role frame residentDotMarkerKeysInOrder"
    )
    let dirtyMarkerKeys = try Self.requireUniqueStringSet(
      Self.markerRoleFrameStringArray(payload, "dirtyMarkerKeys"),
      context: "marker role frame dirtyMarkerKeys"
    )
    let removedMarkerKeys = try Self.requireUniqueStringSet(
      Self.markerRoleFrameStringArray(payload, "removedMarkerKeys"),
      context: "marker role frame removedMarkerKeys"
    )
    let pinnedMarkerKeySet = Set(nextPinnedMarkerKeys)
    let dotMarkerKeySet = Set(nextDotMarkerKeys)
    guard pinnedMarkerKeySet.isDisjoint(with: dotMarkerKeySet) else {
      throw Self.parsedCollectionContractError("Marker role frame has settled dot/pin overlap")
    }
    let rawRows = payload["upsertRoles"] as? [[String: Any]] ?? []
    var parsedRowsByMarkerKey: [String: ParsedMarkerRoleRow] = [:]
    for rawRow in rawRows {
      let row = try Self.parseMarkerRoleRow(rawRow)
      guard parsedRowsByMarkerKey[row.markerKey] == nil else {
        throw Self.parsedCollectionContractError("Duplicate marker role row \(row.markerKey)")
      }
      parsedRowsByMarkerKey[row.markerKey] = row
    }

    let mode = (payload["mode"] as? String) ?? "patch"
    var table = mode == "replace" ? MarkerRoleTable() : state.markerRoleTable
    if table.rowByMarkerKey.isEmpty && mode != "replace" {
      table = Self.markerRoleTableFromDerivedCollections(state: state)
    }
    table.pinnedMarkerKeysInOrder = nextPinnedMarkerKeys
    table.dotMarkerKeysInOrder = nextDotMarkerKeys
    table.residentDotMarkerKeysInOrder = residentDotMarkerKeys

    for markerKey in removedMarkerKeys {
      table.rowByMarkerKey.removeValue(forKey: markerKey)
    }
    for markerKey in dirtyMarkerKeys {
      if let row = parsedRowsByMarkerKey[markerKey] {
        table.rowByMarkerKey[markerKey] = row
      } else if removedMarkerKeys.contains(markerKey) {
        table.rowByMarkerKey.removeValue(forKey: markerKey)
      } else {
        throw Self.parsedCollectionContractError("Dirty marker role \(markerKey) missing row")
      }
    }

    for markerKey in nextPinnedMarkerKeys {
      guard let row = table.rowByMarkerKey[markerKey], row.role == "pin" else {
        throw Self.parsedCollectionContractError("Pinned marker \(markerKey) missing native role row")
      }
      guard row.pinFeature != nil,
            row.pinInteractionFeature != nil,
            row.labelFeatures.count == 4,
            row.labelCollisionFeature != nil else {
        throw Self.parsedCollectionContractError("Pinned marker \(markerKey) has incomplete native role row")
      }
    }
    for markerKey in nextDotMarkerKeys {
      guard let row = table.rowByMarkerKey[markerKey], row.role == "dot" else {
        throw Self.parsedCollectionContractError("Dot marker \(markerKey) missing native role row")
      }
      guard row.dotFeature != nil else {
        throw Self.parsedCollectionContractError("Dot marker \(markerKey) has incomplete native role row")
      }
    }
    for markerKey in residentDotMarkerKeys {
      guard let row = table.rowByMarkerKey[markerKey], row.dotFeature != nil else {
        throw Self.parsedCollectionContractError("Resident dot marker \(markerKey) missing dot payload")
      }
    }

    state.markerRoleTable = table
    return dirtyMarkerKeys.union(removedMarkerKeys)
  }

  private func applyMarkerRoleFrame(
    _ payload: [String: Any],
    state: inout InstanceState
  ) throws {
    let nextPinnedMarkerKeys = try Self.requireUniqueOrderedFeatureIds(
      Self.markerRoleFrameStringArray(payload, "nextPinnedMarkerKeysInOrder"),
      context: "marker role frame nextPinnedMarkerKeysInOrder"
    )
    let nextDotMarkerKeys = try Self.requireUniqueOrderedFeatureIds(
      Self.markerRoleFrameStringArray(payload, "nextDotMarkerKeysInOrder"),
      context: "marker role frame nextDotMarkerKeysInOrder"
    )
    let residentDotMarkerKeys = try Self.requireUniqueOrderedFeatureIds(
      Self.markerRoleFrameStringArray(payload, "residentDotMarkerKeysInOrder"),
      context: "marker role frame residentDotMarkerKeysInOrder"
    )
    let dirtyMarkerKeys = try Self.requireUniqueStringSet(
      Self.markerRoleFrameStringArray(payload, "dirtyMarkerKeys"),
      context: "marker role frame dirtyMarkerKeys"
    )
    let removedMarkerKeys = try Self.requireUniqueStringSet(
      Self.markerRoleFrameStringArray(payload, "removedMarkerKeys"),
      context: "marker role frame removedMarkerKeys"
    )
    let rawRows = payload["upsertRoles"] as? [[String: Any]] ?? []
    var rowsByMarkerKey: [String: [String: Any]] = [:]
    for row in rawRows {
      guard let markerKey = row["markerKey"] as? String, !markerKey.isEmpty else {
        throw Self.parsedCollectionContractError("Marker role row missing markerKey")
      }
      guard rowsByMarkerKey[markerKey] == nil else {
        throw Self.parsedCollectionContractError("Duplicate marker role row \(markerKey)")
      }
      rowsByMarkerKey[markerKey] = row
    }

    let nextPinnedMarkerKeySet = Set(nextPinnedMarkerKeys)
    let nextDotMarkerKeySet = Set(nextDotMarkerKeys)
    guard nextPinnedMarkerKeySet.isDisjoint(with: nextDotMarkerKeySet) else {
      throw Self.parsedCollectionContractError("Marker role frame has settled dot/pin overlap")
    }

    var pinUpserts: [[String: Any]] = []
    var pinInteractionUpserts: [[String: Any]] = []
    var labelUpserts: [[String: Any]] = []
    var labelCollisionUpserts: [[String: Any]] = []
    var dotUpserts: [[String: Any]] = []

    for markerKey in dirtyMarkerKeys {
      guard let row = rowsByMarkerKey[markerKey] else {
        if removedMarkerKeys.contains(markerKey) {
          continue
        }
        throw Self.parsedCollectionContractError("Dirty marker role \(markerKey) missing row")
      }
      let role = row["role"] as? String
      if role == "pin" {
        let pinFeatures = Self.roleFrameFeatureRecords(row: row, key: "pinFeature")
        let pinInteractionFeatures = Self.roleFrameFeatureRecords(row: row, key: "pinInteractionFeature")
        let dotFeatures = Self.roleFrameFeatureRecords(row: row, key: "dotFeature")
        let labelFeatures = Self.roleFrameFeatureRecords(row: row, key: "labelFeatures")
        let labelCollisionFeatures = Self.roleFrameFeatureRecords(row: row, key: "labelCollisionFeature")
        guard nextPinnedMarkerKeySet.contains(markerKey),
              pinFeatures.count == 1,
              pinInteractionFeatures.count == 1,
              labelFeatures.count == 4,
              labelCollisionFeatures.count == 1
        else {
          throw Self.parsedCollectionContractError("Promoted marker \(markerKey) missing pin/interaction/label/collision role payload")
        }
        pinUpserts.append(contentsOf: pinFeatures)
        pinInteractionUpserts.append(contentsOf: pinInteractionFeatures)
        dotUpserts.append(contentsOf: dotFeatures)
        labelUpserts.append(contentsOf: labelFeatures)
        labelCollisionUpserts.append(contentsOf: labelCollisionFeatures)
      } else if role == "dot" {
        let dotFeatures = Self.roleFrameFeatureRecords(row: row, key: "dotFeature")
        guard nextDotMarkerKeySet.contains(markerKey), dotFeatures.count == 1 else {
          throw Self.parsedCollectionContractError("Demoted marker \(markerKey) missing dot role payload")
        }
        dotUpserts.append(contentsOf: dotFeatures)
      } else {
        throw Self.parsedCollectionContractError("Marker \(markerKey) has unsupported role \(role ?? "nil")")
      }
    }

    let nextLabelFeatureIdsInOrder = nextPinnedMarkerKeys.flatMap { markerKey -> [String] in
      if let row = rowsByMarkerKey[markerKey] {
        let ids = Self.roleFrameFeatureRecords(row: row, key: "labelFeatures").compactMap(Self.transportFeatureId)
        if !ids.isEmpty {
          return ids
        }
      }
      return Self.existingFeatureIdsForMarker(
        markerKey: markerKey,
        sourceId: state.labelSourceId,
        state: state
      )
    }
    let nextLabelCollisionFeatureIdsInOrder = nextPinnedMarkerKeys.map { markerKey in
      if let row = rowsByMarkerKey[markerKey],
         let id = Self.roleFrameFeatureRecords(row: row, key: "labelCollisionFeature").first.flatMap(Self.transportFeatureId) {
        return id
      }
      return markerKey
    }

    let dirtyAndRemovedMarkerKeys = dirtyMarkerKeys.union(removedMarkerKeys)
    try Self.applyMarkerRoleFamilyDelta(
      sourceId: state.pinSourceId,
      nextFeatureIdsInOrder: nextPinnedMarkerKeys,
      dirtyGroupIds: dirtyAndRemovedMarkerKeys,
      removedGroupIds: removedMarkerKeys,
      rawUpsertFeatures: pinUpserts,
      state: &state
    )
    try Self.applyMarkerRoleFamilyDelta(
      sourceId: state.pinInteractionSourceId,
      nextFeatureIdsInOrder: nextPinnedMarkerKeys,
      dirtyGroupIds: dirtyAndRemovedMarkerKeys,
      removedGroupIds: removedMarkerKeys,
      rawUpsertFeatures: pinInteractionUpserts,
      state: &state
    )
    try Self.applyMarkerRoleFamilyDelta(
      sourceId: state.dotSourceId,
      nextFeatureIdsInOrder: residentDotMarkerKeys.isEmpty ? nextDotMarkerKeys : residentDotMarkerKeys,
      dirtyGroupIds: dirtyAndRemovedMarkerKeys,
      removedGroupIds: removedMarkerKeys,
      rawUpsertFeatures: dotUpserts,
      state: &state
    )
    try Self.applyMarkerRoleFamilyDelta(
      sourceId: state.labelSourceId,
      nextFeatureIdsInOrder: nextLabelFeatureIdsInOrder,
      dirtyGroupIds: dirtyAndRemovedMarkerKeys,
      removedGroupIds: removedMarkerKeys,
      rawUpsertFeatures: labelUpserts,
      state: &state
    )
    try Self.applyMarkerRoleFamilyDelta(
      sourceId: state.labelCollisionSourceId,
      nextFeatureIdsInOrder: nextLabelCollisionFeatureIdsInOrder,
      dirtyGroupIds: dirtyAndRemovedMarkerKeys,
      removedGroupIds: removedMarkerKeys,
      rawUpsertFeatures: labelCollisionUpserts,
      state: &state
    )
  }

    private func applyRenderFrameSnapshotPayload(
      instanceId: String,
      generationId: String,
      executionBatchId: String,
      visualFrameTransaction: VisualFrameTransaction,
      sourceDeltas: [[String: Any]]?,
      markerRoleFrame: [String: Any]?
    ) throws -> VisualFrameSnapshotApplyResult {
    guard var state = self.instances[instanceId] else {
      throw NSError(
        domain: "SearchMapRenderController",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "unknown instance"]
      )
    }
    let actionStartedAt = CACurrentMediaTime() * 1000
    if Self.isVisualSourceDismissing(state) {
      state.activeFrameGenerationId = generationId
      state.activeExecutionBatchId = executionBatchId
      state.sourceReadyFrameGenerationId = generationId
      state.sourceReadyExecutionBatchId = executionBatchId
      self.instances[instanceId] = state
      self.recordNativeApply(
        section: "snapshot.dismiss_in_progress_bypass",
        phase: state.lastPresentationBatchPhase,
        durationMs: CACurrentMediaTime() * 1000 - actionStartedAt,
        operationCount: sourceDeltas?.count ?? 0
      )
      return VisualFrameSnapshotApplyResult(
        didSyncResidentFrame: true,
        sourceAdmissionOutcome: "source_apply_blocked_dismissing"
      )
    }
    self.emitVisualDiag(
      instanceId: instanceId,
      message:
        "frame_begin phase=\(state.lastPresentationBatchPhase) opacity=\(state.currentPresentationOpacityTarget) revealRequest=\(state.lastEnterRequestKey ?? "nil") revealStarted=\(state.lastEnterStartedRequestKey ?? "nil") revealSettled=\(state.lastEnterSettledRequestKey ?? "nil") dismissRequest=\(state.lastDismissRequestKey ?? "nil")"
    )
    let isLiveMarkerRoleOnlyFrame =
      markerRoleFrame != nil &&
      (sourceDeltas?.isEmpty ?? true) &&
      visualFrameTransaction.kind == "live_update" &&
      visualFrameTransaction.presentationPhase == "live"

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
        let mountedBaseCollection = Self.parsedCollectionBase(from: familyState.sourceState)
        familyState.desiredCollection = try Self.applyParsedCollectionDelta(
          delta,
          to: mountedBaseCollection
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
      if !parsedDeltas.isEmpty {
        state.markerRoleTable = Self.markerRoleTableFromDerivedCollections(state: state)
      }
    }
    var liveMarkerRoleAffectedKeys = Set<String>()
    if let markerRoleFrame {
      let roleStartedAt = CACurrentMediaTime() * 1000
      if isLiveMarkerRoleOnlyFrame {
        liveMarkerRoleAffectedKeys = try self.applyMarkerRoleTableFrame(markerRoleFrame, state: &state)
      } else {
        try self.applyMarkerRoleFrame(markerRoleFrame, state: &state)
        state.markerRoleTable = Self.markerRoleTableFromDerivedCollections(state: state)
      }
      self.recordNativeApply(
        section: "snapshot.apply_marker_role_frame",
        phase: state.lastPresentationBatchPhase,
        durationMs: CACurrentMediaTime() * 1000 - roleStartedAt,
        operationCount: (markerRoleFrame["dirtyMarkerKeys"] as? [Any])?.count ?? 0
      )
    }
    let sourceAdmissionOutcome: String
    if (sourceDeltas?.isEmpty == false) || markerRoleFrame != nil {
      if visualFrameTransaction.kind == "hidden_preload" {
        sourceAdmissionOutcome = "sources_applied_hidden"
      } else {
        sourceAdmissionOutcome = "sources_applied_visible"
      }
    } else {
      sourceAdmissionOutcome = "sources_reused_resident"
    }
    if isLiveMarkerRoleOnlyFrame {
      state.lastPinCount = state.markerRoleTable.pinnedMarkerKeysInOrder.count
      state.lastDotCount = state.markerRoleTable.dotMarkerKeysInOrder.count
      state.lastLabelCount = Self.labelFeatureCount(roleTable: state.markerRoleTable)
    } else {
      state.lastPinCount =
        Self.derivedFamilyState(sourceId: state.pinSourceId, state: state).desiredCollection.idsInOrder.count
      state.lastDotCount =
        Self.derivedFamilyState(sourceId: state.dotSourceId, state: state).desiredCollection.idsInOrder.count
        state.lastLabelCount =
          Self.derivedFamilyState(sourceId: state.labelSourceId, state: state).desiredCollection.idsInOrder.count
    }
      state.activeFrameGenerationId = generationId
      state.activeExecutionBatchId = executionBatchId
      state.sourceReadyFrameGenerationId = nil
      state.sourceReadyExecutionBatchId = nil
      state.residentSourceFrameKey = visualFrameTransaction.sourceFrameKey
      state.residentSourceDataKey = visualFrameTransaction.sourceDataKey
    self.instances[instanceId] = state
    let reconcileStartedAt = CACurrentMediaTime() * 1000
    if isLiveMarkerRoleOnlyFrame {
      try self.reconcileAndApplyLiveMarkerRoleOutputs(
        for: instanceId,
        affectedMarkerKeys: liveMarkerRoleAffectedKeys,
        allowNewTransitions: true,
        reason: "live_marker_role_frame"
      )
    } else {
      try self.reconcileAndApplyCurrentFrameSnapshots(for: instanceId)
    }
    state = self.instances[instanceId] ?? state
    self.recordNativeApply(
      section: isLiveMarkerRoleOnlyFrame
        ? "snapshot.reconcile_live_marker_role_frame"
        : "snapshot.reconcile_current_frame",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - reconcileStartedAt
    )
    if Self.isSourceRecoveryActive(state) {
      self.emitVisualDiag(
        instanceId: instanceId,
        message: "frame_apply_deferred reason=source_recovery phase=\(state.lastPresentationBatchPhase)"
      )
      self.instances[instanceId] = state
      return VisualFrameSnapshotApplyResult(
        didSyncResidentFrame: false,
        sourceAdmissionOutcome: "source_pending"
      )
    }
    self.emitVisualDiag(
      instanceId: instanceId,
      message:
        "frame_after_reconcile phase=\(state.lastPresentationBatchPhase) opacity=\(state.currentPresentationOpacityTarget) revealRequest=\(state.lastEnterRequestKey ?? "nil") revealStarted=\(state.lastEnterStartedRequestKey ?? "nil") revealSettled=\(state.lastEnterSettledRequestKey ?? "nil") dismissRequest=\(state.lastDismissRequestKey ?? "nil")"
    )
    let highlightedStartedAt = CACurrentMediaTime() * 1000
    if isLiveMarkerRoleOnlyFrame &&
      state.highlightedMarkerKeys.isEmpty &&
      state.highlightedRestaurantId == nil
    {
      self.recordNativeApply(
        section: "snapshot.apply_highlighted_marker_skipped",
        phase: state.lastPresentationBatchPhase,
        durationMs: CACurrentMediaTime() * 1000 - highlightedStartedAt
      )
    } else {
      try self.applyHighlightedMarkerState(for: state, instanceId: instanceId)
      self.recordNativeApply(
        section: "snapshot.apply_highlighted_marker",
        phase: state.lastPresentationBatchPhase,
        durationMs: CACurrentMediaTime() * 1000 - highlightedStartedAt
      )
    }
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
    if isLiveMarkerRoleOnlyFrame &&
      state.lastPresentationBatchPhase == "live" &&
      state.currentPresentationOpacityTarget >= 0.999 &&
      state.currentPresentationOpacityValue >= 0.999
    {
      self.recordNativeApply(
        section: "snapshot.apply_current_presentation_opacity_skipped",
        phase: state.lastPresentationBatchPhase,
        durationMs: CACurrentMediaTime() * 1000 - opacityStartedAt
      )
    } else {
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
    }
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
    return VisualFrameSnapshotApplyResult(
      didSyncResidentFrame: true,
      sourceAdmissionOutcome: sourceAdmissionOutcome
    )
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
    let nextPresentationBatchPhase = Self.readPresentationBatchPhase(fromJSON: presentationStateJSON)
    let revealRequestKey = Self.readEnterRequestKey(fromJSON: presentationStateJSON)
    let dismissRequestKey = Self.readDismissRequestKey(fromJSON: presentationStateJSON)
    let shouldSupersedeDismissWithReveal =
      state.visualSourceLifecycleState == .dismissing &&
      revealRequestKey != nil &&
      dismissRequestKey == nil
    if state.visualSourceLifecycleState == .dismissing &&
      !shouldSupersedeDismissWithReveal &&
      dismissRequestKey == nil
    {
      self.instances[instanceId] = state
      self.recordNativeApply(
        section: "presentation.dismiss_in_progress_bypass",
        phase: state.lastPresentationBatchPhase,
        durationMs: CACurrentMediaTime() * 1000 - actionStartedAt
      )
      return
    }
    state.lastPresentationStateJSON = presentationStateJSON
    state.lastPresentationBatchPhase = nextPresentationBatchPhase
    state.allowEmptyEnter = Self.readAllowEmptyEnter(fromJSON: presentationStateJSON)
    if shouldSupersedeDismissWithReveal,
       state.lastDismissRequestKey != nil {
      self.clearDismissLifecycleRequestForEnter(instanceId: instanceId, state: &state)
    }
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
    startEnterPresentationIfReady(
      instanceId: instanceId,
      state: &state,
      previousPresentationBatchPhase: previousPresentationBatchPhase,
      previousPresentationOpacityTarget: previousPresentationOpacityTarget
    )
    let previousDismissRequestKey = state.lastDismissRequestKey
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
        if state.visualSourceLifecycleState == .hidden {
          state.currentPresentationRenderPhase = "idle"
          state.keepSourcesHiddenUntilEnter = true
          state.currentPresentationOpacityTarget = 0
          state.currentPresentationOpacityValue = 0
          self.instances[instanceId] = state
          self.emitVisualDiag(
            instanceId: instanceId,
            message: "dismiss_clear_already_hidden request=\(previousDismissRequestKey)"
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
      startEnterPresentationIfReady(
        instanceId: instanceId,
        state: &state,
        previousPresentationBatchPhase: previousPresentationBatchPhase,
        previousPresentationOpacityTarget: previousPresentationOpacityTarget
      )
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
    guard !Self.isVisualSourceInactiveOrDismissing(state) else {
      return
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
    guard !Self.isVisualSourceInactiveOrDismissing(state) else {
      return
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
      let commitVisibleLabelHits = (payload["commitVisibleLabelHits"] as? Bool) ?? false
      let labelResetRequestKey = payload["labelResetRequestKey"] as? String
      self.configureLabelObservation(
        instanceId: instanceId,
        observationEnabled: observationEnabled,
        commitVisibleLabelHits: commitVisibleLabelHits,
        refreshMsIdle: (payload["refreshMsIdle"] as? NSNumber)?.doubleValue ?? 0,
        refreshMsMoving: (payload["refreshMsMoving"] as? NSNumber)?.doubleValue ?? 0,
        labelResetRequestKey: labelResetRequestKey
      )
      if observationEnabled {
        self.scheduleLabelObservationRefresh(instanceId: instanceId, delayMs: 0)
      }
      resolve(nil)
    }
  }

  @objc
  func configureNativeLayerGroups(
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
          "search_map_render_controller_configure_native_layer_groups_invalid",
          "missing instanceId",
          nil
        )
        return
      }
      guard var state = self.instances[instanceId] else {
        reject(
          "search_map_render_controller_configure_native_layer_groups_invalid",
          "unknown instance",
          nil
        )
        return
      }
      let labelLayerIds = Self.parseStringArray(payload["labelLayerIds"])
      let labelCollisionLayerIds = Self.parseStringArray(payload["labelCollisionLayerIds"])
      guard
        !labelLayerIds.isEmpty,
        !labelCollisionLayerIds.isEmpty
      else {
        reject(
          "search_map_render_controller_configure_native_layer_groups_invalid",
          "missing label source/layer ids",
          nil
        )
        return
      }
      state.labelLayerIds = labelLayerIds
      state.labelCollisionLayerIds = labelCollisionLayerIds
      state.lastPinVisualGroupOrderSlots = []
      state.lastPinVisualGroupOrderSignature = nil
      self.instances[instanceId] = state
      resolve(nil)
    }
  }

  @objc
  func configureNativePressTargeting(
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
          "search_map_render_controller_configure_native_press_targeting_invalid",
          "missing instanceId",
          nil
        )
        return
      }
      guard var state = self.instances[instanceId] else {
        reject(
          "search_map_render_controller_configure_native_press_targeting_invalid",
          "unknown instance",
          nil
        )
        return
      }
      let enabled = (payload["enabled"] as? Bool) ?? false
      if enabled {
        for candidateId in Array(self.instances.keys) where candidateId != instanceId {
          guard var candidateState = self.instances[candidateId],
                candidateState.mapTag == state.mapTag
          else {
            continue
          }
          candidateState.nativePressTargetConfig.enabled = false
          self.instances[candidateId] = candidateState
        }
      }
      state.nativePressTargetConfig = NativePressTargetConfig(
        enabled: enabled,
        pinLayerIds: Self.parseStringArray(payload["pinLayerIds"]),
        labelLayerIds: Self.parseStringArray(payload["labelLayerIds"]),
        labelTapHitbox: Self.parseLabelTapHitboxConfig(payload["labelTapHitbox"]),
        dotLayerIds: Self.parseStringArray(payload["dotLayerIds"]),
        dotTapIntentRadiusPx: CGFloat(
          (payload["dotTapIntentRadiusPx"] as? NSNumber)?.doubleValue ?? 0
        )
      )
      self.instances[instanceId] = state
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
            state.visualSourceLifecycleState != .hidden
      else {
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
      let pinLayerIds = Self.parseStringArray(payload["pinLayerIds"])
      let labelLayerIds = Self.parseStringArray(payload["labelLayerIds"])
      let labelQueryBoxValues = Self.parseNumberArray(payload["labelQueryBox"])
      let labelTapHitbox = Self.parseLabelTapHitboxConfig(payload["labelTapHitbox"])
      let dotLayerIds = Self.parseStringArray(payload["dotLayerIds"])
      let dotQueryBoxValues = Self.parseNumberArray(payload["dotQueryBox"])
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
          self.resolveRenderedPressTarget(
            instanceId: instanceId,
            state: state,
            handle: handle,
            point: CGPoint(x: x, y: y),
            pinLayerIds: pinLayerIds,
            labelLayerIds: labelLayerIds,
            labelTapHitbox: labelTapHitbox,
            dotLayerIds: dotLayerIds,
            dotQueryRect: Self.rect(from: dotQueryBoxValues, fallback: queryRect),
            labelQueryRect: Self.rect(from: labelQueryBoxValues, fallback: queryRect),
            tapCoordinate: tapCoordinate
          ) { result in
            switch result {
            case .success(let target):
              resolve(target ?? NSNull())
            case .failure(let error):
              reject(
                "search_map_render_controller_query_rendered_press_target_failed",
                error.localizedDescription,
                error
              )
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

  private func resolveRenderedPressTarget(
    instanceId: String,
    state: InstanceState,
    handle: ResolvedMapHandle,
    point: CGPoint,
    pinLayerIds: [String],
    labelLayerIds: [String],
    labelTapHitbox: LabelTapHitboxConfig?,
    dotLayerIds: [String],
    dotQueryRect: CGRect,
    labelQueryRect: CGRect,
    tapCoordinate: (lng: Double, lat: Double)?,
    completion: @escaping (Result<[String: Any]?, Error>) -> Void
  ) {
    let labelSourceIds: Set<String> = [state.pinBundleSourceId]
    let pinInteractionSourceIds: Set<String> = [state.pinBundleSourceId]
    let queryDotTarget = {
      guard !dotLayerIds.isEmpty, dotQueryRect.width > 0, dotQueryRect.height > 0 else {
        completion(.success(nil))
        return
      }
      handle.mapView.mapboxMap.queryRenderedFeatures(
        with: dotQueryRect,
        options: RenderedQueryOptions(layerIds: dotLayerIds, filter: nil)
      ) { dotResult in
        DispatchQueue.main.async {
          switch dotResult {
          case .failure(let error):
            completion(.failure(error))
          case .success(let dotFeatures):
            if let dotTarget = Self.buildRenderedDotPressTarget(
              from: dotFeatures,
              requiredSourceId: state.dotSourceId,
              tapCoordinate: tapCoordinate
            ) {
              completion(.success(dotTarget))
            } else {
              completion(.success(nil))
            }
          }
        }
      }
    }
    let queryLabelTarget = {
      guard !labelLayerIds.isEmpty else {
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
            completion(.failure(error))
          case .success(let labelFeatures):
            if let labelTarget = Self.buildRenderedLabelPressTarget(
              from: labelFeatures,
              requiredSourceIds: labelSourceIds,
              tapPoint: point,
              mapboxMap: handle.mapView.mapboxMap,
              hitbox: labelTapHitbox
            ) {
              completion(.success(labelTarget))
            } else {
              queryDotTarget()
            }
          }
        }
      }
    }
    guard !pinLayerIds.isEmpty || !labelLayerIds.isEmpty || !dotLayerIds.isEmpty else {
      completion(.success(nil))
      return
    }
    if pinLayerIds.isEmpty {
      queryLabelTarget()
      return
    }
    let queryRect = CGRect(x: point.x - 0.5, y: point.y - 0.5, width: 1, height: 1)
    handle.mapView.mapboxMap.queryRenderedFeatures(
      with: queryRect,
      options: RenderedQueryOptions(layerIds: pinLayerIds, filter: nil)
    ) { pinResult in
      DispatchQueue.main.async {
        switch pinResult {
        case .failure(let error):
          completion(.failure(error))
        case .success(let pinFeatures):
          if let pinTarget = Self.buildRenderedPinPressTarget(
            from: pinFeatures,
            requiredSourceIds: pinInteractionSourceIds
          ) {
            completion(.success(pinTarget))
          } else {
            queryLabelTarget()
          }
        }
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
      state.visualSourceLifecycleState = .hidden
      state.labelCollisionObstacleLayersVisible = false
      state.lastPresentationStateJSON = nil
      state.activeFrameGenerationId = nil
      state.activeExecutionBatchId = nil
      state.sourceReadyFrameGenerationId = nil
      state.sourceReadyExecutionBatchId = nil
      state.residentSourceFrameKey = nil
      state.residentSourceDataKey = nil
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
        labelSourceId: state.labelSourceId,
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
      self.revealStartDeadlockFallbackWorkItems[instanceId]?.cancel()
      self.revealStartDeadlockFallbackWorkItems[instanceId] = nil
      self.revealStartDeadlockReattemptCountByInstance[instanceId] = nil
      self.instances[instanceId] = state
      resolve(nil)
    }
  }

  private func clearDismissLifecycleRequestForEnter(
    instanceId: String,
    state: inout InstanceState
  ) {
    dismissSettleWorkItems[instanceId]?.cancel()
    dismissSettleWorkItems[instanceId] = nil
    dismissFrameFallbackWorkItems[instanceId]?.cancel()
    dismissFrameFallbackWorkItems[instanceId] = nil
    deferredDismissSourceCleanupWorkItems[instanceId]?.cancel()
    deferredDismissSourceCleanupWorkItems[instanceId] = nil
    state.lastDismissRequestKey = nil
    state.pendingPresentationSettleRequestKey = nil
    state.pendingPresentationSettleKind = nil
    state.blockedPresentationSettleRequestKey = nil
    state.blockedPresentationSettleKind = nil
    state.blockedPresentationCommitFenceStartedAtMs = nil
    state.blockedPresentationCommitFenceBySourceId.removeAll(keepingCapacity: true)
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
    let nextPinInteractionGroupOrder = orderedMarkerStates.compactMap { markerKey, renderState in
      Self.shouldRenderPinInteraction(
        renderState: renderState,
        state: state
      ) ? markerKey : nil
    }
    let nextLabelGroupOrder = orderedMarkerStates.compactMap { markerKey, renderState in
      renderState.labelFeatures.isEmpty ? nil : markerKey
    }
    let nextLabelCollisionGroupOrder = orderedMarkerStates.compactMap { markerKey, renderState in
      renderState.labelCollisionFeature == nil ? nil : markerKey
    }
    let previousPinGroupIds = Set(pinFamilyState.collection.groupOrder)
    let nextPinGroupIds = Set(orderedMarkerKeys)
    let dirtyPinMarkerKeys =
      dirtyState.pinMarkerKeys
      .union(previousPinGroupIds.symmetricDifference(nextPinGroupIds))
    let orderChangedPinMarkerKeys =
      pinFamilyState.collection.groupOrder == orderedMarkerKeys
        ? dirtyPinMarkerKeys
        : previousPinGroupIds.union(nextPinGroupIds)
    let previousPinInteractionMarkerKeys = Set(pinInteractionFamilyState.collection.groupOrder)
    let nextPinInteractionMarkerKeys = Set(nextPinInteractionGroupOrder)
    let dirtyPinInteractionMarkerKeys =
      dirtyState.pinInteractionMarkerKeys
      .union(previousPinInteractionMarkerKeys.symmetricDifference(nextPinInteractionMarkerKeys))
    let orderChangedPinInteractionMarkerKeys =
      pinInteractionFamilyState.collection.groupOrder == nextPinInteractionGroupOrder
        ? dirtyPinInteractionMarkerKeys
        : previousPinInteractionMarkerKeys.union(nextPinInteractionMarkerKeys)
    let previousLabelGroupIds = Set(labelFamilyState.collection.groupOrder)
    let nextLabelGroupIds = Set(nextLabelGroupOrder)
    let dirtyLabelMarkerKeys =
      dirtyState.labelMarkerKeys
      .union(previousLabelGroupIds.symmetricDifference(nextLabelGroupIds))
    let orderChangedLabelMarkerKeys =
      labelFamilyState.collection.groupOrder == nextLabelGroupOrder
        ? dirtyLabelMarkerKeys
        : previousLabelGroupIds.union(nextLabelGroupIds)
    let previousLabelCollisionGroupIds = Set(labelCollisionFamilyState.collection.groupOrder)
    let nextLabelCollisionGroupIds = Set(nextLabelCollisionGroupOrder)
    let dirtyLabelCollisionMarkerKeys =
      dirtyState.labelCollisionMarkerKeys
      .union(previousLabelCollisionGroupIds.symmetricDifference(nextLabelCollisionGroupIds))
    let reusePins = dirtyPinMarkerKeys.isEmpty && orderChangedPinMarkerKeys.isEmpty
    let reusePinInteractions =
      dirtyPinInteractionMarkerKeys.isEmpty && orderChangedPinInteractionMarkerKeys.isEmpty
    let reuseLabels = dirtyLabelMarkerKeys.isEmpty && orderChangedLabelMarkerKeys.isEmpty
    // SINGLE-OWNER (#7, validated): the collision source is authored + transported by JS;
    // label-prep reads it for placement (obstacle layers) but NEVER rewrites it. Writing it
    // here advanced native's transport-validated sourceRevision as a second writer,
    // desyncing JS's base → "Parsed collection base mismatch" redbox on profile exit. The
    // former patch path is removed; the JS delta transport is the sole writer.
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
    var nextPinFeatureIdsByGroup: [String: [String]] = [:]
    var nextPinFeatureById: [String: Feature] = [:]
    var nextPinDiffKeyById: [String: String] = [:]
    var nextPinFeatureStateById: [String: [String: Any]] = [:]
    var nextPinMarkerKeyByFeatureId: [String: String] = [:]
    var nextPinInteractionFeatureIdsByGroup: [String: [String]] = [:]
    var nextPinInteractionFeatureById: [String: Feature] = [:]
    var nextPinInteractionDiffKeyById: [String: String] = [:]
    var nextPinInteractionMarkerKeyByFeatureId: [String: String] = [:]
    var nextLabelFeatureIdsByGroup: [String: [String]] = [:]
    var nextLabelFeatureById: [String: Feature] = [:]
    var nextLabelDiffKeyById: [String: String] = [:]
    var nextLabelFeatureStateById: [String: [String: Any]] = [:]
    var nextLabelMarkerKeyByFeatureId: [String: String] = [:]
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
      nextPinFeatureIdsByGroup[markerKey] = [markerKey]
      if dirtyPinMarkerKeys.contains(markerKey) {
        let rewriteStartedAt = shouldAttributeLabelPrep ? CACurrentMediaTime() * 1000 : 0
        let settledPinOpacity = Self.clamp(renderState.targetOpacity, min: 0, max: 1)
        let renderFeature = Self.featureBySettingNumericProperties(
          renderState.pinFeature,
          numericProperties: [
            "nativePresentationOpacity": 1,
            "nativeLodOpacity": settledPinOpacity,
            "nativeLodRankOpacity": settledPinOpacity,
            "nativeLodZ": Double(renderState.lodZ),
          ]
        )
        if shouldAttributeLabelPrep {
          pinNumericRewriteDurationMs += CACurrentMediaTime() * 1000 - rewriteStartedAt
          pinRewriteCount += 1
        }
        nextPinFeatureById[markerKey] = renderFeature
        nextPinDiffKeyById[markerKey] = renderState.pinFeatureDiffKey
        nextPinMarkerKeyByFeatureId[markerKey] = markerKey
        var featureState: [String: Any] = [:]
        if let transientFeatureState = pinFamilyState.transientFeatureStateById[markerKey] {
          featureState = Self.mergedFeatureState(featureState, with: transientFeatureState)
        } else if abs(renderState.currentOpacity - renderState.targetOpacity) >= 0.001 {
          featureState = Self.mergedFeatureState(
            featureState,
            with: Self.livePinFeatureState(opacity: renderState.currentOpacity)
          )
        }
        if !featureState.isEmpty {
          nextPinFeatureStateById[markerKey] = featureState
        }
      }

      if Self.shouldRenderPinInteraction(renderState: renderState, state: state) {
        nextPinInteractionFeatureIdsByGroup[markerKey] = [markerKey]
      }
      if dirtyPinInteractionMarkerKeys.contains(markerKey),
         Self.shouldRenderPinInteraction(renderState: renderState, state: state) {
        let feature = renderState.pinInteractionFeature ?? renderState.pinFeature
        let rewriteStartedAt = shouldAttributeLabelPrep ? CACurrentMediaTime() * 1000 : 0
        nextPinInteractionFeatureById[markerKey] = Self.featureBySettingNumericProperties(
          feature,
          numericProperties: ["nativeLodZ": Double(renderState.lodZ)]
        )
        nextPinInteractionDiffKeyById[markerKey] =
          renderState.pinInteractionFeatureDiffKey ?? renderState.pinFeatureDiffKey
        if shouldAttributeLabelPrep {
          pinInteractionNumericRewriteDurationMs += CACurrentMediaTime() * 1000 - rewriteStartedAt
          pinInteractionRewriteCount += 1
        }
        nextPinInteractionMarkerKeyByFeatureId[markerKey] = markerKey
      }

      let labelFeatureIds = renderState.labelFeatures.map(\.id)
      if !labelFeatureIds.isEmpty {
        nextLabelFeatureIdsByGroup[markerKey] = labelFeatureIds
      }
      if dirtyLabelMarkerKeys.contains(markerKey) {
        for labelFeature in renderState.labelFeatures {
          let rewriteStartedAt = shouldAttributeLabelPrep ? CACurrentMediaTime() * 1000 : 0
          let nextLabelFeature = Self.featureBySettingNumericProperties(
              labelFeature.feature,
              numericProperties: [
                "nativePresentationOpacity": 1,
                "nativeLabelOpacity": placementPrerollOpacity,
                "nativeLodZ": Double(renderState.lodZ),
              ]
          )
          nextLabelFeatureById[labelFeature.id] = nextLabelFeature
          nextLabelDiffKeyById[labelFeature.id] = labelFeature.diffKey
          if shouldAttributeLabelPrep {
            labelNumericRewriteDurationMs += CACurrentMediaTime() * 1000 - rewriteStartedAt
            labelRewriteCount += 1
          }
          nextLabelMarkerKeyByFeatureId[labelFeature.id] = markerKey
          let featureStateStartedAt = shouldAttributeLabelPrep ? CACurrentMediaTime() * 1000 : 0
          var featureState: [String: Any] = [:]
          featureState = Self.mergedFeatureState(
            featureState,
            with: Self.retainedLabelFeatureState(
              for: labelFeature.feature,
              markerKey: markerKey
            )
          )
          if let transientFeatureState = labelFamilyState.transientFeatureStateById[labelFeature.id] {
            featureState = Self.mergedFeatureState(featureState, with: transientFeatureState)
          }
          if !featureState.isEmpty {
            nextLabelFeatureStateById[labelFeature.id] = featureState
          }
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
      let replaceStartedAt = shouldAttributeLabelPrep ? CACurrentMediaTime() * 1000 : 0
      try Self.patchParsedFeatureCollection(
        &pinFamilyState.collection,
        baseSourceState: previousPinsSourceState,
        desiredGroupOrder: orderedMarkerKeys,
        desiredFeatureIdsByGroup: nextPinFeatureIdsByGroup,
        featureById: nextPinFeatureById,
        diffKeyById: nextPinDiffKeyById,
        featureStateById: nextPinFeatureStateById,
        markerKeyByFeatureId: nextPinMarkerKeyByFeatureId,
        dirtyGroupIds: dirtyPinMarkerKeys,
        orderChangedGroupIds: orderChangedPinMarkerKeys,
        removedGroupIds: previousPinGroupIds.subtracting(nextPinGroupIds),
        useCurrentCollectionBase: true,
        recordAttribution: makeReplaceAttributionRecorder("pins")
      )
      if shouldAttributeLabelPrep {
        self.recordNativeApply(
          section: "label_prep.replace_collection",
          phase: labelPrepPhase,
          source: "pins",
          durationMs: CACurrentMediaTime() * 1000 - replaceStartedAt,
          operationCount: nextPinFeatureById.count
        )
      }
      Self.markLogicalFamilyCollectionResident(&pinFamilyState)
      Self.setDerivedFamilyState(pinFamilyState, sourceId: state.pinSourceId, state: &state)
      nextPins = pinFamilyState.collection
    }
    let pinStartedAt = CACurrentMediaTime() * 1000

    let previousPinInteractionsSourceState = pinInteractionFamilyState.sourceState
    let nextPinInteractions: ParsedFeatureCollection
    if reusePinInteractions {
      nextPinInteractions = pinInteractionFamilyState.collection
    } else {
      let replaceStartedAt = shouldAttributeLabelPrep ? CACurrentMediaTime() * 1000 : 0
      try Self.patchParsedFeatureCollection(
        &pinInteractionFamilyState.collection,
        baseSourceState: previousPinInteractionsSourceState,
        desiredGroupOrder: nextPinInteractionGroupOrder,
        desiredFeatureIdsByGroup: nextPinInteractionFeatureIdsByGroup,
        featureById: nextPinInteractionFeatureById,
        diffKeyById: nextPinInteractionDiffKeyById,
        markerKeyByFeatureId: nextPinInteractionMarkerKeyByFeatureId,
        dirtyGroupIds: dirtyPinInteractionMarkerKeys,
        orderChangedGroupIds: orderChangedPinInteractionMarkerKeys,
        removedGroupIds: previousPinInteractionMarkerKeys.subtracting(nextPinInteractionMarkerKeys),
        useCurrentCollectionBase: true,
        recordAttribution: makeReplaceAttributionRecorder("pinInteractions")
      )
      if shouldAttributeLabelPrep {
        self.recordNativeApply(
          section: "label_prep.replace_collection",
          phase: labelPrepPhase,
          source: "pinInteractions",
          durationMs: CACurrentMediaTime() * 1000 - replaceStartedAt,
          operationCount: nextPinInteractionFeatureById.count
        )
      }
      Self.setDerivedFamilyState(
        pinInteractionFamilyState,
        sourceId: state.pinInteractionSourceId,
        state: &state
      )
      Self.markLogicalFamilyCollectionResident(&pinInteractionFamilyState)
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
      let replaceStartedAt = shouldAttributeLabelPrep ? CACurrentMediaTime() * 1000 : 0
      try Self.patchParsedFeatureCollection(
        &labelFamilyState.collection,
        baseSourceState: previousLabelsSourceState,
        desiredGroupOrder: nextLabelGroupOrder,
        desiredFeatureIdsByGroup: nextLabelFeatureIdsByGroup,
        featureById: nextLabelFeatureById,
        diffKeyById: nextLabelDiffKeyById,
        featureStateById: nextLabelFeatureStateById,
        markerKeyByFeatureId: nextLabelMarkerKeyByFeatureId,
        dirtyGroupIds: dirtyLabelMarkerKeys,
        orderChangedGroupIds: orderChangedLabelMarkerKeys,
        removedGroupIds: previousLabelGroupIds.subtracting(nextLabelGroupIds),
        useCurrentCollectionBase: true,
        recordAttribution: makeReplaceAttributionRecorder("labels")
      )
      if shouldAttributeLabelPrep {
        self.recordNativeApply(
          section: "label_prep.replace_collection",
          phase: labelPrepPhase,
          source: "labels",
          durationMs: CACurrentMediaTime() * 1000 - replaceStartedAt,
          operationCount: nextLabelFeatureById.count
        )
      }
      Self.markLogicalFamilyCollectionResident(&labelFamilyState)
      Self.setDerivedFamilyState(labelFamilyState, sourceId: state.labelSourceId, state: &state)
      nextLabels = labelFamilyState.collection
    }
    // SINGLE-OWNER (#7): label-prep does NOT write the JS-owned collision source — the JS
    // delta transport is its sole writer. The former collision patch block here is removed.
    let promotedSlotRecordsByMarkerKey = Self.makePromotedSlotRecordsByMarkerKey(
      orderedMarkerKeys: orderedMarkerKeys,
      pinRecordsByMarkerKey: Self.recordsByMarkerKey(from: nextPins),
      pinInteractionRecordsByMarkerKey: Self.recordsByMarkerKey(from: nextPinInteractions),
      labelRecordsByMarkerKey: Self.recordsByMarkerKey(from: nextLabels)
    )
    let promotedSlotCollection = Self.makeParsedFeatureCollection(
      records: orderedMarkerKeys.flatMap { promotedSlotRecordsByMarkerKey[$0] ?? [] }
    )
    var promotedSlotFamilyState = Self.emptyDerivedFamilyState()
    promotedSlotFamilyState.collection = promotedSlotCollection
    let previousPromotedGroupIds = Set(
      Self.derivedFamilyState(sourceId: state.pinBundleSourceId, state: state).collection.groupOrder
    )
    promotedSlotFamilyState.collection.dirtyGroupIds =
      dirtyPinMarkerKeys
      .union(dirtyPinInteractionMarkerKeys)
      .union(dirtyLabelMarkerKeys)
      .union(dirtyLabelCollisionMarkerKeys)
      .union(previousPromotedGroupIds.symmetricDifference(Set(orderedMarkerKeys)))
    promotedSlotFamilyState.collection.orderChangedGroupIds =
      promotedSlotFamilyState.collection.dirtyGroupIds
    promotedSlotFamilyState.collection.removedGroupIds =
      previousPromotedGroupIds.subtracting(Set(orderedMarkerKeys))
    var plans: [ParsedCollectionApplyPlan] = []
    if let labelCollisionPlan = Self.buildDirectFamilyApplyPlan(
      sourceId: state.labelCollisionSourceId,
      state: &state
    ) {
      plans.append(labelCollisionPlan)
    }
    let promotedSlotPlans = try Self.buildSlotApplyPlans(
      sourceId: state.pinBundleSourceId,
      nextCollection: promotedSlotFamilyState.collection,
      state: &state,
      recordAttribution: makeReplaceAttributionRecorder("promotedSlots")
    )
    plans.append(contentsOf: promotedSlotPlans)
    return PreparedDerivedPinAndLabelOutput(
      plans: plans,
      pinSourceIds: [state.pinBundleSourceId],
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
    var shouldStartMountedHiddenPinTransitions = false
    for pinSourceId in prepared.pinSourceIds {
      let pinMutationSummary = mutationSummaryBySourceId[pinSourceId] ?? MutationSummary(
        addCount: 0,
        updateCount: 0,
        removeCount: 0,
        dataId: nil,
        addedFeatureIds: []
      )
      if pinMutationSummary.dataId == nil && !pinMutationSummary.addedFeatureIds.isEmpty {
        shouldStartMountedHiddenPinTransitions = true
      }
      guard let dataId = pinMutationSummary.dataId, !pinMutationSummary.addedFeatureIds.isEmpty else {
        continue
      }
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
    if shouldStartMountedHiddenPinTransitions {
      startAwaitingLivePinTransitions(
        instanceId: instanceId,
        dataId: nil,
        reason: "baseline_source_replace",
        state: &state
      )
    }
  }

  private static func nextScopedGroupOrder(
    currentGroupOrder: [String],
    affectedGroupIds: Set<String>,
    renderedGroupIdsInOrder: [String]
  ) -> [String] {
    var nextGroupOrder = currentGroupOrder.filter { !affectedGroupIds.contains($0) }
    var includedGroupIds = Set(nextGroupOrder)
    for groupId in renderedGroupIdsInOrder {
      guard affectedGroupIds.contains(groupId), !includedGroupIds.contains(groupId) else {
        continue
      }
      nextGroupOrder.append(groupId)
      includedGroupIds.insert(groupId)
    }
    return nextGroupOrder
  }

  private static func orderedAffectedMarkerKeys(
    _ markerKeys: Set<String>,
    renderStates: [String: MarkerFamilyRenderState]
  ) -> [String] {
    markerKeys.sorted { left, right in
      let leftOrder = renderStates[left]?.orderHint ?? .max
      let rightOrder = renderStates[right]?.orderHint ?? .max
      if leftOrder != rightOrder {
        return leftOrder < rightOrder
      }
      let leftLodZ = renderStates[left]?.lodZ ?? -1
      let rightLodZ = renderStates[right]?.lodZ ?? -1
      if leftLodZ != rightLodZ {
        return leftLodZ > rightLodZ
      }
      return left < right
    }
  }

  private static func buildDirectSlotApplyPlans(
    sourceId: String,
    orderedAffectedMarkerKeys: [String],
    recordsByMarkerKey: [String: [ParsedTransportFeatureRecord]],
    affectedMarkerKeys: Set<String>,
    state: inout InstanceState,
    recordAttribution: ((_ section: String, _ durationMs: Double, _ operationCount: Int) -> Void)? = nil
  ) throws -> [ParsedCollectionApplyPlan] {
    guard !affectedMarkerKeys.isEmpty else {
      return []
    }

    // Resident single bundle source: every promoted marker's pin/interaction/
    // label features live in ONE source, grouped by markerKey. The slot is the
    // feature's `nativeLodZ`, used only by the per-slot LAYER filters for
    // z-order — it does not select a source. No per-slot source fan-out.
    var familyState = derivedFamilyState(sourceId: sourceId, state: state)
    let previousSourceState = familyState.sourceState

    var desiredGroupOrder = familyState.collection.groupOrder.filter {
      !affectedMarkerKeys.contains($0)
    }
    var desiredFeatureIdsByGroup: [String: [String]] = [:]
    var featureById: [String: Feature] = [:]
    var diffKeyById: [String: String] = [:]
    var featureStateById: [String: [String: Any]] = [:]
    var markerKeyByFeatureId: [String: String] = [:]

    let desiredStartedAt = recordAttribution == nil ? 0 : CACurrentMediaTime() * 1000
    for markerKey in orderedAffectedMarkerKeys {
      guard affectedMarkerKeys.contains(markerKey),
            let records = recordsByMarkerKey[markerKey],
            !records.isEmpty
      else {
        continue
      }
      if !desiredGroupOrder.contains(markerKey) {
        desiredGroupOrder.append(markerKey)
      }
      desiredFeatureIdsByGroup[markerKey] = records.map(\.id)
      for record in records {
        featureById[record.id] = record.feature
        diffKeyById[record.id] = record.diffKey
        if !record.featureState.isEmpty {
          featureStateById[record.id] = record.featureState
        }
        markerKeyByFeatureId[record.id] = record.markerKey
      }
    }
    if let recordAttribution {
      recordAttribution("direct.desired_records", CACurrentMediaTime() * 1000 - desiredStartedAt, recordsByMarkerKey.count)
    }

    let previousGroupIds = Set(familyState.collection.groupOrder)
    let nextGroupIds = Set(desiredGroupOrder)
    let removedGroupIds = previousGroupIds.subtracting(nextGroupIds).intersection(affectedMarkerKeys)
    let addedGroupIds = nextGroupIds.subtracting(previousGroupIds).intersection(affectedMarkerKeys)
    let dirtyGroupIds = affectedMarkerKeys.intersection(
      previousGroupIds.union(nextGroupIds)
    )
    guard !dirtyGroupIds.isEmpty ||
      !removedGroupIds.isEmpty ||
      familyState.collection.groupOrder != desiredGroupOrder
    else {
      return []
    }
    let orderChangedGroupIds =
      familyState.collection.groupOrder == desiredGroupOrder
        ? dirtyGroupIds
        : dirtyGroupIds.union(addedGroupIds).union(removedGroupIds)

    try patchParsedFeatureCollection(
      &familyState.collection,
      baseSourceState: previousSourceState,
      desiredGroupOrder: desiredGroupOrder,
      desiredFeatureIdsByGroup: desiredFeatureIdsByGroup,
      featureById: featureById,
      diffKeyById: diffKeyById,
      featureStateById: featureStateById,
      markerKeyByFeatureId: markerKeyByFeatureId,
      dirtyGroupIds: dirtyGroupIds,
      orderChangedGroupIds: orderChangedGroupIds,
      removedGroupIds: removedGroupIds,
      useCurrentCollectionBase: true,
      recordAttribution: recordAttribution
    )
    setDerivedFamilyState(familyState, sourceId: sourceId, state: &state)
    if previousSourceState.sourceRevision == familyState.collection.sourceRevision &&
      previousSourceState.featureStateRevision == familyState.collection.featureStateRevision
    {
      return []
    }
    return [
      ParsedCollectionApplyPlan(
        sourceId: sourceId,
        next: familyState.collection,
        previousSourceState: previousSourceState,
        previousFeatureStateById: previousSourceState.featureStateById,
        previousFeatureStateRevision: previousSourceState.featureStateRevision
      )
    ]
  }

  private static func buildDirectFamilyApplyPlan(
    sourceId: String,
    state: inout InstanceState
  ) -> ParsedCollectionApplyPlan? {
    var familyState = derivedFamilyState(sourceId: sourceId, state: state)
    let previousSourceState = familyState.sourceState
    let nextSourceState = sourceStateFromCollection(familyState.desiredCollection)
    guard previousSourceState.sourceRevision != nextSourceState.sourceRevision ||
      previousSourceState.featureStateRevision != nextSourceState.featureStateRevision
    else {
      return nil
    }
    let nextCollection = familyState.desiredCollection
    familyState.collection = nextCollection
    setDerivedFamilyState(familyState, sourceId: sourceId, state: &state)
    return ParsedCollectionApplyPlan(
      sourceId: sourceId,
      next: nextCollection,
      previousSourceState: previousSourceState,
      previousFeatureStateById: previousSourceState.featureStateById,
      previousFeatureStateRevision: previousSourceState.featureStateRevision
    )
  }

  private static func buildScopedSingleFeatureFamilyApplyPlan(
    sourceId: String,
    affectedMarkerKeys: Set<String>,
    orderedAffectedMarkerKeys: [String],
    recordsByMarkerKey: [String: ParsedTransportFeatureRecord],
    state: inout InstanceState
  ) throws -> ParsedCollectionApplyPlan? {
    guard !affectedMarkerKeys.isEmpty else {
      return nil
    }
    var familyState = derivedFamilyState(sourceId: sourceId, state: state)
    let previousSourceState = familyState.sourceState
    let previousGroupIds = Set(familyState.collection.groupOrder)
    let renderedGroupIdsInOrder = orderedAffectedMarkerKeys.filter {
      affectedMarkerKeys.contains($0) && recordsByMarkerKey[$0] != nil
    }
    let nextGroupOrder = nextScopedGroupOrder(
      currentGroupOrder: familyState.collection.groupOrder,
      affectedGroupIds: affectedMarkerKeys,
      renderedGroupIdsInOrder: renderedGroupIdsInOrder
    )
    let nextGroupIds = Set(nextGroupOrder)
    let dirtyGroupIds = affectedMarkerKeys.intersection(previousGroupIds.union(nextGroupIds))
    let removedGroupIds = previousGroupIds.subtracting(nextGroupIds).intersection(affectedMarkerKeys)
    guard !dirtyGroupIds.isEmpty ||
      !removedGroupIds.isEmpty ||
      familyState.collection.groupOrder != nextGroupOrder
    else {
      return nil
    }

    var desiredFeatureIdsByGroup: [String: [String]] = [:]
    var featureById: [String: Feature] = [:]
    var diffKeyById: [String: String] = [:]
    var featureStateById: [String: [String: Any]] = [:]
    var markerKeyByFeatureId: [String: String] = [:]
    for markerKey in renderedGroupIdsInOrder {
      guard let record = recordsByMarkerKey[markerKey] else {
        continue
      }
      desiredFeatureIdsByGroup[markerKey] = [record.id]
      featureById[record.id] = record.feature
      diffKeyById[record.id] = record.diffKey
      if !record.featureState.isEmpty {
        featureStateById[record.id] = record.featureState
      }
      markerKeyByFeatureId[record.id] = record.markerKey
    }

    try patchParsedFeatureCollection(
      &familyState.collection,
      baseSourceState: previousSourceState,
      desiredGroupOrder: nextGroupOrder,
      desiredFeatureIdsByGroup: desiredFeatureIdsByGroup,
      featureById: featureById,
      diffKeyById: diffKeyById,
      featureStateById: featureStateById,
      markerKeyByFeatureId: markerKeyByFeatureId,
      dirtyGroupIds: dirtyGroupIds,
      orderChangedGroupIds: dirtyGroupIds.union(removedGroupIds),
      removedGroupIds: removedGroupIds,
      useCurrentCollectionBase: true
    )
    setDerivedFamilyState(familyState, sourceId: sourceId, state: &state)
    guard previousSourceState.sourceRevision != familyState.collection.sourceRevision ||
      previousSourceState.featureStateRevision != familyState.collection.featureStateRevision
    else {
      return nil
    }
    let plan = ParsedCollectionApplyPlan(
      sourceId: sourceId,
      next: familyState.collection,
      previousSourceState: previousSourceState,
      previousFeatureStateById: previousSourceState.featureStateById,
      previousFeatureStateRevision: previousSourceState.featureStateRevision
    )
    return plan
  }

  private func prepareScopedPinAndLabelOutput(
    instanceId: String,
    affectedMarkerKeys rawAffectedMarkerKeys: Set<String>,
    state: inout InstanceState
  ) throws -> PreparedDerivedPinAndLabelOutput {
    let affectedMarkerKeys = rawAffectedMarkerKeys.filter { !$0.isEmpty }
    guard !affectedMarkerKeys.isEmpty else {
      return PreparedDerivedPinAndLabelOutput(
        plans: [],
        pinSourceIds: [state.pinBundleSourceId],
        pinStartedAtMs: CACurrentMediaTime() * 1000
      )
    }

    let directPinFamilyState = Self.derivedFamilyState(sourceId: state.pinSourceId, state: state)
    let directPinInteractionFamilyState = Self.derivedFamilyState(
      sourceId: state.pinInteractionSourceId,
      state: state
    )
    let directLabelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    let directRenderStates = directPinFamilyState.markerRenderStateByMarkerKey
    let shouldAttributeScopedPrep = nativeApplyAttributionEnabled
    let scopedPrepPhase = state.lastPresentationBatchPhase
    let makeScopedAttributionRecorder: (String) -> ((_ section: String, _ durationMs: Double, _ operationCount: Int) -> Void)? = { source in
      guard shouldAttributeScopedPrep else {
        return nil
      }
      return { section, durationMs, operationCount in
        self.recordNativeApply(
          section: "live_label_prep.\(section)",
          phase: scopedPrepPhase,
          source: source,
          durationMs: durationMs,
          operationCount: operationCount
        )
      }
    }
    let directOrderedAffectedMarkerKeys = Self.orderedAffectedMarkerKeys(
      affectedMarkerKeys,
      renderStates: directRenderStates
    )
    var directPinRecordsByMarkerKey: [String: [ParsedTransportFeatureRecord]] = [:]
    var directPinInteractionRecordsByMarkerKey: [String: [ParsedTransportFeatureRecord]] = [:]
    var directLabelRecordsByMarkerKey: [String: [ParsedTransportFeatureRecord]] = [:]
    var directLabelCollisionRecordsByMarkerKey: [String: ParsedTransportFeatureRecord] = [:]
    var pinSourceOpacityMissingCount = 0
    var exitingPinSourceOpacityRiskCount = 0

    for markerKey in directOrderedAffectedMarkerKeys {
      guard let renderState = directRenderStates[markerKey] else {
        continue
      }
      let placementPrerollOpacity = Self.sourceFeatureOpacityForPlacementPreroll(
        renderState: renderState,
        state: state
      )
      let pinSourceOpacity = Self.clamp(placementPrerollOpacity, min: 0, max: 1)
      let pinFeature = Self.featureBySettingNumericProperties(
        renderState.pinFeature,
        numericProperties: [
          "nativePresentationOpacity": 1,
          "nativeLodOpacity": pinSourceOpacity,
          "nativeLodRankOpacity": pinSourceOpacity,
          "nativeLodZ": Double(renderState.lodZ),
        ]
      )
      let pinFeatureProperties = pinFeature.properties?.turfRawValue as? [String: Any]
      let nativeLodOpacity = (pinFeatureProperties?["nativeLodOpacity"] as? NSNumber)?.doubleValue
      if nativeLodOpacity == nil {
        pinSourceOpacityMissingCount += 1
      }
      if renderState.targetOpacity <= 0.001 &&
        (nativeLodOpacity ?? 1) > Self.clamp(renderState.currentOpacity, min: 0, max: 1) + 0.001
      {
        exitingPinSourceOpacityRiskCount += 1
      }
      var pinFeatureState = directPinFamilyState.transientFeatureStateById[markerKey] ?? [:]
      if pinFeatureState.isEmpty &&
        abs(renderState.currentOpacity - renderState.targetOpacity) >= 0.001
      {
        pinFeatureState = Self.livePinFeatureState(opacity: renderState.currentOpacity)
      }
      directPinRecordsByMarkerKey[markerKey] = [
          ParsedTransportFeatureRecord(
            id: markerKey,
            feature: pinFeature,
            diffKey: renderState.pinFeatureDiffKey,
            featureState: pinFeatureState,
            markerKey: markerKey
          )
      ]

      if Self.shouldRenderPinInteraction(renderState: renderState, state: state) {
        let pinInteractionFeature = Self.featureBySettingNumericProperties(
          renderState.pinInteractionFeature ?? renderState.pinFeature,
          numericProperties: ["nativeLodZ": Double(renderState.lodZ)]
        )
        directPinInteractionRecordsByMarkerKey[markerKey] = [
          ParsedTransportFeatureRecord(
            id: markerKey,
            feature: pinInteractionFeature,
            diffKey: renderState.pinInteractionFeatureDiffKey ??
              directPinInteractionFamilyState.collection.diffKeyById[markerKey] ??
              directPinInteractionFamilyState.desiredCollection.diffKeyById[markerKey] ??
              renderState.pinFeatureDiffKey,
            featureState: [:],
            markerKey: markerKey
          )
        ]
      }

      var labelRecords: [ParsedTransportFeatureRecord] = []
      labelRecords.reserveCapacity(renderState.labelFeatures.count)
      for labelFeature in renderState.labelFeatures {
        let nextLabelFeature = Self.featureBySettingNumericProperties(
          labelFeature.feature,
          numericProperties: [
            "nativePresentationOpacity": 1,
            "nativeLabelOpacity": placementPrerollOpacity,
            "nativeLodZ": Double(renderState.lodZ),
          ]
        )
        var featureState: [String: Any] = [:]
        if let transientFeatureState = directLabelFamilyState.transientFeatureStateById[labelFeature.id] {
          featureState = Self.mergedFeatureState(featureState, with: transientFeatureState)
        }
        labelRecords.append(
          ParsedTransportFeatureRecord(
            id: labelFeature.id,
            feature: nextLabelFeature,
            diffKey: labelFeature.diffKey,
            featureState: featureState,
            markerKey: markerKey
          )
        )
      }
      if !labelRecords.isEmpty {
        directLabelRecordsByMarkerKey[markerKey] = labelRecords
      }
      if let labelCollisionFeature = renderState.labelCollisionFeature,
         renderState.currentOpacity > 0.001 || renderState.targetOpacity > 0.001 {
        let nextLabelCollisionFeature = Self.featureBySettingNumericProperties(
          labelCollisionFeature,
          numericProperties: [
            "nativePresentationOpacity": 1,
            "nativeLodZ": Double(renderState.lodZ),
          ]
        )
        directLabelCollisionRecordsByMarkerKey[markerKey] = ParsedTransportFeatureRecord(
          id: markerKey,
          feature: nextLabelCollisionFeature,
          diffKey: renderState.labelCollisionFeatureDiffKey ?? markerKey,
          featureState: [:],
          markerKey: markerKey
        )
      }
    }

    let promotedSlotRecordsByMarkerKey = Self.makePromotedSlotRecordsByMarkerKey(
      orderedMarkerKeys: directOrderedAffectedMarkerKeys,
      pinRecordsByMarkerKey: directPinRecordsByMarkerKey,
      pinInteractionRecordsByMarkerKey: directPinInteractionRecordsByMarkerKey,
      labelRecordsByMarkerKey: directLabelRecordsByMarkerKey
    )
    let promotedSlotPlans = try Self.buildDirectSlotApplyPlans(
      sourceId: state.pinBundleSourceId,
      orderedAffectedMarkerKeys: directOrderedAffectedMarkerKeys,
      recordsByMarkerKey: promotedSlotRecordsByMarkerKey,
      affectedMarkerKeys: affectedMarkerKeys,
      state: &state,
      recordAttribution: makeScopedAttributionRecorder("promotedSlots")
    )
    var plans: [ParsedCollectionApplyPlan] = []
    if let labelCollisionPlan = try Self.buildScopedSingleFeatureFamilyApplyPlan(
      sourceId: state.labelCollisionSourceId,
      affectedMarkerKeys: affectedMarkerKeys,
      orderedAffectedMarkerKeys: directOrderedAffectedMarkerKeys,
      recordsByMarkerKey: directLabelCollisionRecordsByMarkerKey,
      state: &state
    ) {
      plans.append(labelCollisionPlan)
    }
    plans.append(contentsOf: promotedSlotPlans)
    emit([
      "type": "native_scoped_promoted_slot_contract",
      "instanceId": instanceId,
      "affectedMarkerCount": affectedMarkerKeys.count,
      "orderedAffectedMarkerCount": directOrderedAffectedMarkerKeys.count,
      "pinSourceOpacityMissingCount": pinSourceOpacityMissingCount,
      "exitingPinSourceOpacityRiskCount": exitingPinSourceOpacityRiskCount,
      "sourceOpacityBacksScopedPins": pinSourceOpacityMissingCount == 0 &&
        exitingPinSourceOpacityRiskCount == 0,
      "emittedAtMs": Self.nowMs(),
    ])

    return PreparedDerivedPinAndLabelOutput(
      plans: plans,
      pinSourceIds: [state.pinBundleSourceId],
      pinStartedAtMs: CACurrentMediaTime() * 1000
    )

  }

  private static func promotedPinInteractionFeatureId(markerKey: String) -> String {
    "\(markerKey)::pinInteraction"
  }

  private static func promotedSlotFeatureRecord(
    _ record: ParsedTransportFeatureRecord,
    id: String,
    kind: String
  ) -> ParsedTransportFeatureRecord {
    var feature = featureBySettingNumericProperties(
      record.feature,
      numericProperties: [:],
      stringProperties: ["nativeSlotFeatureKind": kind]
    )
    feature.identifier = .string(id)
    return ParsedTransportFeatureRecord(
      id: id,
      feature: feature,
      diffKey: "\(record.diffKey)::slotKind:\(kind)",
      featureState: record.featureState,
      markerKey: record.markerKey
    )
  }

  private static func makePromotedSlotRecordsByMarkerKey(
    orderedMarkerKeys: [String],
    pinRecordsByMarkerKey: [String: [ParsedTransportFeatureRecord]],
    pinInteractionRecordsByMarkerKey: [String: [ParsedTransportFeatureRecord]],
    labelRecordsByMarkerKey: [String: [ParsedTransportFeatureRecord]]
  ) -> [String: [ParsedTransportFeatureRecord]] {
    var recordsByMarkerKey: [String: [ParsedTransportFeatureRecord]] = [:]
    for markerKey in orderedMarkerKeys {
      var records: [ParsedTransportFeatureRecord] = []
      for record in pinRecordsByMarkerKey[markerKey] ?? [] {
        records.append(promotedSlotFeatureRecord(record, id: record.id, kind: "pin"))
      }
      for record in pinInteractionRecordsByMarkerKey[markerKey] ?? [] {
        records.append(
          promotedSlotFeatureRecord(
            record,
            id: promotedPinInteractionFeatureId(markerKey: markerKey),
            kind: "pinInteraction"
          )
        )
      }
      for record in labelRecordsByMarkerKey[markerKey] ?? [] {
        records.append(promotedSlotFeatureRecord(record, id: record.id, kind: "label"))
      }
      if !records.isEmpty {
        recordsByMarkerKey[markerKey] = records
      }
    }
    return recordsByMarkerKey
  }

  private static func recordsByMarkerKey(
    from collection: ParsedFeatureCollection
  ) -> [String: [ParsedTransportFeatureRecord]] {
    var recordsByMarkerKey: [String: [ParsedTransportFeatureRecord]] = [:]
    for featureId in collection.idsInOrder {
      guard let feature = collection.featureById[featureId] else {
        continue
      }
      let markerKey = collection.markerKeyByFeatureId[featureId] ?? featureId
      recordsByMarkerKey[markerKey, default: []].append(
        ParsedTransportFeatureRecord(
          id: featureId,
          feature: feature,
          diffKey: collection.diffKeyById[featureId] ?? featureId,
          featureState: collection.featureStateById[featureId] ?? [:],
          markerKey: markerKey
        )
      )
    }
    return recordsByMarkerKey
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

  private static func shouldRenderPinInteraction(
    renderState: MarkerFamilyRenderState,
    state: InstanceState
  ) -> Bool {
    // Interaction availability follows the settled promoted role. Exiting pins may remain visible
    // briefly for the crossfade, but once a marker demotes to dot it must not keep the pin hitbox.
    state.visualSourceLifecycleState != .dismissing &&
      state.visualSourceLifecycleState != .hidden &&
      renderState.isDesiredPresent
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
    if Self.isVisualSourceInactiveOrDismissing(state) {
      cancelLivePinTransitionAnimation(instanceId: instanceId)
      state.isAwaitingSourceRecovery = false
      state.isReplayingSourceRecovery = false
      instances[instanceId] = state
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
      let snapshotStartedAt = CACurrentMediaTime() * 1000
      let nextDesiredPinSnapshot = Self.makeDesiredPinSnapshotState(
        desiredPins: desiredPins,
        desiredPinInteractions: desiredPinInteractions,
        desiredLabels: desiredLabels,
        desiredLabelCollisions: desiredLabelCollisions,
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
      visibleDotMarkerKeys: Self.visibleDotMarkerKeys(from: desiredDots),
      nowMs: nowMs,
      allowNewTransitions: shouldAnimateIncrementalTransitions
    )
    self.recordNativeApply(
      section: "reconcile.update_live_dot_transitions",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - dotTransitionsStartedAt
    )
    // SNAP DETECTOR (full-frame path). viewport_lod LOD changes land here, not the
    // role path. Emits the diagnostic needed to pin the suppression: did the snapshot
    // get reused (opacity flip with unchanged sourceRevision), did any promoted-set
    // flip happen, and did flips produce transitions or snap.
    let cfActivePinTransitionKeys =
      Set(Self.derivedFamilyState(sourceId: state.pinSourceId, state: state).livePinTransitionsByMarkerKey.keys)
    let cfActiveDotTransitionKeys =
      Set(Self.derivedFamilyState(sourceId: state.dotSourceId, state: state).liveDotTransitionsByMarkerKey.keys)
    let cfPreviousPromoted = Set(previousDesiredPinSnapshot.pinIdsInOrder)
    let cfNextPromoted = Set(desiredPinSnapshot.pinIdsInOrder)
    let cfFlipKeys = cfPreviousPromoted.symmetricDifference(cfNextPromoted)
    if !cfFlipKeys.isEmpty {
      emit([
        "type": "lod_snap_contract",
        "instanceId": instanceId,
        "reason": "current_frame",
        "snapshotReused": previousDesiredPinSnapshot.inputRevision == desiredPinSnapshotInputRevision,
        "desiredPinCount": desiredPins.idsInOrder.count,
        "promotedPinCount": cfNextPromoted.count,
        "roleFlipCount": cfFlipKeys.count,
        "silentPinFlipCount": cfFlipKeys.subtracting(cfActivePinTransitionKeys).count,
        "silentDotFlipCount": cfFlipKeys.subtracting(cfActiveDotTransitionKeys).count,
        "pinTransitionCreatedCount": cfActivePinTransitionKeys.count,
        "dotTransitionCreatedCount": cfActiveDotTransitionKeys.count,
        "allowNewTransitions": shouldAnimateIncrementalTransitions,
        "emittedAtMs": Self.nowMs(),
      ])
    }
    guard let mapboxMap = try readyMapboxMap(
      for: state.mapTag,
      instanceId: instanceId,
      state: &state,
      sourceIds: visualAndInteractionSourceIds(for: state),
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
      nowMs: nowMs,
      state: &state
    )
    self.recordNativeApply(
      section: "reconcile.prepare_dot_output",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - dotOutputStartedAt
    )
    let batchStartedAt = CACurrentMediaTime() * 1000
    let mutationSummaryBySourceId = try applyParsedCollectionBatch(
      instanceId: instanceId,
      plans: preparedPinAndLabelOutput.plans + preparedDotOutput.plans,
      state: &state,
      mapboxMap: mapboxMap
    )
    self.recordNativeApply(
      section: "reconcile.apply_parsed_batch",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - batchStartedAt,
      operationCount: preparedPinAndLabelOutput.plans.count + preparedDotOutput.plans.count
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
      instanceId: instanceId,
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
    nowMs: Double,
    state: inout InstanceState
  ) throws -> PreparedDerivedDotOutput {
    var dotFamilyState = Self.derivedFamilyState(sourceId: state.dotSourceId, state: state)
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
          let renderFeature = Self.featureBySettingNumericProperties(
            feature,
            numericProperties: [
              "nativePresentationOpacity": 1,
              "nativeDotOpacity": 1,
            ]
          )
          nextDotFeatureById[markerKey] = renderFeature
          nextDotMarkerKeyByFeatureId[markerKey] = desiredDots.markerKeyByFeatureId[markerKey] ?? markerKey
          var featureState = nextDotFeatureStateById[markerKey] ?? [:]
          if let desiredFeatureState = desiredDots.featureStateById[markerKey] {
            featureState = Self.mergedFeatureState(featureState, with: desiredFeatureState)
          }
          if let transientFeatureState = dotFamilyState.transientFeatureStateById[markerKey] {
            featureState = Self.mergedFeatureState(featureState, with: transientFeatureState)
          }
          if featureState.isEmpty {
            nextDotFeatureStateById.removeValue(forKey: markerKey)
          } else {
            nextDotFeatureStateById[markerKey] = featureState
          }
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
    return PreparedDerivedDotOutput(
      plans: [
        ParsedCollectionApplyPlan(
          sourceId: state.dotSourceId,
          next: nextDots,
          previousSourceState: previousDotSourceState,
          previousFeatureStateById: previousDotSourceState.featureStateById,
          previousFeatureStateRevision: previousDotSourceState.featureStateRevision
        ),
      ],
      dotSourceId: state.dotSourceId
    )
  }

  private func prepareScopedDotOutput(
    affectedMarkerKeys rawAffectedMarkerKeys: Set<String>,
    desiredDots: ParsedFeatureCollection,
    nowMs: Double,
    state: inout InstanceState
  ) throws -> PreparedDerivedDotOutput {
    let affectedMarkerKeys = rawAffectedMarkerKeys.filter { !$0.isEmpty }
    guard !affectedMarkerKeys.isEmpty else {
      return PreparedDerivedDotOutput(plans: [], dotSourceId: state.dotSourceId)
    }
    var dotFamilyState = Self.derivedFamilyState(sourceId: state.dotSourceId, state: state)
    let previousDotSourceState = dotFamilyState.sourceState
    var nextCollection = dotFamilyState.collection
    var changedFeatureIds = Set<String>()

    for markerKey in affectedMarkerKeys.sorted() {
      guard nextCollection.featureById[markerKey] != nil else {
        continue
      }

      var featureState = nextCollection.featureStateById[markerKey] ?? [:]
      if let desiredFeatureState = desiredDots.featureStateById[markerKey] {
        featureState = Self.mergedFeatureState(featureState, with: desiredFeatureState)
      }
      if let transientFeatureState = dotFamilyState.transientFeatureStateById[markerKey] {
        featureState = Self.mergedFeatureState(featureState, with: transientFeatureState)
      }
      let previousFeatureState = nextCollection.featureStateById[markerKey] ?? [:]
      guard Self.buildFeatureStateEntryRevision(state: previousFeatureState) !=
        Self.buildFeatureStateEntryRevision(state: featureState)
      else {
        continue
      }

      if featureState.isEmpty {
        nextCollection.featureStateById.removeValue(forKey: markerKey)
        nextCollection.featureStateEntryRevisionById.removeValue(forKey: markerKey)
      } else {
        nextCollection.featureStateById[markerKey] = featureState
        nextCollection.featureStateEntryRevisionById[markerKey] =
          Self.buildFeatureStateEntryRevision(state: featureState)
      }
      changedFeatureIds.insert(markerKey)
    }

    guard !changedFeatureIds.isEmpty else {
      return PreparedDerivedDotOutput(plans: [], dotSourceId: state.dotSourceId)
    }

    nextCollection.baseSourceRevision = previousDotSourceState.sourceRevision
    nextCollection.baseFeatureStateRevision = previousDotSourceState.featureStateRevision
    nextCollection.featureStateChangedIds = changedFeatureIds
    nextCollection.featureStateRevision = Self.buildFeatureStateRevision(
      featureStateEntryRevisionById: nextCollection.featureStateEntryRevisionById
    )
    nextCollection.dirtyGroupIds = changedFeatureIds
    nextCollection.orderChangedGroupIds = []
    nextCollection.removedGroupIds = []
    nextCollection.addedFeatureIdsInOrder = []
    nextCollection.updatedFeatureIdsInOrder = []
    nextCollection.removedFeatureIds = []
    nextCollection.removedFeatureIdsInOrder = []
    nextCollection.addedFeatures = []
    nextCollection.updatedFeatures = []
    dotFamilyState.collection = nextCollection
    Self.setDerivedFamilyState(dotFamilyState, sourceId: state.dotSourceId, state: &state)

    let plan = ParsedCollectionApplyPlan(
      sourceId: state.dotSourceId,
      next: nextCollection,
      previousSourceState: previousDotSourceState,
      previousFeatureStateById: previousDotSourceState.featureStateById,
      previousFeatureStateRevision: previousDotSourceState.featureStateRevision
    )
    return PreparedDerivedDotOutput(
      plans: [plan],
      dotSourceId: state.dotSourceId
    )
  }

  private func finalizePreparedDotOutput(
    instanceId: String,
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
    if dotMutationSummary.dataId == nil && !dotMutationSummary.addedFeatureIds.isEmpty {
      startAwaitingLiveDotTransitions(
        instanceId: instanceId,
        dataId: nil,
        reason: "baseline_source_replace",
        state: &state
      )
    }
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

  private func reconcileAndApplyLiveMarkerRoleOutputs(
    for instanceId: String,
    affectedMarkerKeys rawAffectedMarkerKeys: Set<String>,
    allowNewTransitions: Bool,
    allowDuringRecovery: Bool = false,
    reason: String
  ) throws {
    let attributionStartedAt = CACurrentMediaTime() * 1000
    guard var state = instances[instanceId] else {
      return
    }
    if Self.isVisualSourceInactiveOrDismissing(state) {
      cancelLivePinTransitionAnimation(instanceId: instanceId)
      instances[instanceId] = state
      return
    }
    if Self.isSourceRecoveryActive(state) && !allowDuringRecovery {
      cancelLivePinTransitionAnimation(instanceId: instanceId)
      instances[instanceId] = state
      return
    }
    let affectedMarkerKeys = rawAffectedMarkerKeys.filter { !$0.isEmpty }
    guard !affectedMarkerKeys.isEmpty else {
      instances[instanceId] = state
      return
    }

    let roleTable = state.markerRoleTable
    let desiredDots = Self.makeDesiredDotCollection(roleTable: roleTable)
    let pinFamilyState = Self.derivedFamilyState(sourceId: state.pinSourceId, state: state)
    let previousDesiredPinSnapshot = pinFamilyState.lastDesiredPinSnapshot
    let desiredPinSnapshot = Self.makeDesiredPinSnapshotState(
      roleTable: roleTable,
      previousSnapshot: previousDesiredPinSnapshot
    )
    let desiredMarkerFamilyPayloads = Self.makeDesiredMarkerFamilyPayloads(roleTable: roleTable)
    let nowMs = Self.nowMs()
    let shouldAnimateIncrementalTransitions = Self.allowsIncrementalMarkerTransitions(
      state,
      allowNewTransitions: allowNewTransitions
    )
    let pinTransitionStartedAt = CACurrentMediaTime() * 1000
    updateLivePinTransitions(
      state: &state,
      previousPinSnapshot: previousDesiredPinSnapshot,
      desiredPinSnapshot: desiredPinSnapshot,
      desiredPayloads: desiredMarkerFamilyPayloads,
      nowMs: nowMs,
      allowNewTransitions: shouldAnimateIncrementalTransitions,
      suppressSourceCommitAwait: reason == "native_lod"
    )
    recordNativeApply(
      section: "live_role.update_pin_transitions",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - pinTransitionStartedAt,
      operationCount: affectedMarkerKeys.count
    )
    let dotTransitionStartedAt = CACurrentMediaTime() * 1000
    updateLiveDotTransitions(
      state: &state,
      desiredDots: desiredDots,
      visibleDotMarkerKeys: Set(roleTable.dotMarkerKeysInOrder),
      nowMs: nowMs,
      allowNewTransitions: shouldAnimateIncrementalTransitions
    )
    recordNativeApply(
      section: "live_role.update_dot_transitions",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - dotTransitionStartedAt,
      operationCount: affectedMarkerKeys.count
    )

    guard let mapboxMap = try readyMapboxMap(
      for: state.mapTag,
      instanceId: instanceId,
      state: &state,
      sourceIds: visualAndInteractionSourceIds(for: state),
      reason: "live_marker_role_outputs"
    ) else {
      instances[instanceId] = state
      return
    }

    let activePinTransitionKeys =
      Set(Self.derivedFamilyState(sourceId: state.pinSourceId, state: state).livePinTransitionsByMarkerKey.keys)
    let activeDotTransitionKeys =
      Set(Self.derivedFamilyState(sourceId: state.dotSourceId, state: state).liveDotTransitionsByMarkerKey.keys)
    let scopedPinKeys = affectedMarkerKeys.union(activePinTransitionKeys.intersection(affectedMarkerKeys))
    let scopedDotKeys = affectedMarkerKeys.union(activeDotTransitionKeys.intersection(affectedMarkerKeys))

    // SNAP DETECTOR (lod_snap_contract): catches the demotion flash that the
    // transition-only contract (live_lod_transition_contract) is blind to. A marker
    // whose promoted/demoted role FLIPPED this reconcile but for which NO live
    // transition exists afterward changed its opacity with no crossfade — it snapped.
    // Fires regardless of transition count (the transition contract only emits when
    // transitions exist, so it reads 0 precisely when the bug is worst). After the
    // fix every role flip yields a transition → silent*FlipCount == 0.
    let previousPromotedKeys = Set(previousDesiredPinSnapshot.pinIdsInOrder)
    let nextPromotedKeys = Set(desiredPinSnapshot.pinIdsInOrder)
    let roleFlipKeys = previousPromotedKeys
      .symmetricDifference(nextPromotedKeys)
      .intersection(affectedMarkerKeys)
    if !roleFlipKeys.isEmpty {
      let silentPinFlipKeys = roleFlipKeys.subtracting(activePinTransitionKeys)
      let silentDotFlipKeys = roleFlipKeys.subtracting(activeDotTransitionKeys)
      emit([
        "type": "lod_snap_contract",
        "instanceId": instanceId,
        "reason": reason,
        "roleFlipCount": roleFlipKeys.count,
        "silentPinFlipCount": silentPinFlipKeys.count,
        "silentDotFlipCount": silentDotFlipKeys.count,
        "pinTransitionCreatedCount": roleFlipKeys.intersection(activePinTransitionKeys).count,
        "dotTransitionCreatedCount": roleFlipKeys.intersection(activeDotTransitionKeys).count,
        "allowNewTransitions": shouldAnimateIncrementalTransitions,
        "emittedAtMs": Self.nowMs(),
      ])
    }

    let pinOutputStartedAt = CACurrentMediaTime() * 1000
    let preparedPinAndLabelOutput = try prepareScopedPinAndLabelOutput(
      instanceId: instanceId,
      affectedMarkerKeys: scopedPinKeys,
      state: &state
    )
    recordNativeApply(
      section: "live_role.prepare_pin_label_output",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - pinOutputStartedAt,
      operationCount: scopedPinKeys.count
    )
    let dotOutputStartedAt = CACurrentMediaTime() * 1000
    let preparedDotOutput = try prepareScopedDotOutput(
      affectedMarkerKeys: scopedDotKeys,
      desiredDots: desiredDots,
      nowMs: nowMs,
      state: &state
    )
    recordNativeApply(
      section: "live_role.prepare_dot_output",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - dotOutputStartedAt,
      operationCount: scopedDotKeys.count
    )
    let batchStartedAt = CACurrentMediaTime() * 1000
    let mutationSummaryBySourceId = try applyParsedCollectionBatch(
      instanceId: instanceId,
      plans: preparedPinAndLabelOutput.plans + preparedDotOutput.plans,
      state: &state,
      mapboxMap: mapboxMap
    )
    recordNativeApply(
      section: "live_role.apply_parsed_batch",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - batchStartedAt,
      operationCount: preparedPinAndLabelOutput.plans.count + preparedDotOutput.plans.count
    )
    finalizePreparedPinAndLabelOutput(
      instanceId: instanceId,
      prepared: preparedPinAndLabelOutput,
      mutationSummaryBySourceId: mutationSummaryBySourceId,
      state: &state
    )
    finalizePreparedDotOutput(
      instanceId: instanceId,
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
    maybeElectMountedHiddenExecutionBatch(instanceId: instanceId, state: &state)
    instances[instanceId] = state
    updateLivePinTransitionAnimation(instanceId: instanceId, state: state)
    recordNativeApply(
      section: "live_role.total",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - attributionStartedAt,
      operationCount: affectedMarkerKeys.count
    )
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "live_role_outputs_applied reason=\(reason) affected=\(affectedMarkerKeys.count) plans=\(preparedPinAndLabelOutput.plans.count + preparedDotOutput.plans.count)"
    )
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
    // RESIDENT LOD: "present" pins (which drive targetOpacity → visible) are the PROMOTED
    // ones (nativeLodOpacity > 0), NOT all resident pin members. Demoted resident pins
    // (opacity 0) stay in the source for the crossfade but must read as absent so they fade
    // to / stay at 0 rather than rendering at full.
    let promotedPinIdsInOrder = desiredPins.idsInOrder.filter { markerKey in
      let opacity =
        Self.numberValue(from: desiredPins.featureStateById[markerKey]?["nativeLodOpacity"]) ??
        Self.numberValue(
          from: (desiredPins.featureById[markerKey]?.properties?.turfRawValue as? [String: Any])?["nativeLodOpacity"]
        )
      return (opacity ?? 1) > 0.001
    }
    snapshot.pinIdsInOrder = promotedPinIdsInOrder
    let nextPinMarkerKeys = Set(promotedPinIdsInOrder)
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

  private static func makeDesiredPinSnapshotState(
    roleTable: MarkerRoleTable,
    previousSnapshot: DesiredPinSnapshotState? = nil
  ) -> DesiredPinSnapshotState {
    var snapshot = previousSnapshot ?? DesiredPinSnapshotState()
    snapshot.pinIdsInOrder = roleTable.pinnedMarkerKeysInOrder
    let nextPinMarkerKeys = Set(roleTable.pinnedMarkerKeysInOrder)
    var inputHash = fnv1a64OffsetBasis
    Self.fnv1a64Append(&inputHash, string: "roleTablePins")
    Self.fnv1a64Append(&inputHash, string: String(roleTable.pinnedMarkerKeysInOrder.count))

    for (index, markerKey) in roleTable.pinnedMarkerKeysInOrder.enumerated() {
      guard let row = roleTable.rowByMarkerKey[markerKey], row.role == "pin" else {
        continue
      }
      let pinRevision = row.pinFeature?.diffKey ?? ""
      snapshot.pinFeatureRevisionByMarkerKey[markerKey] = pinRevision
      if let pinInteractionRevision = row.pinInteractionFeature?.diffKey {
        snapshot.pinInteractionFeatureRevisionByMarkerKey[markerKey] = pinInteractionRevision
      } else {
        snapshot.pinInteractionFeatureRevisionByMarkerKey.removeValue(forKey: markerKey)
      }
      let fallbackLodZ = max(0, roleTable.pinnedMarkerKeysInOrder.count - 1 - index)
      snapshot.pinLodZByMarkerKey[markerKey] =
        row.slotIndex ??
        row.pinFeature.map { Self.slotIndex(from: $0.feature) } ??
        fallbackLodZ

      var labelHash = fnv1a64OffsetBasis
      Self.fnv1a64Append(&labelHash, string: markerKey)
      Self.fnv1a64Append(&labelHash, string: String(row.labelFeatures.count))
      for record in row.labelFeatures {
        Self.fnv1a64Append(&labelHash, string: record.id)
        Self.fnv1a64Append(&labelHash, string: record.diffKey)
      }
      snapshot.labelFeatureRevisionByMarkerKey[markerKey] =
        Self.finishHashedRevision(hash: labelHash, count: row.labelFeatures.count)
      if let labelCollisionRevision = row.labelCollisionFeature?.diffKey {
        snapshot.labelCollisionFeatureRevisionByMarkerKey[markerKey] = labelCollisionRevision
      } else {
        snapshot.labelCollisionFeatureRevisionByMarkerKey.removeValue(forKey: markerKey)
      }

      Self.fnv1a64Append(&inputHash, string: markerKey)
      Self.fnv1a64Append(&inputHash, string: pinRevision)
      Self.fnv1a64Append(&inputHash, string: String(snapshot.pinLodZByMarkerKey[markerKey] ?? 0))
      Self.fnv1a64Append(&inputHash, string: snapshot.labelFeatureRevisionByMarkerKey[markerKey] ?? "")
      Self.fnv1a64Append(&inputHash, string: snapshot.labelCollisionFeatureRevisionByMarkerKey[markerKey] ?? "")
    }

    for removedMarkerKey in Set(snapshot.pinFeatureRevisionByMarkerKey.keys).subtracting(nextPinMarkerKeys) {
      snapshot.pinFeatureRevisionByMarkerKey.removeValue(forKey: removedMarkerKey)
    }
    for removedMarkerKey in Set(snapshot.pinInteractionFeatureRevisionByMarkerKey.keys).subtracting(nextPinMarkerKeys) {
      snapshot.pinInteractionFeatureRevisionByMarkerKey.removeValue(forKey: removedMarkerKey)
    }
    for removedMarkerKey in Set(snapshot.pinLodZByMarkerKey.keys).subtracting(nextPinMarkerKeys) {
      snapshot.pinLodZByMarkerKey.removeValue(forKey: removedMarkerKey)
    }
    for removedMarkerKey in Set(snapshot.labelFeatureRevisionByMarkerKey.keys).subtracting(nextPinMarkerKeys) {
      snapshot.labelFeatureRevisionByMarkerKey.removeValue(forKey: removedMarkerKey)
    }
    for removedMarkerKey in Set(snapshot.labelCollisionFeatureRevisionByMarkerKey.keys).subtracting(nextPinMarkerKeys) {
      snapshot.labelCollisionFeatureRevisionByMarkerKey.removeValue(forKey: removedMarkerKey)
    }
    snapshot.inputRevision = Self.finishHashedRevision(
      hash: inputHash,
      count: roleTable.pinnedMarkerKeysInOrder.count
    )
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
      if let diffKey = desiredPins.diffKeyById[markerKey] {
        payloads.pinFeatureDiffKeyByMarkerKey[markerKey] = diffKey
      }
    }
    for markerKey in desiredPinInteractions.idsInOrder {
      guard let feature = desiredPinInteractions.featureById[markerKey] else {
        continue
      }
      payloads.pinInteractionFeatureByMarkerKey[markerKey] = feature
      if let diffKey = desiredPinInteractions.diffKeyById[markerKey] {
        payloads.pinInteractionFeatureDiffKeyByMarkerKey[markerKey] = diffKey
      }
    }
    for featureId in desiredLabels.idsInOrder {
      guard let feature = desiredLabels.featureById[featureId] else {
        continue
      }
      let markerKey = desiredLabels.markerKeyByFeatureId[featureId] ?? featureId
      payloads.labelFeaturesByMarkerKey[markerKey, default: []].append((
        id: featureId,
        feature: feature,
        diffKey: desiredLabels.diffKeyById[featureId] ?? featureId
      ))
    }
    for featureId in desiredLabelCollisions.idsInOrder {
      guard let feature = desiredLabelCollisions.featureById[featureId] else {
        continue
      }
      let markerKey = desiredLabelCollisions.markerKeyByFeatureId[featureId] ?? featureId
      payloads.labelCollisionFeatureByMarkerKey[markerKey] = feature
      if let diffKey = desiredLabelCollisions.diffKeyById[featureId] {
        payloads.labelCollisionFeatureDiffKeyByMarkerKey[markerKey] = diffKey
      }
    }
    return payloads
  }

  private static func makeDesiredMarkerFamilyPayloads(
    roleTable: MarkerRoleTable
  ) -> DesiredMarkerFamilyPayloads {
    var payloads = DesiredMarkerFamilyPayloads()
    for markerKey in roleTable.pinnedMarkerKeysInOrder {
      guard let row = roleTable.rowByMarkerKey[markerKey], row.role == "pin" else {
        continue
      }
      if let pinFeature = row.pinFeature {
        payloads.pinFeatureByMarkerKey[markerKey] = pinFeature.feature
        payloads.pinFeatureDiffKeyByMarkerKey[markerKey] = pinFeature.diffKey
      }
      if let pinInteractionFeature = row.pinInteractionFeature {
        payloads.pinInteractionFeatureByMarkerKey[markerKey] = pinInteractionFeature.feature
        payloads.pinInteractionFeatureDiffKeyByMarkerKey[markerKey] = pinInteractionFeature.diffKey
      }
      payloads.labelFeaturesByMarkerKey[markerKey] =
        row.labelFeatures.map { (id: $0.id, feature: $0.feature, diffKey: $0.diffKey) }
      if let labelCollisionFeature = row.labelCollisionFeature {
        payloads.labelCollisionFeatureByMarkerKey[markerKey] = labelCollisionFeature.feature
        payloads.labelCollisionFeatureDiffKeyByMarkerKey[markerKey] = labelCollisionFeature.diffKey
      }
    }
    return payloads
  }

  private static func makeDesiredDotCollection(
    roleTable: MarkerRoleTable
  ) -> ParsedFeatureCollection {
    var dotRecords: [ParsedTransportFeatureRecord] = []
    let residentDotMarkerKeys =
      roleTable.residentDotMarkerKeysInOrder.isEmpty
        ? roleTable.dotMarkerKeysInOrder
        : roleTable.residentDotMarkerKeysInOrder
    dotRecords.reserveCapacity(residentDotMarkerKeys.count)
    for markerKey in residentDotMarkerKeys {
      guard let row = roleTable.rowByMarkerKey[markerKey] else {
        continue
      }
      if let dotFeature = row.dotFeature {
        dotRecords.append(dotFeature)
      }
    }
    return Self.makeParsedFeatureCollection(records: dotRecords)
  }

  private static func visibleDotMarkerKeys(from desiredDots: ParsedFeatureCollection) -> Set<String> {
    Set(
      desiredDots.idsInOrder.filter { markerKey in
        let explicitOpacity =
          Self.numberValue(from: desiredDots.featureStateById[markerKey]?["nativeDotOpacity"]) ??
          Self.numberValue(
            from: (desiredDots.featureById[markerKey]?.properties?.turfRawValue as? [String: Any])?["nativeDotOpacity"]
          )
        return (explicitOpacity ?? 1) > 0.001
      }
    )
  }

  private static func labelFeatureCount(roleTable: MarkerRoleTable) -> Int {
    roleTable.pinnedMarkerKeysInOrder.reduce(0) { total, markerKey in
      total + (roleTable.rowByMarkerKey[markerKey]?.labelFeatures.count ?? 0)
    }
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

  private func startEnterPresentationIfReady(
    instanceId: String,
    state: inout InstanceState,
    previousPresentationBatchPhase: String? = nil,
    previousPresentationOpacityTarget: Double? = nil
  ) {
    guard let presentationStateJSON = state.lastPresentationStateJSON else {
      return
    }
    let revealStatus = Self.readEnterStatus(fromJSON: presentationStateJSON)
    let revealStartToken = Self.readEnterStartToken(fromJSON: presentationStateJSON)
    guard
      let revealRequestKey = state.lastEnterRequestKey,
      let revealStartToken,
      revealStatus == "entering",
      state.lastPresentationBatchPhase == "entering",
      state.enterLane.requestedRequestKey == revealRequestKey,
      state.enterLane.mountedHidden != nil,
      state.lastEnterStartToken != revealStartToken,
      state.lastEnterStartedRequestKey != revealRequestKey,
      state.blockedEnterStartRequestKey == nil,
      Self.isActiveFrameSourceReady(state: state),
      !hasPendingCommitFence(capturePendingVisualSourceCommitFence(state: state)),
      Self.isActiveFrameLabelPlacementReady(state: state)
    else {
      return
    }
    do {
      let enterStartedAt = CACurrentMediaTime() * 1000
      try startEnterPresentation(
        instanceId: instanceId,
        requestKey: revealRequestKey,
        revealStartToken: revealStartToken,
        previousPresentationBatchPhase: previousPresentationBatchPhase,
        previousPresentationOpacityTarget: previousPresentationOpacityTarget
      )
      state = instances[instanceId] ?? state
      recordNativeApply(
        section: "presentation.start_enter",
        phase: state.lastPresentationBatchPhase,
        durationMs: CACurrentMediaTime() * 1000 - enterStartedAt
      )
    } catch {
      emit([
        "type": "error",
        "instanceId": instanceId,
        "message": "reveal_start_opacity_apply_failed: \(error.localizedDescription)",
      ])
      state = instances[instanceId] ?? state
    }
  }

  // REVEAL-START DEADLOCK GUARD (safety net, NOT a bypass): a non-camera watchdog (armed in
  // `armRevealStartDeadlockFallback`) RE-ATTEMPTS label placement if the label-placement gate
  // has not opened by its deadline. The deadlock it guards against: the observation-enable
  // bridge call (`configureLabelObservation`) can land while native is still `.hidden`, hit the
  // `!canRefreshRenderedLabels` branch, cancel the refresh work item and schedule NOTHING — so
  // no observation ever commits, the gate (`isActiveFrameLabelPlacementReady`) never opens, and
  // the single presentation-opacity animation (shared by pins/dots/labels) stays at preroll
  // (~0). The primary fix re-schedules the refresh in `beginRevealVisualLifecycle` the moment we
  // wake the layers; this watchdog is the safety net for the case where that re-schedule itself
  // failed to land a committed observation (e.g. the layers had not finished layout, leaving no
  // armed work item). It re-wakes the dormant label render layers and re-schedules the refresh
  // from the last-known config, then re-arms itself, up to `revealStartDeadlockMaxReattempts`.
  // It NEVER bypasses the gate and NEVER starts the reveal with unplaced pins — labels are
  // placed/locked first, exactly as designed. If the bound is exhausted it emits a loud
  // diagnostic so the deeper bug surfaces and leaves the reveal gated (the camera-move rescue
  // remains a last resort). The watchdog is cancelled the moment a normal reveal start lands
  // (see `startEnterPresentation`) or a dismiss supersedes the reveal.
  private func reattemptLabelPlacementIfRevealStalled(instanceId: String) {
    guard var state = instances[instanceId] else {
      return
    }
    // Stop entirely if the reveal is no longer pending: already started, superseded by a
    // dismiss, or the source is inactive/dismissing. Nothing to re-attempt.
    guard
      let revealRequestKey = state.lastEnterRequestKey,
      state.lastPresentationBatchPhase == "entering",
      state.lastEnterStartedRequestKey != revealRequestKey,
      state.lastDismissRequestKey == nil,
      !Self.isVisualSourceInactiveOrDismissing(state)
    else {
      revealStartDeadlockFallbackWorkItems[instanceId]?.cancel()
      revealStartDeadlockFallbackWorkItems[instanceId] = nil
      revealStartDeadlockReattemptCountByInstance[instanceId] = nil
      return
    }
    // If the label gate is already satisfied, the normal commit path will (or already did)
    // start the reveal via `startEnterPresentationIfReady` — nothing to re-attempt.
    guard !Self.isActiveFrameLabelPlacementReady(state: state) else {
      revealStartDeadlockFallbackWorkItems[instanceId]?.cancel()
      revealStartDeadlockFallbackWorkItems[instanceId] = nil
      revealStartDeadlockReattemptCountByInstance[instanceId] = nil
      return
    }
    let attempt = (revealStartDeadlockReattemptCountByInstance[instanceId] ?? 0) + 1
    revealStartDeadlockReattemptCountByInstance[instanceId] = attempt
    if attempt > revealStartDeadlockMaxReattempts {
      // SAFETY-NET EXHAUSTED: placement still has not committed. Do NOT start the reveal with
      // unplaced pins — surface the deeper bug loudly and leave the reveal gated. The
      // camera-move rescue (`handleNativeCameraChanged`) remains the last resort.
      revealStartDeadlockFallbackWorkItems[instanceId]?.cancel()
      revealStartDeadlockFallbackWorkItems[instanceId] = nil
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "reveal_start_deadlock_placement_uncommitted request=\(revealRequestKey) attempts=\(attempt - 1) \(Self.labelPlacementReadinessSummary(state: state))"
      )
      emit([
        "type": "presentation_reveal_start_deadlock_placement_uncommitted",
        "instanceId": instanceId,
        "requestKey": revealRequestKey,
        "frameGenerationId": state.activeFrameGenerationId as Any,
        "pinCount": state.lastPinCount,
        "dotCount": state.lastDotCount,
        "labelCount": state.lastLabelCount,
        "attempts": attempt - 1,
        "emittedAtMs": Self.nowMs(),
      ])
      return
    }
    // RE-ATTEMPT placement: re-wake the dormant label render layers (idempotent — they should
    // already be visible from `beginRevealVisualLifecycle`, but a dropped/failed wake is exactly
    // the failure mode here) and re-schedule the observation refresh from the last-known config.
    // The refresh path's own 16ms self-retry (`retryLabelObservationRefreshIfPlacementPending`)
    // absorbs the query-after-wake layout delay; this watchdog only re-primes it if it stalled.
    if !state.labelCollisionObstacleLayersVisible {
      setLabelCollisionObstacleLayersVisible(
        true,
        for: state,
        instanceId: instanceId,
        reason: "reveal_deadlock_reattempt"
      )
      state.labelCollisionObstacleLayersVisible = true
    }
    setLabelRenderLayersVisible(
      true,
      for: state,
      instanceId: instanceId,
      reason: "reveal_deadlock_reattempt"
    )
    instances[instanceId] = state
    let labelObservation = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state).labelObservation
    if labelObservation.observationEnabled {
      scheduleLabelObservationRefresh(instanceId: instanceId, delayMs: 0)
    }
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "reveal_start_deadlock_placement_reattempt request=\(revealRequestKey) attempt=\(attempt) \(Self.labelPlacementReadinessSummary(state: state))"
    )
    // Re-arm the watchdog for the next cadence tick so we keep re-priming until the gate opens
    // or the attempt bound is reached.
    armRevealStartDeadlockFallback(instanceId: instanceId, requestKey: revealRequestKey)
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
      let mountedHiddenExecutionBatch = state.enterLane.mountedHidden
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
    guard Self.isActiveFrameSourceReady(state: state) else {
      return
    }
    // The label-placement gate is INTENTIONAL: on reveal the labels must be placed/locked
    // BEFORE pins/dots fade in. It is never bypassed — the reveal only starts once a real
    // observation has committed. The deadlock guard makes placement reliably COMMIT (it
    // re-attempts placement), it does not relax this gate.
    guard Self.isActiveFrameLabelPlacementReady(state: state) else {
      return
    }
    state.blockedEnterStartRequestKey = nil
    state.blockedEnterStartCommitFenceStartedAtMs = nil
    state.blockedEnterStartCommitFenceBySourceId.removeAll()
    // The reveal is starting via the gate — cancel the deadlock placement-reattempt watchdog
    // and clear its attempt counter so it can never fire after a real start.
    revealStartDeadlockFallbackWorkItems[instanceId]?.cancel()
    revealStartDeadlockFallbackWorkItems[instanceId] = nil
    revealStartDeadlockReattemptCountByInstance[instanceId] = nil
    state.lastEnterStartToken = revealStartToken
    state.enterLane.entering = mountedHiddenExecutionBatch
    state.currentPresentationRenderPhase = "entering"
    state.visualSourceLifecycleState = .revealing
    restartLiveEnterTransitionsForRevealStart(instanceId: instanceId, state: &state)
    instances[instanceId] = state
    updateLivePinTransitionAnimation(instanceId: instanceId, state: state)
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
    guard var state = instances[instanceId], state.lastDismissRequestKey == requestKey else {
      return
    }
    guard state.visualSourceLifecycleState == .hidden ||
      (
        state.currentPresentationOpacityTarget <= 0.001 &&
          state.currentPresentationOpacityValue <= 0.001
      )
    else {
      armNativeDismissSettle(instanceId: instanceId, requestKey: requestKey)
      return
    }
    dismissFrameFallbackWorkItems[instanceId]?.cancel()
    dismissFrameFallbackWorkItems[instanceId] = nil
    state.pendingPresentationSettleRequestKey = nil
    state.pendingPresentationSettleKind = nil
    state.blockedPresentationSettleRequestKey = nil
    state.blockedPresentationSettleKind = nil
    state.blockedPresentationCommitFenceStartedAtMs = nil
    state.blockedPresentationCommitFenceBySourceId.removeAll()
    if state.visualSourceLifecycleState != .hidden {
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

  private func clearResidentSourcesAndTransientFeatureStates(for state: InstanceState) throws {
    try withMapboxMap(for: state.mapTag) { mapboxMap in
      let sourceIds = visualAndInteractionSourceIds(for: state)
      let emptyCollection = FeatureCollection(features: [])
      for sourceId in sourceIds {
        mapboxMap.updateGeoJSONSource(
          withId: sourceId,
          geoJSON: .featureCollection(emptyCollection)
        )
      }
      Self.clearKnownFeatureStates(
        sourceIds: sourceIds,
        state: state,
        mapboxMap: mapboxMap
      )
    }
  }

  private static func clearDismissedHighlightState(_ state: inout InstanceState) {
    state.highlightedMarkerKey = nil
    state.highlightedMarkerKeys = []
    state.highlightedRestaurantId = nil
  }

  private func clearHiddenResidentSourceState(
    instanceId: String,
    state: inout InstanceState,
    reason: String
  ) throws {
    try clearResidentSourcesAndTransientFeatureStates(for: state)
    Self.clearDismissedHighlightState(&state)
    state.pendingSourceCommitDataIdsBySourceId.removeAll(keepingCapacity: true)
    state.blockedEnterStartCommitFenceBySourceId.removeAll(keepingCapacity: true)
    state.blockedPresentationCommitFenceBySourceId.removeAll(keepingCapacity: true)
    state.residentSourceFrameKey = nil
    state.residentSourceDataKey = nil
    state.derivedFamilyStates = Self.makeInitialDerivedFamilyStates(
      pinSourceId: state.pinSourceId,
      pinInteractionSourceId: state.pinInteractionSourceId,
      dotSourceId: state.dotSourceId,
      labelSourceId: state.labelSourceId,
      labelCollisionSourceId: state.labelCollisionSourceId
    )
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "hidden_source_payload_dropped reason=\(reason) request=\(state.lastDismissRequestKey ?? "nil") frame=\(state.activeFrameGenerationId ?? "nil")"
    )
  }

  private func resetLabelObservationForDismissStart(
    instanceId: String,
    state: inout InstanceState,
    reason: String
  ) {
    labelObservationRefreshWorkItems[instanceId]?.cancel()
    labelObservationRefreshWorkItems[instanceId] = nil

    var labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    labelFamilyState.settledVisibleFeatureIds.removeAll()
    labelFamilyState.labelObservation.lastVisibleLabelFeatureIds = []
    labelFamilyState.labelObservation.lastLayerRenderedFeatureCount = 0
    labelFamilyState.labelObservation.lastEffectiveRenderedFeatureCount = 0
    labelFamilyState.labelObservation.settledVisibleMissingStreakByFeatureId.removeAll()
    labelFamilyState.labelObservation.isRefreshInFlight = false
    labelFamilyState.labelObservation.queuedRefreshDelayMs = nil
    Self.setDerivedFamilyState(labelFamilyState, sourceId: state.labelSourceId, state: &state)
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
    let collisionRestoreStartedAt = CACurrentMediaTime() * 1000
    setLabelCollisionObstacleLayersVisible(
      true,
      for: state,
      instanceId: instanceId,
      reason: "reveal_preroll"
    )
    state.labelCollisionObstacleLayersVisible = true
    // Wake the resident label render layers (dormant via visibility:none while hidden). This
    // happens at reveal preroll while presentation opacity is still ~0, so it is flash-free.
    setLabelRenderLayersVisible(true, for: state, instanceId: instanceId, reason: "reveal_preroll")
    recordNativeApply(
      section: "presentation.reveal_preroll_collision_restore",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - collisionRestoreStartedAt,
      operationCount: state.labelCollisionLayerIds.count + state.labelLayerIds.count
    )
    state.visualSourceLifecycleState = .preparingReveal
    state.keepSourcesHiddenUntilEnter = false
    state.currentPresentationRenderPhase = "reveal_preroll"
    state.currentPresentationOpacityTarget = revealPrerollPlacementOpacity
    state.currentPresentationOpacityValue = revealPrerollPlacementOpacity
    // REVEAL-START DEADLOCK GUARD (primary): the observation-enable bridge call
    // (`configureLabelObservation`) can arrive while we are still `.hidden` — before this
    // transition flips us to `.preparingReveal` and wakes the dormant label render layers.
    // In that case the enable hit the `!canRefreshRenderedLabels` branch, cancelled the
    // refresh work item, and scheduled nothing, so the placement gate
    // (`isActiveFrameLabelPlacementReady`) could never open and the SINGLE presentation
    // opacity animation (shared by pins/dots/labels) stayed at preroll (~0). The label
    // observation config (observationEnabled / commitVisibleLabelHits / refresh cadence /
    // reset key) survives the dismiss/reset above, so now that the state can refresh and
    // the render layers were woken (`setLabelRenderLayersVisible(true)` ran a few lines up,
    // BEFORE this), re-arm the refresh from that last-known config. The self-retry
    // (`retryLabelObservationRefreshIfPlacementPending`, delayMs:16) inside the refresh path
    // then absorbs the query-after-wake layout delay (returns 0 until layout completes).
    let labelObservation = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state).labelObservation
    if labelObservation.observationEnabled {
      // Persist the `.preparingReveal` state before scheduling so the refresh path's
      // `isVisualSourceInactiveOrDismissing` guard reads the woken state, not `.hidden`.
      instances[instanceId] = state
      scheduleLabelObservationRefresh(instanceId: instanceId, delayMs: 0)
      state = instances[instanceId] ?? state
      emitVisualDiag(
        instanceId: instanceId,
        message:
          "reveal_preroll_label_observation_rearmed reason=\(reason) \(Self.labelPlacementReadinessSummary(state: state))"
      )
    }
    // Arm the non-camera safety watchdog that RE-ATTEMPTS placement (re-wakes layers +
    // re-schedules the observation refresh) if the label-placement gate never opens — it does
    // NOT force-start the reveal. Cancelled the instant a normal reveal start lands. Only
    // meaningful when there are labels to gate on; an empty/label-free frame is never blocked
    // by the label gate (`isActiveFrameLabelPlacementReady` returns true for labelCount==0).
    if let revealRequestKey = state.lastEnterRequestKey {
      armRevealStartDeadlockFallback(
        instanceId: instanceId,
        requestKey: revealRequestKey,
        resetAttemptCount: true
      )
    }
  }

  private func beginDismissVisualLifecycle(
    instanceId: String,
    state: inout InstanceState
  ) {
    // A dismiss supersedes any in-flight reveal — cancel the reveal-start deadlock watchdog
    // and clear its attempt counter so it can never re-attempt after we begin dismissing.
    revealStartDeadlockFallbackWorkItems[instanceId]?.cancel()
    revealStartDeadlockFallbackWorkItems[instanceId] = nil
    revealStartDeadlockReattemptCountByInstance[instanceId] = nil
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
      operationCount: state.labelCollisionLayerIds.count
    )
    resetLabelObservationForDismissStart(
      instanceId: instanceId,
      state: &state,
      reason: "dismiss_start"
    )
    state.keepSourcesHiddenUntilEnter = true
    state.currentPresentationRenderPhase = "exiting"
    state.visualSourceLifecycleState = .dismissing
    state.currentPresentationOpacityTarget = 0
  }

  private func completeDismissVisualLifecycle(
    instanceId: String,
    state: inout InstanceState,
    requestKey: String?,
    reason: String
  ) {
    labelObservationRefreshWorkItems[instanceId]?.cancel()
    labelObservationRefreshWorkItems[instanceId] = nil
    // RESIDENT-DATA + DORMANT-LAYERS end state: do NOT clear the marker sources on dismiss.
    // The pin/dot/label features stay resident in the Mapbox sources (instant re-reveal, no
    // cache/clear/restore dance, crossfade-from-old-data, trivial interruption). The reveal cost
    // that the restore used to pay disappears with it. Idle cost is removed by making the only
    // expensive per-frame work — the collision-bearing label symbols — dormant via
    // `visibility: none` (Mapbox drops a hidden layer from layout/placement entirely). Pins/dots
    // are ignorePlacement, so they cost ~nothing resident at opacity 0. Camera projection,
    // steppers, and label observation are all already gated off in `.hidden`. No source cache is
    // populated, so the enter-time restore naturally no-ops.
    let labelDormancyStartedAt = CACurrentMediaTime() * 1000
    if state.labelCollisionObstacleLayersVisible {
      setLabelCollisionObstacleLayersVisible(
        false,
        for: state,
        instanceId: instanceId,
        reason: reason
      )
      state.labelCollisionObstacleLayersVisible = false
    }
    // NOTE: the label RENDER layers are intentionally NOT dormed to visibility:none here.
    // Doing so deadlocked the reveal: the reveal-start gate (isActiveFrameLabelPlacementReady)
    // queries queryRenderedFeatures over labelLayerIds, which returns 0 on a hidden / just-woken
    // layer — so the gate never opened and the whole reveal (pins+dots+labels share one opacity
    // animation) hung at ~0 opacity until a camera move. The label layers stay laid-out/queryable
    // (opacity-gated to 0 when hidden via nativeLabelOpacity), so placement always commits and the
    // gate opens reliably. Idle label-collision cost is the tradeoff; reclaim it later by placing
    // labels under cover (enter_mounted_hidden) BEFORE the visible reveal, not via layer dormancy.
    Self.clearDismissedHighlightState(&state)
    recordNativeApply(
      section: "presentation.hidden_marker_layer_dormancy",
      phase: state.lastPresentationBatchPhase,
      durationMs: CACurrentMediaTime() * 1000 - labelDormancyStartedAt,
      operationCount: state.labelLayerIds.count + state.labelCollisionLayerIds.count
    )
    state.pendingSourceCommitDataIdsBySourceId = [:]
    state.blockedEnterStartCommitFenceBySourceId.removeAll(keepingCapacity: true)
    state.blockedPresentationCommitFenceBySourceId.removeAll(keepingCapacity: true)
    state.currentPresentationRenderPhase = "idle"
    state.visualSourceLifecycleState = .hidden
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
        "visual_sources_hidden reason=\(reason) frame=\(state.activeFrameGenerationId ?? "nil") pins=\(state.lastPinCount) dots=\(state.lastDotCount) labels=\(state.lastLabelCount)"
    )
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

  private func setLabelCollisionObstacleLayersVisible(
    _ isVisible: Bool,
    for state: InstanceState,
    instanceId: String,
    reason: String
  ) {
    do {
      try withMapboxMap(for: state.mapTag) { mapboxMap in
        for layerId in state.labelCollisionLayerIds {
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

  /// Dormant-layers idle switch for the visible label (text) render layers. In the resident
  /// end state the marker SOURCES stay populated across dismiss; idle cost is removed by making
  /// the collision-bearing label symbols dormant via `visibility: none` (Mapbox drops a hidden
  /// layer from the layout/placement pipeline entirely — unlike opacity 0). Pins/dots are
  /// `ignorePlacement` so they cost ~nothing resident at opacity 0 and need no toggle. Mirrors
  /// `setLabelCollisionObstacleLayersVisible`.
  private func setLabelRenderLayersVisible(
    _ isVisible: Bool,
    for state: InstanceState,
    instanceId: String,
    reason: String
  ) {
    do {
      try withMapboxMap(for: state.mapTag) { mapboxMap in
        for layerId in state.labelLayerIds {
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
                "label_render_layer_visibility_failed reason=\(reason) layer=\(layerId) visible=\(isVisible) error=\(error.localizedDescription)",
            ])
          }
        }
      }
    } catch {
      emit([
        "type": "error",
        "instanceId": instanceId,
        "message":
          "label_render_layer_visibility_failed reason=\(reason) visible=\(isVisible) error=\(error.localizedDescription)",
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
    guard state.visualSourceLifecycleState == .hidden,
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
    // RESIDENT-DATA end state: there is no deferred SOURCE clear anymore — the marker sources
    // stay resident across dismiss and the label-layer dormancy already happened at settle in
    // completeDismissVisualLifecycle. This deferred pass is now a no-op (kept only so any
    // in-flight scheduled work item resolves cleanly).
    emitVisualDiag(
      instanceId: instanceId,
      message:
        "deferred_dismiss_source_cleanup_noop_resident reason=\(reason) request=\(requestKey) frame=\(state.activeFrameGenerationId ?? "nil")"
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

  private func updateLivePinTransitions(
    state: inout InstanceState,
    previousPinSnapshot: DesiredPinSnapshotState,
    desiredPinSnapshot: DesiredPinSnapshotState,
    desiredPayloads: DesiredMarkerFamilyPayloads,
    nowMs: Double,
    allowNewTransitions: Bool,
    // SNAP FIX: when the LOD change is native-driven on a RESIDENT source (driveNativeLod —
    // opacity-only, the pin feature is already present), a promoting pin must NOT wait for a
    // source commit (there is none during a pan). Awaiting deferred every fade-in to the next
    // source commit at settle = "pins snap in after the gesture." Suppress the await here.
    suppressSourceCommitAwait: Bool = false
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
      let pinFeatureDiffKey =
        desiredPayloads.pinFeatureDiffKeyByMarkerKey[markerKey] ??
        existingRenderState?.pinFeatureDiffKey ??
        markerKey
      let payloadPinInteraction =
        desiredPayloads.pinInteractionFeatureByMarkerKey[markerKey] ??
        existingRenderState?.pinInteractionFeature
      let payloadPinInteractionDiffKey =
        desiredPayloads.pinInteractionFeatureDiffKeyByMarkerKey[markerKey] ??
        existingRenderState?.pinInteractionFeatureDiffKey
      let payloadLabelFeatures =
        desiredPayloads.labelFeaturesByMarkerKey[markerKey] ??
        existingRenderState?.labelFeatures ??
        []
      let payloadLabelCollision =
        desiredPayloads.labelCollisionFeatureByMarkerKey[markerKey] ??
        existingRenderState?.labelCollisionFeature
      let payloadLabelCollisionDiffKey =
        desiredPayloads.labelCollisionFeatureDiffKeyByMarkerKey[markerKey] ??
        existingRenderState?.labelCollisionFeatureDiffKey
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
          pinFeatureDiffKey: pinFeatureDiffKey,
          pinInteractionFeature: payloadPinInteraction,
          pinInteractionFeatureDiffKey: payloadPinInteractionDiffKey,
          labelFeatures: payloadLabelFeatures,
          labelCollisionFeature: payloadLabelCollision,
          labelCollisionFeatureDiffKey: payloadLabelCollisionDiffKey,
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
          nextTransitions.removeValue(forKey: markerKey)
          continue
        }
        if existing.targetOpacity != targetOpacity {
          // CROSSFADE COMMIT INVARIANT: a fade in flight runs to its committed target
          // before honoring a reversed target. The LOD promote/demote decision reshuffles
          // every ~90ms eval (still-visible in-region markers displaced from the top-N as
          // the on-screen set grows during a zoom); without this guard each flip restarts
          // the 300ms crossfade from the current mid-opacity with a fresh clock, so opacity
          // never reaches 0 or 1 and the marker is stuck shimmering mid-range (the flash).
          // Deferring the reversal until the current fade completes makes a started fade
          // "impossible to snap back in": opacity settles at an endpoint, and only a
          // genuinely-settled opposite decision then starts a clean fade from that endpoint.
          let existingFadeComplete = abs(currentOpacity - existing.targetOpacity) < 0.001
          if !existingFadeComplete {
            var updated = existing
            updated.lodZ = lodZ
            updated.orderHint = orderHint
            nextTransitions[markerKey] = updated
            continue
          }
          let shouldAwaitSourceCommit =
            targetOpacity == 1 && !previousPresent && currentOpacity <= 0.001
            && !suppressSourceCommitAwait
          nextTransitions[markerKey] = LivePinTransition(
            startOpacity: currentOpacity,
            targetOpacity: targetOpacity,
            startedAtMs: nowMs,
            durationMs: livePinTransitionDurationMs,
            isAwaitingSourceCommit: shouldAwaitSourceCommit,
            awaitingSourceDataId: shouldAwaitSourceCommit ? existing.awaitingSourceDataId : nil,
            hasAppliedTargetState: false,
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
        isAwaitingSourceCommit: targetOpacity == 1 && !suppressSourceCommitAwait,
        awaitingSourceDataId: nil,
        hasAppliedTargetState: false,
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
    visibleDotMarkerKeys: Set<String>,
    nowMs: Double,
    allowNewTransitions: Bool
  ) {
    var dotFamilyState = Self.derivedFamilyState(sourceId: state.dotSourceId, state: state)
    // The pin transition is the crossfade PARTNER for each marker. A marker that is
    // promoting (pin entering) must fade its dot OUT; a marker that is demoting (pin
    // exiting) must fade its dot IN — in lockstep. We couple to the pin transitions
    // so the dot transition is ALWAYS created paired with the pin (even when the dot
    // desired-collection diff or the movement gate would otherwise skip it), and so
    // a promote's dot-exit AWAITS THE SAME pin source commit the pin-enter waits on
    // (held visible until the pin is ready), eliminating the "dot snaps out before
    // the pin shows" gap. A demote's dot-enter is immediate (the dot source is
    // resident, so the feature is already present).
    let pinTransitionsByMarkerKey =
      Self.derivedFamilyState(sourceId: state.pinSourceId, state: state).livePinTransitionsByMarkerKey
    // A marker that is currently PINNED (promoted) must keep its dot hidden — the
    // pin IS its visual. Without this, a promoted marker whose dot remained in the
    // visible role set (no active transition) painted its dot under the pin (the
    // "all pins show their dots simultaneously" bug).
    let pinnedMarkerKeys = Set(state.markerRoleTable.pinnedMarkerKeysInOrder)
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
    let markerKeys = previousDotIds
      .union(nextDotIds)
      .union(nextTransitions.keys)
      .union(pinTransitionsByMarkerKey.keys)

    for markerKey in markerKeys {
      let existing = nextTransitions[markerKey]
      let previousPresent = previousDotIds.contains(markerKey)
      let nextPresent = nextDotIds.contains(markerKey)
      let settledDotOpacity =
        Self.numberValue(from: dotFamilyState.sourceState.featureStateById[markerKey]?["nativeDotOpacity"]) ??
        (previousPresent ? 1 : 0)
      let previousVisible = previousPresent && settledDotOpacity > 0.001
      let nextVisible = nextPresent && visibleDotMarkerKeys.contains(markerKey)
      let currentOpacity =
        existing.map { Self.liveDotTransitionOpacity($0, atMs: nowMs) } ??
        settledDotOpacity
      // Crossfade coupling: complementary to the pin transition when one exists.
      let pinTransition = pinTransitionsByMarkerKey[markerKey]
      let pinIsDemoting = pinTransition.map { $0.targetOpacity < 0.001 } ?? false
      let pinIsPromoting = pinTransition.map { $0.targetOpacity >= 0.999 } ?? false
      let pinPromotingAwaitingCommit =
        pinIsPromoting && (pinTransition?.isAwaitingSourceCommit ?? false)
      // Pinned (and not actively demoting) → dot stays hidden. Demoting → dot fades
      // in. Promoting → dot fades out. Otherwise follow the visible role set.
      let isPinnedNow = pinnedMarkerKeys.contains(markerKey) && !pinIsDemoting
      let targetOpacity: Double =
        pinIsDemoting
          ? 1.0
          : (pinIsPromoting || isPinnedNow ? 0.0 : (nextVisible ? 1.0 : 0.0))
      // A promote's dot-exit holds the dot visible until the pin's source commit
      // lands — it is un-awaited together with the pin-enter in
      // startAwaitingLivePinTransitions. A demote's dot-enter is immediate.
      let dotAwaitsCommit = targetOpacity < 0.001 && pinPromotingAwaitingCommit
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

      // A paired crossfade (pinTransition != nil) is always created, bypassing the
      // movement gate and the visibility-delta gate that would otherwise drop it.
      guard allowNewTransitions || existing != nil || pinTransition != nil else {
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
          nextTransitions[markerKey] = LiveDotTransition(
            startOpacity: currentOpacity,
            targetOpacity: targetOpacity,
            startedAtMs: nowMs,
            durationMs: livePinTransitionDurationMs,
            isAwaitingSourceCommit: dotAwaitsCommit,
            awaitingSourceDataId: nil,
            hasAppliedTargetState: false,
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

      guard
        abs(currentOpacity - targetOpacity) >= 0.001,
        pinTransition != nil || previousVisible != nextVisible
      else {
        continue
      }
      nextTransitions[markerKey] = LiveDotTransition(
        startOpacity: currentOpacity,
        targetOpacity: targetOpacity,
        startedAtMs: nowMs,
        durationMs: livePinTransitionDurationMs,
        isAwaitingSourceCommit: dotAwaitsCommit,
        awaitingSourceDataId: nil,
        hasAppliedTargetState: false,
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
    records: [ParsedTransportFeatureRecord]
  ) -> ParsedFeatureCollection {
    let idsInOrder = records.map(\.id)
    var featureById: [String: Feature] = [:]
    var diffKeyById: [String: String] = [:]
    var featureStateById: [String: [String: Any]] = [:]
    var markerKeyByFeatureId: [String: String] = [:]
    for record in records {
      featureById[record.id] = record.feature
      diffKeyById[record.id] = record.diffKey
      if !record.featureState.isEmpty {
        featureStateById[record.id] = record.featureState
      }
      markerKeyByFeatureId[record.id] = record.markerKey
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

  private static func makeScopedParsedFeatureCollection(
    orderedMarkerKeys: [String],
    recordsByMarkerKey: [String: [ParsedTransportFeatureRecord]],
    dirtyGroupIds: Set<String>,
    removedGroupIds: Set<String> = []
  ) -> ParsedFeatureCollection {
    var records: [ParsedTransportFeatureRecord] = []
    records.reserveCapacity(
      orderedMarkerKeys.reduce(0) { total, markerKey in
        total + (recordsByMarkerKey[markerKey]?.count ?? 0)
      }
    )
    for markerKey in orderedMarkerKeys {
      records.append(contentsOf: recordsByMarkerKey[markerKey] ?? [])
    }
    var collection = makeParsedFeatureCollection(records: records)
    collection.dirtyGroupIds = dirtyGroupIds
    collection.orderChangedGroupIds = dirtyGroupIds.union(removedGroupIds)
    collection.removedGroupIds = removedGroupIds
    return collection
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
    let featureStateChangedIds = changedFeatureStateIds(
      previousFeatureStateEntryRevisionById: baseCollection.featureStateEntryRevisionById,
      nextFeatureStateEntryRevisionById: featureStateEntryRevisionById
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

  private static func patchParsedFeatureCollection(
    _ collection: inout ParsedFeatureCollection,
    baseSourceState: SourceState,
    desiredGroupOrder: [String],
    desiredFeatureIdsByGroup: [String: [String]],
    featureById dirtyFeatureById: [String: Feature],
    diffKeyById dirtyDiffKeyById: [String: String] = [:],
    featureStateById dirtyFeatureStateById: [String: [String: Any]] = [:],
    markerKeyByFeatureId dirtyMarkerKeyByFeatureId: [String: String],
    dirtyGroupIds explicitDirtyGroupIds: Set<String>,
    orderChangedGroupIds explicitOrderChangedGroupIds: Set<String>,
    removedGroupIds explicitRemovedGroupIds: Set<String>,
    useCurrentCollectionBase: Bool = false,
    recordAttribution: ((_ section: String, _ durationMs: Double, _ operationCount: Int) -> Void)? = nil
  ) throws {
    let baseStartedAt = recordAttribution == nil ? 0 : CACurrentMediaTime() * 1000
    let baseCollection =
      useCurrentCollectionBase ? collection : Self.parsedCollectionBase(from: baseSourceState)
    if let recordAttribution {
      recordAttribution("replace.base_collection", CACurrentMediaTime() * 1000 - baseStartedAt, baseCollection.idsInOrder.count)
    }

    let previousGroupedFeatureIdsByGroup = collection.groupedFeatureIdsByGroup
    var nextGroupedFeatureIdsByGroup = collection.groupedFeatureIdsByGroup
    var nextGroupOrder = collection.groupOrder
    var shouldRebuildIdsInOrder = collection.groupOrder != desiredGroupOrder
    if shouldRebuildIdsInOrder {
      nextGroupOrder = desiredGroupOrder
      nextGroupedFeatureIdsByGroup = [:]
      nextGroupedFeatureIdsByGroup.reserveCapacity(desiredGroupOrder.count)
      for groupId in desiredGroupOrder {
        nextGroupedFeatureIdsByGroup[groupId] =
          desiredFeatureIdsByGroup[groupId] ?? collection.groupedFeatureIdsByGroup[groupId] ?? []
      }
    }

    var removedFeatureIds = Set<String>()
    for groupId in explicitRemovedGroupIds {
      removedFeatureIds.formUnion(previousGroupedFeatureIdsByGroup[groupId] ?? [])
      nextGroupedFeatureIdsByGroup.removeValue(forKey: groupId)
    }
    for groupId in explicitDirtyGroupIds {
      guard let nextGroupFeatureIds = desiredFeatureIdsByGroup[groupId] else {
        continue
      }
      let previousGroupFeatureIds = previousGroupedFeatureIdsByGroup[groupId] ?? []
      if previousGroupFeatureIds != nextGroupFeatureIds {
        shouldRebuildIdsInOrder = true
      }
      removedFeatureIds.formUnion(Set(previousGroupFeatureIds).subtracting(nextGroupFeatureIds))
      if nextGroupFeatureIds.isEmpty {
        nextGroupedFeatureIdsByGroup.removeValue(forKey: groupId)
      } else {
        nextGroupedFeatureIdsByGroup[groupId] = nextGroupFeatureIds
      }
    }

    let nextIdsInOrder: [String]
    if shouldRebuildIdsInOrder {
      nextIdsInOrder = nextGroupOrder.flatMap { nextGroupedFeatureIdsByGroup[$0] ?? [] }
    } else {
      nextIdsInOrder = collection.idsInOrder
    }

    let patchStartedAt = recordAttribution == nil ? 0 : CACurrentMediaTime() * 1000
    var nextFeatureById = collection.featureById
    var nextDiffKeyById = collection.diffKeyById
    var nextFeatureStateById = collection.featureStateById
    var nextMarkerKeyByFeatureId = collection.markerKeyByFeatureId
    var nextFeatureStateEntryRevisionById = collection.featureStateEntryRevisionById
    var addedFeatureIds = Set<String>()
    var updatedFeatureIds = Set<String>()
    var featureStateChangedIds = Set<String>()

    for featureId in removedFeatureIds {
      nextFeatureById.removeValue(forKey: featureId)
      nextDiffKeyById.removeValue(forKey: featureId)
      nextFeatureStateById.removeValue(forKey: featureId)
      nextMarkerKeyByFeatureId.removeValue(forKey: featureId)
      nextFeatureStateEntryRevisionById.removeValue(forKey: featureId)
      if baseCollection.featureStateEntryRevisionById[featureId] != nil {
        featureStateChangedIds.insert(featureId)
      }
    }

    var diffKeyDurationMs = 0.0
    var featureStateEntryDurationMs = 0.0
    for groupId in explicitDirtyGroupIds {
      let nextGroupFeatureIds = desiredFeatureIdsByGroup[groupId] ?? []
      for featureId in nextGroupFeatureIds {
        guard let feature = dirtyFeatureById[featureId] else {
          throw NSError(
            domain: "SearchMapRenderController",
            code: 91,
            userInfo: [
              NSLocalizedDescriptionKey: "Missing dirty feature \(featureId) in patchParsedFeatureCollection"
            ]
          )
        }
        nextFeatureById[featureId] = feature
        nextMarkerKeyByFeatureId[featureId] = dirtyMarkerKeyByFeatureId[featureId] ?? groupId

        let diffKeyStartedAt = recordAttribution == nil ? 0 : CACurrentMediaTime() * 1000
        let nextDiffKey = dirtyDiffKeyById[featureId] ?? Self.makeFeatureDiffKey(feature: feature)
        if recordAttribution != nil {
          diffKeyDurationMs += CACurrentMediaTime() * 1000 - diffKeyStartedAt
        }
        if let nextDiffKey {
          nextDiffKeyById[featureId] = nextDiffKey
        } else {
          nextDiffKeyById.removeValue(forKey: featureId)
        }
        if !baseCollection.featureIds.contains(featureId) {
          addedFeatureIds.insert(featureId)
        } else if baseCollection.diffKeyById[featureId] != nextDiffKey {
          updatedFeatureIds.insert(featureId)
        }

        let nextFeatureState = dirtyFeatureStateById[featureId] ?? [:]
        if nextFeatureState.isEmpty {
          nextFeatureStateById.removeValue(forKey: featureId)
        } else {
          nextFeatureStateById[featureId] = nextFeatureState
        }
        let featureStateEntryStartedAt = recordAttribution == nil ? 0 : CACurrentMediaTime() * 1000
        let nextFeatureStateEntryRevision =
          nextFeatureState.isEmpty ? nil : Self.buildFeatureStateEntryRevision(state: nextFeatureState)
        if recordAttribution != nil {
          featureStateEntryDurationMs += CACurrentMediaTime() * 1000 - featureStateEntryStartedAt
        }
        if let nextFeatureStateEntryRevision {
          nextFeatureStateEntryRevisionById[featureId] = nextFeatureStateEntryRevision
        } else {
          nextFeatureStateEntryRevisionById.removeValue(forKey: featureId)
        }
        if baseCollection.featureStateEntryRevisionById[featureId] != nextFeatureStateEntryRevision {
          featureStateChangedIds.insert(featureId)
        }
      }
    }
    if let recordAttribution {
      recordAttribution("replace.loop_total", CACurrentMediaTime() * 1000 - patchStartedAt, dirtyFeatureById.count + removedFeatureIds.count)
      recordAttribution("replace.diff_key", diffKeyDurationMs, dirtyFeatureById.count)
      recordAttribution("replace.feature_state_entry_revision", featureStateEntryDurationMs, dirtyFeatureStateById.count)
    }

    let nextFeatureIds = Set(nextIdsInOrder)
    let removedFeatureIdsInOrder = baseCollection.idsInOrder.filter { removedFeatureIds.contains($0) }
    let addedFeatureIdsInOrder = nextIdsInOrder.filter { addedFeatureIds.contains($0) }
    let updatedFeatureIdsInOrder = nextIdsInOrder.filter { updatedFeatureIds.contains($0) }
    let hasSourceMutation =
      shouldRebuildIdsInOrder ||
      !removedFeatureIdsInOrder.isEmpty ||
      !addedFeatureIdsInOrder.isEmpty ||
      !updatedFeatureIdsInOrder.isEmpty

    let sourceRevisionStartedAt = recordAttribution == nil ? 0 : CACurrentMediaTime() * 1000
    let sourceRevision =
      hasSourceMutation
        ? buildParsedCollectionRevision(idsInOrder: nextIdsInOrder, diffKeyById: nextDiffKeyById)
        : baseCollection.sourceRevision
    if let recordAttribution {
      recordAttribution("replace.source_revision", CACurrentMediaTime() * 1000 - sourceRevisionStartedAt, hasSourceMutation ? nextIdsInOrder.count : 0)
    }

    let featureStateRevisionStartedAt = recordAttribution == nil ? 0 : CACurrentMediaTime() * 1000
    let featureStateRevision =
      featureStateChangedIds.isEmpty
        ? baseCollection.featureStateRevision
        : buildFeatureStateRevision(featureStateEntryRevisionById: nextFeatureStateEntryRevisionById)
    if let recordAttribution {
      recordAttribution("replace.feature_state_changed_ids", 0, featureStateChangedIds.count)
      recordAttribution("replace.feature_state_revision", CACurrentMediaTime() * 1000 - featureStateRevisionStartedAt, featureStateChangedIds.isEmpty ? 0 : nextFeatureStateEntryRevisionById.count)
    }

    let assignmentStartedAt = recordAttribution == nil ? 0 : CACurrentMediaTime() * 1000
    collection.baseSourceRevision = baseCollection.sourceRevision
    collection.baseFeatureStateRevision = baseCollection.featureStateRevision
    collection.sourceRevision = sourceRevision
    collection.featureStateRevision = featureStateRevision
    collection.dirtyGroupIds = explicitDirtyGroupIds
    collection.orderChangedGroupIds = explicitOrderChangedGroupIds
    collection.removedGroupIds = explicitRemovedGroupIds
    collection.featureStateEntryRevisionById = nextFeatureStateEntryRevisionById
    collection.featureStateChangedIds = featureStateChangedIds
    collection.featureIds = nextFeatureIds
    collection.addedFeatureIdsInOrder = addedFeatureIdsInOrder
    collection.updatedFeatureIdsInOrder = updatedFeatureIdsInOrder
    collection.removedFeatureIds = removedFeatureIds
    collection.removedFeatureIdsInOrder = removedFeatureIdsInOrder
    collection.idsInOrder = nextIdsInOrder
    collection.groupedFeatureIdsByGroup = nextGroupedFeatureIdsByGroup
    collection.groupOrder = nextGroupOrder
    collection.featureById = nextFeatureById
    collection.diffKeyById = nextDiffKeyById
    collection.featureStateById = nextFeatureStateById
    collection.markerKeyByFeatureId = nextMarkerKeyByFeatureId
    if let recordAttribution {
      recordAttribution("replace.assignment", CACurrentMediaTime() * 1000 - assignmentStartedAt, dirtyFeatureById.count + removedFeatureIds.count)
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

  private static func buildSlotApplyPlans(
    sourceId: String,
    nextCollection: ParsedFeatureCollection,
    state: inout InstanceState,
    recordAttribution: ((_ section: String, _ durationMs: Double, _ operationCount: Int) -> Void)? = nil
  ) throws -> [ParsedCollectionApplyPlan] {
    let changedGroupIds = nextCollection.dirtyGroupIds.union(nextCollection.removedGroupIds)
    guard !changedGroupIds.isEmpty else {
      return []
    }
    var familyState = derivedFamilyState(sourceId: sourceId, state: state)
    let previousSourceState = familyState.sourceState

    var desiredGroupOrder = familyState.collection.groupOrder.filter {
      !changedGroupIds.contains($0)
    }
    var desiredFeatureIdsByGroup: [String: [String]] = [:]
    var featureById: [String: Feature] = [:]
    var diffKeyById: [String: String] = [:]
    var featureStateById: [String: [String: Any]] = [:]
    var markerKeyByFeatureId: [String: String] = [:]

    let orderedChangedGroupIds = nextCollection.groupOrder.filter { changedGroupIds.contains($0) }
    for groupId in orderedChangedGroupIds {
      let groupFeatureIds = nextCollection.groupedFeatureIdsByGroup[groupId] ?? []
      guard !groupFeatureIds.isEmpty else {
        continue
      }
      if !desiredGroupOrder.contains(groupId) {
        desiredGroupOrder.append(groupId)
      }
      desiredFeatureIdsByGroup[groupId] = groupFeatureIds
      for featureId in groupFeatureIds {
        guard let feature = nextCollection.featureById[featureId] else {
          continue
        }
        featureById[featureId] = feature
        if let diffKey = nextCollection.diffKeyById[featureId] {
          diffKeyById[featureId] = diffKey
        }
        if let featureState = nextCollection.featureStateById[featureId], !featureState.isEmpty {
          featureStateById[featureId] = featureState
        }
        markerKeyByFeatureId[featureId] = nextCollection.markerKeyByFeatureId[featureId] ?? groupId
      }
    }

    let previousGroupIds = Set(familyState.collection.groupOrder)
    let nextGroupIds = Set(desiredGroupOrder)
    let removedGroupIds = previousGroupIds.subtracting(nextGroupIds)
    let addedGroupIds = nextGroupIds.subtracting(previousGroupIds)
    let dirtyGroupIds = changedGroupIds.union(addedGroupIds).union(removedGroupIds)
    let orderChangedGroupIds =
      familyState.collection.groupOrder == desiredGroupOrder ? dirtyGroupIds : dirtyGroupIds.union(addedGroupIds).union(removedGroupIds)
    if familyState.collection.groupOrder == desiredGroupOrder &&
      dirtyGroupIds.isEmpty &&
      removedGroupIds.isEmpty
    {
      return []
    }
    try patchParsedFeatureCollection(
      &familyState.collection,
      baseSourceState: previousSourceState,
      desiredGroupOrder: desiredGroupOrder,
      desiredFeatureIdsByGroup: desiredFeatureIdsByGroup,
      featureById: featureById,
      diffKeyById: diffKeyById,
      featureStateById: featureStateById,
      markerKeyByFeatureId: markerKeyByFeatureId,
      dirtyGroupIds: dirtyGroupIds,
      orderChangedGroupIds: orderChangedGroupIds,
      removedGroupIds: removedGroupIds,
      useCurrentCollectionBase: true,
      recordAttribution: recordAttribution
    )
    setDerivedFamilyState(familyState, sourceId: sourceId, state: &state)
    if previousSourceState.sourceRevision == familyState.collection.sourceRevision &&
      previousSourceState.featureStateRevision == familyState.collection.featureStateRevision
    {
      return []
    }
    return [
      ParsedCollectionApplyPlan(
        sourceId: sourceId,
        next: familyState.collection,
        previousSourceState: previousSourceState,
        previousFeatureStateById: previousSourceState.featureStateById,
        previousFeatureStateRevision: previousSourceState.featureStateRevision
      )
    ]
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
    let latestState = instances[instanceId] ?? state
    let canRunVisualTransition =
      latestState.lastPresentationBatchPhase == "live" ||
      latestState.lastPresentationBatchPhase == "entering"
    let hasPinTransitions =
      !Self.derivedFamilyState(
        sourceId: latestState.pinSourceId,
        state: latestState
      ).livePinTransitionsByMarkerKey.isEmpty
    let hasDotTransitions =
      !Self.derivedFamilyState(
        sourceId: latestState.dotSourceId,
        state: latestState
      ).liveDotTransitionsByMarkerKey.isEmpty
    if
      Self.isVisualSourceInactiveOrDismissing(latestState) ||
      Self.isSourceRecoveryActive(latestState) ||
      (!hasPinTransitions && !hasDotTransitions) ||
      !canRunVisualTransition
    {
      cancelLivePinTransitionAnimation(instanceId: instanceId)
      return
    }
    guard livePinTransitionAnimators[instanceId] == nil else {
      return
    }
    let displayLink = CADisplayLink(target: self, selector: #selector(handleLivePinTransitionFrame(_:)))
    Self.configureDisplayLink(displayLink)
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
    pinFamilyState.lastDesiredPinSnapshot = DesiredPinSnapshotState()
    dotFamilyState.liveDotTransitionsByMarkerKey.removeAll()
    dotFamilyState.lastDesiredCollection = Self.emptyParsedFeatureCollection()
    labelFamilyState.labelObservation.hasCommittedObservationForConfiguredRequest = false
    labelFamilyState.labelObservation.lastVisibleLabelFeatureIds = []
    labelFamilyState.labelObservation.lastLayerRenderedFeatureCount = 0
    labelFamilyState.labelObservation.lastEffectiveRenderedFeatureCount = 0
    labelFamilyState.labelObservation.settledVisibleMissingStreakByFeatureId.removeAll()

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
    guard !Self.isVisualSourceInactiveOrDismissing(state) else {
      return
    }
    let nowMs = Self.nowMs()
    var didStartTransition = false
    var awaitingTransitionCount = 0
    var startedTransitionCount = 0
    var pinFamilyState = Self.derivedFamilyState(sourceId: state.pinSourceId, state: state)
    var labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    var dotFamilyState = Self.derivedFamilyState(sourceId: state.dotSourceId, state: state)
    var pinSourceState = pinFamilyState.sourceState
    var labelSourceState = labelFamilyState.sourceState
    // Markers whose pin-enter we start on this commit — used to un-await their
    // coupled dot-exit so the dot fades out exactly as the pin fades in.
    var startedPinEnterMarkerKeys = Set<String>()
    for markerKey in pinFamilyState.livePinTransitionsByMarkerKey.keys.sorted() {
      if pinFamilyState.livePinTransitionsByMarkerKey[markerKey]?.isAwaitingSourceCommit == true {
        awaitingTransitionCount += 1
      }
      guard var transition = pinFamilyState.livePinTransitionsByMarkerKey[markerKey],
            transition.isAwaitingSourceCommit
      else {
        continue
      }
      let transitionSourceId = state.pinBundleSourceId
      guard Self.shouldStartAwaitingTransition(
        awaitingSourceDataId: transition.awaitingSourceDataId,
        sourceId: transitionSourceId,
        acknowledgedDataId: dataId
      ) else {
        continue
      }
      transition.isAwaitingSourceCommit = false
      transition.awaitingSourceDataId = nil
      transition.startedAtMs = nowMs
      transition.startOpacity = 0
      transition.hasAppliedTargetState = false
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
      startedPinEnterMarkerKeys.insert(markerKey)
    }
    // Coupled dot-exit: each marker whose pin just started fading in had its dot held
    // visible (awaiting). Un-await those dot-exits now so the dot fades out in lockstep
    // with the pin fading in — no "dot snaps out before the pin shows" gap.
    for markerKey in startedPinEnterMarkerKeys {
      guard var dotTransition = dotFamilyState.liveDotTransitionsByMarkerKey[markerKey],
            dotTransition.isAwaitingSourceCommit
      else {
        continue
      }
      dotTransition.isAwaitingSourceCommit = false
      dotTransition.awaitingSourceDataId = nil
      dotTransition.startedAtMs = nowMs
      dotTransition.hasAppliedTargetState = false
      dotFamilyState.liveDotTransitionsByMarkerKey[markerKey] = dotTransition
      didStartTransition = true
    }
    // Persist the coupled dot-exit un-awaits (transition-map change only).
    Self.setDerivedFamilyState(dotFamilyState, sourceId: state.dotSourceId, state: &state)
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
    guard !Self.isVisualSourceInactiveOrDismissing(state) else {
      return
    }
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
      transition.hasAppliedTargetState = false
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
      transition.hasAppliedTargetState = false
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
      transition.hasAppliedTargetState = false
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
    guard !Self.isVisualSourceInactiveOrDismissing(state) else {
      instances[instanceId] = state
      cancelLivePinTransitionAnimation(instanceId: instanceId)
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
      sourceIds: visualSourceIds(for: state),
      reason: "live_pin_transition_feature_states",
      allowRecoveryEscalation: false,
      { _ in }
    ) == false {
      instances[instanceId] = state
      return
    }
    var pinFamilyState = Self.derivedFamilyState(sourceId: state.pinSourceId, state: state)
    var pinSourceState = pinFamilyState.sourceState
    var dotFamilyState = Self.derivedFamilyState(sourceId: state.dotSourceId, state: state)
    var dotSourceState = dotFamilyState.sourceState
    var labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    var labelSourceState = labelFamilyState.sourceState

    var featureStatesToApply: [(sourceId: String, featureId: String, state: [String: Any])] = []
    var dotFeatureStatesToApply: [(featureId: String, state: [String: Any])] = []
    var labelFeatureStatesToApply: [(sourceId: String, featureId: String, state: [String: Any])] = []
    var pinSourceFeatureStateChanged = false
    var dotSourceFeatureStateChanged = false
    var labelSourceFeatureStateChanged = false
    let nowMs = Self.nowMs()
    var pinEnterTransitionCount = 0
    var pinExitTransitionCount = 0
    var dotEnterTransitionCount = 0
    var dotExitTransitionCount = 0
    var pinIntermediateOpacityCount = 0
    var labelIntermediateOpacityCount = 0
    var dotIntermediateOpacityCount = 0
    // #2/#3 detectors. flashReversalCount: a pin transition whose startOpacity is
    // mid-range began from a mid-fade — i.e. the marker reversed promote/demote
    // mid-animation (the "fade out -> flash full -> out"). pinExitMidFade /
    // dotEnter let us flag a demotion with no synchronized dot fade-in (the
    // crossfade gap: dot snaps in late instead of fading with the pin).
    var flashReversalCount = 0
    var pinExitMidFadeMarkerKeys = Set<String>()
    var dotEnterMarkerKeys = Set<String>()
    var completedEnterMarkerKeys: [String] = []
    var completedExitMarkerKeys: [String] = []
    var completedDotEnterMarkerKeys: [String] = []
    var completedDotExitMarkerKeys: [String] = []
    // Per-marker trajectory trace (diagnostic): start/target/current opacity per
    // transitioning pin & dot, so we can see flash reversals (start mid-range) and
    // crossfade desync (pin exiting with no matching dot enter for the same key)
    // frame by frame across multiple promote/demote cycles.
    var lodTransitionTrace: [[String: Any]] = []
    let pinTransitionTargetByKey = pinFamilyState.livePinTransitionsByMarkerKey
      .mapValues { $0.targetOpacity }
    let dotTransitionTargetByKey = dotFamilyState.liveDotTransitionsByMarkerKey
      .mapValues { $0.targetOpacity }

    for markerKey in pinFamilyState.livePinTransitionsByMarkerKey.keys.sorted() {
      guard let transition = pinFamilyState.livePinTransitionsByMarkerKey[markerKey],
            !transition.isAwaitingSourceCommit
      else {
        continue
      }
      let opacity = Self.clamp(Self.livePinTransitionOpacity(transition, atMs: nowMs), min: 0, max: 1)
      if opacity > 0.001 && opacity < 0.999 {
        pinIntermediateOpacityCount += 1
      }
      if transition.startOpacity > 0.05 && transition.startOpacity < 0.95 {
        flashReversalCount += 1
      }
      if transition.targetOpacity >= 0.999 {
        pinEnterTransitionCount += 1
      } else {
        pinExitTransitionCount += 1
        if opacity > 0.05 && opacity < 0.95 {
          pinExitMidFadeMarkerKeys.insert(markerKey)
        }
      }
      if lodTransitionTrace.count < 24 {
        lodTransitionTrace.append([
          "k": markerKey,
          "f": "pin",
          "s": Self.roundTo3(transition.startOpacity),
          "t": Self.roundTo3(transition.targetOpacity),
          "c": Self.roundTo3(opacity),
          // Does this marker have a matching dot transition heading the opposite
          // way (the synchronized crossfade partner)? If a pin is exiting and there
          // is no dot entering for the same key, the crossfade is broken.
          "dotTarget": dotTransitionTargetByKey[markerKey].map { Self.roundTo3($0) } ?? -1,
          "awaitingCommit": transition.isAwaitingSourceCommit,
        ])
      }
      let renderState = pinFamilyState.markerRenderStateByMarkerKey[markerKey]
      // Single bundle source: pin art and label features for a marker both live
      // in state.pinSourceId; the slot only selects the LAYER (via nativeLodZ).
      _ = renderState
      let pinPhysicalSourceId = state.pinBundleSourceId
      let labelPhysicalSourceId = state.pinBundleSourceId
      var localPinFeatureStatesToApply: [(featureId: String, state: [String: Any])] = []
      Self.applyTransientFeatureState(
        sourceState: &pinSourceState,
        familyState: &pinFamilyState,
        featureId: markerKey,
        transientState: Self.livePinFeatureState(opacity: opacity),
        applyList: &localPinFeatureStatesToApply,
        sourceStateChanged: &pinSourceFeatureStateChanged
      )
      for entry in localPinFeatureStatesToApply {
        featureStatesToApply.append((pinPhysicalSourceId, entry.featureId, entry.state))
      }
      for labelFeature in renderState?.labelFeatures ?? [] {
        if opacity > 0.001 && opacity < 0.999 {
          labelIntermediateOpacityCount += 1
        }
        var localLabelFeatureStatesToApply: [(featureId: String, state: [String: Any])] = []
        Self.applyTransientFeatureState(
          sourceState: &labelSourceState,
          familyState: &labelFamilyState,
          featureId: labelFeature.id,
          transientState: Self.liveLabelFeatureState(opacity: opacity),
          applyList: &localLabelFeatureStatesToApply,
          sourceStateChanged: &labelSourceFeatureStateChanged
        )
        for entry in localLabelFeatureStatesToApply {
          labelFeatureStatesToApply.append((labelPhysicalSourceId, entry.featureId, entry.state))
        }
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
      let opacity = Self.clamp(Self.liveDotTransitionOpacity(transition, atMs: nowMs), min: 0, max: 1)
      if opacity > 0.001 && opacity < 0.999 {
        dotIntermediateOpacityCount += 1
      }
      if transition.targetOpacity >= 0.999 {
        dotEnterTransitionCount += 1
        dotEnterMarkerKeys.insert(markerKey)
      } else {
        dotExitTransitionCount += 1
      }
      if lodTransitionTrace.count < 48 {
        lodTransitionTrace.append([
          "k": markerKey,
          "f": "dot",
          "s": Self.roundTo3(transition.startOpacity),
          "t": Self.roundTo3(transition.targetOpacity),
          "c": Self.roundTo3(opacity),
          "pinTarget": pinTransitionTargetByKey[markerKey].map { Self.roundTo3($0) } ?? -1,
          "awaitingCommit": transition.isAwaitingSourceCommit,
        ])
      }
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
            sourceId: entry.sourceId,
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
            sourceId: entry.sourceId,
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
    let pinTransitionCount = pinEnterTransitionCount + pinExitTransitionCount
    let dotTransitionCount = dotEnterTransitionCount + dotExitTransitionCount
    // Crossfade gap: a marker DEMOTING IN PLACE (pin fading out, and the role
    // table says it should now be a visible in-view dot) whose dot is NOT fading
    // in alongside it. We intersect with the dot role set so that a pin fading out
    // because the marker PANNED OFF the viewport (not in the dot role set — no dot
    // should appear off-screen) is NOT miscounted as a broken crossfade.
    let visibleDotRoleMarkerKeys = Set(state.markerRoleTable.dotMarkerKeysInOrder)
    let crossfadeGapCount = pinExitMidFadeMarkerKeys
      .intersection(visibleDotRoleMarkerKeys)
      .subtracting(dotEnterMarkerKeys)
      .count
    if pinTransitionCount > 0 || dotTransitionCount > 0 {
      emit([
        "type": "live_lod_transition_contract",
        "instanceId": instanceId,
        "flashReversalCount": flashReversalCount,
        "crossfadeGapCount": crossfadeGapCount,
        "pinExitMidFadeCount": pinExitMidFadeMarkerKeys.count,
        "pinTransitionCount": pinTransitionCount,
        "pinEnterTransitionCount": pinEnterTransitionCount,
        "pinExitTransitionCount": pinExitTransitionCount,
        "dotTransitionCount": dotTransitionCount,
        "dotEnterTransitionCount": dotEnterTransitionCount,
        "dotExitTransitionCount": dotExitTransitionCount,
        "pinFeatureStateApplyCount": featureStatesToApply.count,
        "labelFeatureStateApplyCount": labelFeatureStatesToApply.count,
        "dotFeatureStateApplyCount": dotFeatureStatesToApply.count,
        "pinLabelFadeSynchronized": pinTransitionCount == 0 || labelFeatureStatesToApply.count >= pinTransitionCount * 4,
        "transitionDurationMs": livePinTransitionDurationMs,
        "usesStyleTransition": false,
        "usesNativeFrameStepper": true,
        "hasIntermediateOpacity": pinIntermediateOpacityCount > 0 || labelIntermediateOpacityCount > 0 || dotIntermediateOpacityCount > 0,
        "pinIntermediateOpacityCount": pinIntermediateOpacityCount,
        "labelIntermediateOpacityCount": labelIntermediateOpacityCount,
        "dotIntermediateOpacityCount": dotIntermediateOpacityCount,
        "lodTransitionTrace": lodTransitionTrace,
        "emittedAtMs": Self.nowMs(),
      ])
    }

    // HARNESS [lodev] step event: the per-frame opacity stepper.
    //  - pinMidFade / dotMidFade: pins / dots actively crossfading THIS frame.
    //  - xfadeGap: a pin demoting-in-place whose dot is NOT fading in alongside it (the dot
    //    snaps in LATE after the pin fully faded out) — the demotion-crossfade bug.
    //  - dtMs: ms since the last stepper frame = render cadence (jank/choppiness detector).
    if Self.lodHarnessEnabled {
      let nowStepMs = Self.nowMs()
      let dtMs = lastHarnessStepMs > 0 ? Int(nowStepMs - lastHarnessStepMs) : 0
      lastHarnessStepMs = nowStepMs
      Self.harnessLog(
        "{\"ev\":\"step\",\"t\":\(Int(nowStepMs)),\"moving\":\(state.currentViewportIsMoving),"
          + "\"activePin\":\(pinFamilyState.livePinTransitionsByMarkerKey.count),"
          + "\"activeDot\":\(dotFamilyState.liveDotTransitionsByMarkerKey.count),"
          + "\"pinMidFade\":\(pinIntermediateOpacityCount),\"dotMidFade\":\(dotIntermediateOpacityCount),"
          + "\"xfadeGap\":\(crossfadeGapCount),\"applied\":\(featureStatesToApply.count),\"dtMs\":\(dtMs)}"
      )
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
    }

    if !completedDotEnterMarkerKeys.isEmpty || !completedDotExitMarkerKeys.isEmpty {
      try finalizeCompletedLiveDotTransitions(
        instanceId: instanceId,
        enteredMarkerKeys: completedDotEnterMarkerKeys,
        exitedMarkerKeys: completedDotExitMarkerKeys
      )
    }

    guard let latestState = instances[instanceId] else {
      cancelLivePinTransitionAnimation(instanceId: instanceId)
      return
    }
    updateLivePinTransitionAnimation(instanceId: instanceId, state: latestState)
  }

  @objc
  private func handleLivePinTransitionFrame(_ displayLink: CADisplayLink) {
    guard let instanceId = livePinTransitionAnimators.first(where: { $0.value === displayLink })?.key else {
      return
    }
    do {
      try applyLivePinTransitionFeatureStates(for: instanceId)
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
          Self.applyTransientFeatureState(
            sourceState: &pinSourceState,
            familyState: &pinFamilyState,
            featureId: markerKey,
            transientState: Self.livePinFeatureState(opacity: 0)
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
            Self.applyTransientFeatureState(
              sourceState: &labelSourceState,
              familyState: &labelFamilyState,
              featureId: labelFeature.id,
              transientState: Self.liveLabelFeatureState(opacity: 0)
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
    try reconcileAndApplyLiveMarkerRoleOutputs(
      for: instanceId,
      affectedMarkerKeys: Set(completedMarkerKeys),
      allowNewTransitions: false,
      reason: "pin_transition_complete"
    )
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
          Self.applyTransientFeatureState(
            sourceState: &dotSourceState,
            familyState: &dotFamilyState,
            featureId: markerKey,
            transientState: Self.liveDotFeatureState(opacity: 0)
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
    try reconcileAndApplyLiveMarkerRoleOutputs(
      for: instanceId,
      affectedMarkerKeys: Set(completedMarkerKeys),
      allowNewTransitions: false,
      reason: "dot_transition_complete"
    )
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

  private func shouldSuppressInteractions(state: InstanceState) -> Bool {
    state.interactionMode != "enabled"
  }

  private func applyHighlightedMarkerState(
    for state: InstanceState,
    instanceId: String,
    allowDuringRecovery: Bool = false
  ) throws {
    var mutableState = state
    guard !Self.isVisualSourceInactiveOrDismissing(mutableState) else {
      instances[instanceId] = mutableState
      return
    }
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
      for sourceId in visualSourceIds(for: state) {
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
      transitionDurationMs: 0,
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
      transitionDurationMs: 0,
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
        transitionDurationMs: 0,
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

    try applyPresentationOpacity(
      startOpacity,
      for: state,
      instanceId: instanceId,
      reason: reason,
      transitionDurationMs: 0,
      allowDuringRecovery: allowDuringRecovery,
      emitDiagnostic: false
    )
    state = instances[instanceId] ?? state
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
    instances[instanceId] = state
    animator.start()
  }

  fileprivate func stepPresentationOpacityAnimation(
    instanceId: String,
    timestampMs: Double
  ) {
    guard let animator = presentationOpacityAnimators[instanceId],
          var state = instances[instanceId]
    else {
      cancelPresentationOpacityAnimation(instanceId: instanceId)
      return
    }
    let elapsedMs = max(0, timestampMs - animator.startedAtMs)
    let progress = animator.durationMs <= 0 ? 1 : min(1, elapsedMs / animator.durationMs)
    let easedProgress = progress * progress * (3 - 2 * progress)
    let opacity = Self.clamp(
      animator.startOpacity + (animator.targetOpacity - animator.startOpacity) * easedProgress,
      min: 0,
      max: 1
    )
    state.currentPresentationOpacityValue = opacity
    instances[instanceId] = state
    do {
      try applyPresentationOpacity(
        opacity,
        for: state,
        instanceId: instanceId,
        reason: animator.reason,
        transitionDurationMs: 0,
        emitDiagnostic: false
      )
      state = instances[instanceId] ?? state
      if progress >= 1 {
        cancelPresentationOpacityAnimation(instanceId: instanceId)
        state.currentPresentationOpacityTarget = animator.targetOpacity
        state.currentPresentationOpacityValue = animator.targetOpacity
        instances[instanceId] = state
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
    transitionDurationMs: Int,
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
    // nativePresentationOpacity is a UNIFORM global fade value (identical for every
    // feature), so it only needs to be written to features that are actually painted —
    // i.e. the on-screen marker set. With the residency model `collection.idsInOrder`
    // is the FULL resident catalog (thousands of off-screen, demoted markers), and this
    // runs every CADisplayLink frame (~18x per reveal/dismiss), so sweeping the whole
    // catalog is pure waste. The camera does NOT move during an opacity fade, so the
    // on-screen set is stable for the whole transition — restrict the sweep to it.
    //
    // Authoritative on-screen set: `lastVisibleMarkerSetSignature`, maintained in
    // handleNativeCameraChanged as the sorted on-screen markerKeys joined with "|".
    // Decode it back into a Set the same way the camera handler does (marker keys
    // never contain "|"). markerKey -> featureIds mapping is collection.groupedFeatureIdsByGroup
    // (built by buildGroupedFeatureIdsByGroup, keyed by markerKey).
    let onScreenMarkerKeys: Set<String> = {
      guard let signature = mutableState.lastVisibleMarkerSetSignature, !signature.isEmpty else {
        return []
      }
      return Set(signature.components(separatedBy: "|"))
    }()
    let targets: [(sourceId: String, featureId: String)]
    if onScreenMarkerKeys.isEmpty {
      // SAFETY FALLBACK: no projected on-screen set yet (e.g. not yet camera-projected,
      // or an instant/non-gesture state) — fall back to the full catalog sweep so the
      // reveal/dismiss never silently fails to fade.
      targets = visualSourceIds(for: state).flatMap { sourceId -> [(sourceId: String, featureId: String)] in
        let familyState = Self.derivedFamilyState(sourceId: sourceId, state: mutableState)
        return familyState.collection.idsInOrder.map { featureId in
          (sourceId: sourceId, featureId: featureId)
        }
      }
    } else {
      targets = visualSourceIds(for: state).flatMap { sourceId -> [(sourceId: String, featureId: String)] in
        let familyState = Self.derivedFamilyState(sourceId: sourceId, state: mutableState)
        return onScreenMarkerKeys.flatMap { markerKey -> [(sourceId: String, featureId: String)] in
          (familyState.collection.groupedFeatureIdsByGroup[markerKey] ?? []).map { featureId in
            (sourceId: sourceId, featureId: featureId)
          }
        }
      }
    }
    try withMapboxMap(for: state.mapTag) { mapboxMap in
      for target in targets {
        mapboxMap.setFeatureState(
          sourceId: target.sourceId,
          featureId: target.featureId,
          state: ["nativePresentationOpacity": opacity]
        ) { _ in }
      }
      let durationMs = CACurrentMediaTime() * 1000 - startedAt
      self.recordNativeApply(
        section: "presentation_opacity.apply",
        phase: state.lastPresentationBatchPhase,
        source: reason,
        durationMs: durationMs,
        operationCount: targets.count
      )
      if emitDiagnostic && ((!targets.isEmpty && opacity > 0) || durationMs >= self.slowActionThresholdMs) {
        self.emit([
          "type": "error",
          "instanceId": "__native_diag__",
          "message":
            "presentation_opacity_apply reason=\(reason) opacity=\(opacity) transitionDurationMs=\(transitionDurationMs) phase=\(state.lastPresentationBatchPhase) featureStateCount=\(targets.count) pins=\(state.lastPinCount) dots=\(state.lastDotCount) labels=\(state.lastLabelCount) durationMs=\(Int(durationMs.rounded()))",
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
    Self.uniqueSourceIds([state.pinBundleSourceId, state.dotSourceId, state.labelCollisionSourceId])
  }

  private func visualAndInteractionSourceIds(for state: InstanceState) -> [String] {
    Self.uniqueSourceIds([state.pinBundleSourceId, state.dotSourceId, state.labelCollisionSourceId])
  }

  private static func uniqueSourceIds(_ sourceIds: [String]) -> [String] {
    var seen = Set<String>()
    var ordered: [String] = []
    ordered.reserveCapacity(sourceIds.count)
    for sourceId in sourceIds where !sourceId.isEmpty && !seen.contains(sourceId) {
      seen.insert(sourceId)
      ordered.append(sourceId)
    }
    return ordered
  }

  private static func slotIndex(from feature: Feature) -> Int? {
    guard let properties = feature.properties?.turfRawValue as? [String: Any] else {
      return nil
    }
    if let number = properties["nativeLodZ"] as? NSNumber {
      return number.intValue
    }
    if let number = properties["lodZ"] as? NSNumber {
      return number.intValue
    }
    return nil
  }


  private func commitRenderedLabelObservation(
    instanceId: String,
    visibleLabelFeatureIds: [String],
    layerRenderedFeatureCount: Int,
    effectiveRenderedFeatureCount: Int,
    commitVisibleLabelHits: Bool,
    labelResetRequestKey: String?
  ) -> [String: Any] {
    guard var mutableState = instances[instanceId] else {
      return Self.emptyRenderedLabelObservationResult()
    }
    if mutableState.visualSourceLifecycleState == .dismissing ||
      mutableState.visualSourceLifecycleState == .hidden {
      return Self.emptyRenderedLabelObservationResult()
    }
    var labelFamilyState = Self.derivedFamilyState(sourceId: mutableState.labelSourceId, state: mutableState)
    let pinFamilyState = Self.derivedFamilyState(sourceId: mutableState.pinSourceId, state: mutableState)
    let previousVisibleLabelFeatureIds = labelFamilyState.labelObservation.lastVisibleLabelFeatureIds
    if labelFamilyState.labelObservation.configuredResetRequestKey != labelResetRequestKey {
      return currentRenderedLabelObservationSnapshot(instanceId: instanceId)
    }
    let isNewLabelResetRequest =
      labelResetRequestKey != nil &&
      labelFamilyState.labelObservation.lastResetRequestKey != labelResetRequestKey
    if isNewLabelResetRequest {
      labelFamilyState.settledVisibleFeatureIds.removeAll()
      labelFamilyState.labelObservation.settledVisibleMissingStreakByFeatureId.removeAll()
    }
    let shouldCommitVisibleLabelHits =
      commitVisibleLabelHits &&
      labelFamilyState.labelObservation.commitVisibleLabelHits &&
      labelFamilyState.labelObservation.observationEnabled
    var didClearSettledVisibleLabelHits = false
    if shouldCommitVisibleLabelHits {
      let availableLabelFeatureIds = Set(
        pinFamilyState.markerRenderStateByMarkerKey.values.flatMap { renderState in
          renderState.labelFeatures.map(\.id)
        }
      )
      let observedVisibleFeatureIds = Set(visibleLabelFeatureIds).intersection(availableLabelFeatureIds)
      let observedMarkerKeys = Set(
        observedVisibleFeatureIds.compactMap {
          Self.parseRenderedLabelCandidateFeatureId($0)?.markerKey
        }
      )
      var nextSettledVisibleFeatureIds = observedVisibleFeatureIds
      var nextMissingStreakByFeatureId =
        labelFamilyState.labelObservation.settledVisibleMissingStreakByFeatureId
      for featureId in labelFamilyState.settledVisibleFeatureIds where !observedVisibleFeatureIds.contains(featureId) {
        guard availableLabelFeatureIds.contains(featureId) else {
          nextMissingStreakByFeatureId.removeValue(forKey: featureId)
          continue
        }
        guard let markerKey = Self.parseRenderedLabelCandidateFeatureId(featureId)?.markerKey else {
          nextMissingStreakByFeatureId.removeValue(forKey: featureId)
          continue
        }
        if observedMarkerKeys.contains(markerKey) {
          nextMissingStreakByFeatureId.removeValue(forKey: featureId)
          continue
        }
        let nextMissingStreak = (nextMissingStreakByFeatureId[featureId] ?? 0) + 1
        if nextMissingStreak < settledVisibleLabelMissingGraceStreak {
          nextSettledVisibleFeatureIds.insert(featureId)
          nextMissingStreakByFeatureId[featureId] = nextMissingStreak
        } else {
          nextMissingStreakByFeatureId.removeValue(forKey: featureId)
        }
      }
      for featureId in observedVisibleFeatureIds {
        nextMissingStreakByFeatureId.removeValue(forKey: featureId)
      }
      labelFamilyState.settledVisibleFeatureIds = nextSettledVisibleFeatureIds
      labelFamilyState.labelObservation.settledVisibleMissingStreakByFeatureId =
        nextMissingStreakByFeatureId
    } else if !labelFamilyState.settledVisibleFeatureIds.isEmpty {
      labelFamilyState.settledVisibleFeatureIds.removeAll()
      labelFamilyState.labelObservation.settledVisibleMissingStreakByFeatureId.removeAll()
      didClearSettledVisibleLabelHits = true
    }
    let committedVisibleLabelFeatureIds =
      shouldCommitVisibleLabelHits
        ? Array(labelFamilyState.settledVisibleFeatureIds).sorted()
        : visibleLabelFeatureIds
    labelFamilyState.labelObservation.lastVisibleLabelFeatureIds = committedVisibleLabelFeatureIds
    labelFamilyState.labelObservation.lastLayerRenderedFeatureCount = layerRenderedFeatureCount
    labelFamilyState.labelObservation.lastEffectiveRenderedFeatureCount = max(
      effectiveRenderedFeatureCount,
      committedVisibleLabelFeatureIds.count
    )
    labelFamilyState.labelObservation.hasCommittedObservationForConfiguredRequest = true
    let didProduceMeaningfulChange =
      didClearSettledVisibleLabelHits ||
      previousVisibleLabelFeatureIds != committedVisibleLabelFeatureIds
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
    if var latestState = instances[instanceId] {
      maybeElectMountedHiddenExecutionBatch(instanceId: instanceId, state: &latestState)
      if var armedState = instances[instanceId] {
        maybeEmitExecutionBatchArmed(instanceId: instanceId, state: &armedState)
        if var readyState = instances[instanceId] {
          startEnterPresentationIfReady(instanceId: instanceId, state: &readyState)
        }
      }
    }
    return [
      "visibleLabelFeatureIds": committedVisibleLabelFeatureIds,
      "layerRenderedFeatureCount": layerRenderedFeatureCount,
      "effectiveRenderedFeatureCount": max(
        effectiveRenderedFeatureCount,
        committedVisibleLabelFeatureIds.count
      ),
    ].merging(
      Self.renderedLabelCollisionContractFields(
        visibleLabelFeatureIds: committedVisibleLabelFeatureIds,
        roleTable: mutableState.markerRoleTable
      )
    ) { _, new in new }
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
      "layerRenderedFeatureCount": labelObservation.lastLayerRenderedFeatureCount,
      "effectiveRenderedFeatureCount": labelObservation.lastEffectiveRenderedFeatureCount,
    ].merging(
      Self.renderedLabelCollisionContractFields(
        visibleLabelFeatureIds: labelObservation.lastVisibleLabelFeatureIds,
        roleTable: state.markerRoleTable
      )
    ) { _, new in new }
  }

  private func configureLabelObservation(
    instanceId: String,
    observationEnabled: Bool,
    commitVisibleLabelHits: Bool,
    refreshMsIdle: Double,
    refreshMsMoving: Double,
    labelResetRequestKey: String?
  ) {
    guard var state = instances[instanceId] else {
      return
    }
    let canRefreshRenderedLabels = !Self.isVisualSourceInactiveOrDismissing(state)
    var labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    labelFamilyState.labelObservation.observationEnabled = observationEnabled
    labelFamilyState.labelObservation.commitVisibleLabelHits = commitVisibleLabelHits
    labelFamilyState.labelObservation.refreshMsIdle = refreshMsIdle
    labelFamilyState.labelObservation.refreshMsMoving = refreshMsMoving
    if labelFamilyState.labelObservation.configuredResetRequestKey != labelResetRequestKey {
      labelFamilyState.labelObservation.hasCommittedObservationForConfiguredRequest = false
    }
    labelFamilyState.labelObservation.configuredResetRequestKey = labelResetRequestKey
    labelFamilyState.labelObservation.movingNoopRefreshStreak = 0
    labelFamilyState.labelObservation.movingAdaptiveRefreshMs = refreshMsMoving
    let shouldClearVisibleLabelHits = !observationEnabled || !commitVisibleLabelHits
    let didClearVisibleLabelHits =
      shouldClearVisibleLabelHits &&
      !labelFamilyState.settledVisibleFeatureIds.isEmpty
    if didClearVisibleLabelHits {
      labelFamilyState.settledVisibleFeatureIds.removeAll()
      labelFamilyState.labelObservation.settledVisibleMissingStreakByFeatureId.removeAll()
    }
    if !observationEnabled {
      labelFamilyState.labelObservation.isRefreshInFlight = false
      labelFamilyState.labelObservation.queuedRefreshDelayMs = nil
      labelObservationRefreshWorkItems[instanceId]?.cancel()
      labelObservationRefreshWorkItems[instanceId] = nil
    } else if !canRefreshRenderedLabels {
      labelFamilyState.labelObservation.isRefreshInFlight = false
      labelFamilyState.labelObservation.queuedRefreshDelayMs = nil
      labelObservationRefreshWorkItems[instanceId]?.cancel()
      labelObservationRefreshWorkItems[instanceId] = nil
    }
    Self.setDerivedFamilyState(labelFamilyState, sourceId: state.labelSourceId, state: &state)
    instances[instanceId] = state
    if didClearVisibleLabelHits && canRefreshRenderedLabels {
      do {
        try reconcileAndApplyCurrentFrameSnapshots(
          for: instanceId,
          allowNewTransitions: Self.shouldAllowObservationDrivenMarkerTransitions(state)
        )
      } catch {
        emit([
          "type": "error",
          "instanceId": instanceId,
          "message": "visible_label_hit_clear_failed: \(error.localizedDescription)",
        ])
      }
    }
    if observationEnabled {
      emit(
        Self.labelObservationEventPayload(from: currentRenderedLabelObservationSnapshot(instanceId: instanceId))
          .merging(["type": "label_observation_updated", "instanceId": instanceId]) { _, new in new }
      )
      if canRefreshRenderedLabels {
        scheduleLabelObservationRefresh(instanceId: instanceId, delayMs: 0)
      }
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
    guard !Self.isVisualSourceInactiveOrDismissing(state) else {
      labelObservationRefreshWorkItems[instanceId]?.cancel()
      labelObservationRefreshWorkItems[instanceId] = nil
      return
    }
    var labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    guard labelFamilyState.labelObservation.observationEnabled else {
      labelObservationRefreshWorkItems[instanceId]?.cancel()
      labelObservationRefreshWorkItems[instanceId] = nil
      return
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
    guard !Self.isVisualSourceInactiveOrDismissing(state) else {
      labelObservationRefreshWorkItems[instanceId]?.cancel()
      labelObservationRefreshWorkItems[instanceId] = nil
      return
    }
    var labelFamilyState = Self.derivedFamilyState(sourceId: state.labelSourceId, state: state)
    labelFamilyState.labelObservation.isRefreshInFlight = false
    let nextDelayMs = labelFamilyState.labelObservation.queuedRefreshDelayMs
    labelFamilyState.labelObservation.queuedRefreshDelayMs = nil
    Self.setDerivedFamilyState(labelFamilyState, sourceId: state.labelSourceId, state: &state)
    instances[instanceId] = state
    if state.visualSourceLifecycleState == .dismissing ||
      state.visualSourceLifecycleState == .hidden {
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
      state.visualSourceLifecycleState == .hidden {
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
      state.visualSourceLifecycleState == .hidden {
      labelObservationRefreshWorkItems[instanceId]?.cancel()
      labelObservationRefreshWorkItems[instanceId] = nil
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
        visibleLabelFeatureIds: [],
        layerRenderedFeatureCount: 0,
        effectiveRenderedFeatureCount: 0,
        commitVisibleLabelHits: labelFamilyState.labelObservation.commitVisibleLabelHits,
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
    let resolvedLayerIds = state.labelLayerIds
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
    // Rendered-dot observation (parallel to the label observation): how many of
    // the demoted markers' dots actually painted vs how many should be visible.
    let dotLayerIds = state.nativePressTargetConfig.dotLayerIds
    if !dotLayerIds.isEmpty {
      let dotSourceId = state.dotSourceId
      let demotedMarkerKeys = Set(state.markerRoleTable.dotMarkerKeysInOrder)
      handle.mapView.mapboxMap.queryRenderedFeatures(
        with: queryRect,
        options: RenderedQueryOptions(layerIds: dotLayerIds, filter: nil)
      ) { [weak self] dotResult in
        DispatchQueue.main.async {
          guard let self, case .success(let dotFeatures) = dotResult else {
            return
          }
          let renderedDemoted = Self.renderedDemotedDotMarkerKeys(
            from: dotFeatures,
            dotSourceId: dotSourceId,
            demotedMarkerKeys: demotedMarkerKeys
          )
          self.emit([
            "type": "map_rendered_dot_observation",
            "instanceId": instanceId,
            "expectedDemotedDotCount": demotedMarkerKeys.count,
            "renderedDemotedDotCount": renderedDemoted.count,
            "culledDemotedDotCount": max(0, demotedMarkerKeys.count - renderedDemoted.count),
            "renderedDotFeatureCount": dotFeatures.count,
            "emittedAtMs": Self.nowMs(),
          ])
        }
      }
    }
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
          latestState.visualSourceLifecycleState != .hidden
        else {
          self.completeLabelObservationRefresh(instanceId: instanceId)
          return
        }
        switch result {
        case .failure:
          self.completeLabelObservationRefresh(instanceId: instanceId)
          self.retryLabelObservationRefreshIfPlacementPending(instanceId: instanceId, delayMs: 16)
        case .success(let features):
          let primaryObservation = Self.buildRenderedLabelObservation(
            from: features,
            allowedSourceIds: [latestState.pinBundleSourceId]
          )
          let snapshot = self.commitRenderedLabelObservation(
            instanceId: instanceId,
            visibleLabelFeatureIds: primaryObservation,
            layerRenderedFeatureCount: features.count,
            effectiveRenderedFeatureCount: features.count,
            commitVisibleLabelHits: labelFamilyState.labelObservation.commitVisibleLabelHits,
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

  private static func emptyRenderedLabelObservationResult() -> [String: Any] {
    [
      "visibleLabelFeatureIds": [],
      "layerRenderedFeatureCount": 0,
      "effectiveRenderedFeatureCount": 0,
      "nativeVisibleLabelsWithoutPromotedPinCount": 0,
      "nativeVisibleLabelsForDemotedMarkerCount": 0,
      "nativeMultipleVisibleLabelCandidateMarkerCount": 0,
      "nativeVisibleLabelsWithoutPromotedPinMarkerKeys": [],
      "nativeVisibleLabelsForDemotedMarkerKeys": [],
      "nativeExpectedPromotedPinCount": 0,
      "nativeExpectedDemotedDotCount": 0,
      "nativePromotedPinCollisionObstacleCount": 0,
      "nativePromotedPinCollisionObstacleCountMatchesPins": true,
    ]
  }

  private static func labelObservationEventPayload(
    from snapshot: [String: Any]
  ) -> [String: Any] {
    return [
      "visibleLabelFeatureIds": snapshot["visibleLabelFeatureIds"] as? [String] ?? [],
      "layerRenderedFeatureCount": snapshot["layerRenderedFeatureCount"] as? Int ?? 0,
      "effectiveRenderedFeatureCount": snapshot["effectiveRenderedFeatureCount"] as? Int ?? 0,
      "nativeVisibleLabelsWithoutPromotedPinCount":
        snapshot["nativeVisibleLabelsWithoutPromotedPinCount"] as? Int ?? 0,
      "nativeVisibleLabelsForDemotedMarkerCount":
        snapshot["nativeVisibleLabelsForDemotedMarkerCount"] as? Int ?? 0,
      "nativeMultipleVisibleLabelCandidateMarkerCount":
        snapshot["nativeMultipleVisibleLabelCandidateMarkerCount"] as? Int ?? 0,
      "nativeVisibleLabelsWithoutPromotedPinMarkerKeys":
        snapshot["nativeVisibleLabelsWithoutPromotedPinMarkerKeys"] as? [String] ?? [],
      "nativeVisibleLabelsForDemotedMarkerKeys":
        snapshot["nativeVisibleLabelsForDemotedMarkerKeys"] as? [String] ?? [],
      "nativeExpectedPromotedPinCount":
        snapshot["nativeExpectedPromotedPinCount"] as? Int ?? 0,
      "nativeExpectedDemotedDotCount":
        snapshot["nativeExpectedDemotedDotCount"] as? Int ?? 0,
      "nativePromotedPinCollisionObstacleCount":
        snapshot["nativePromotedPinCollisionObstacleCount"] as? Int ?? 0,
      "nativePromotedPinCollisionObstacleCountMatchesPins":
        snapshot["nativePromotedPinCollisionObstacleCountMatchesPins"] as? Bool ?? true,
    ]
  }

  private static func renderedLabelCollisionContractFields(
    visibleLabelFeatureIds: [String],
    roleTable: MarkerRoleTable
  ) -> [String: Any] {
    let promotedMarkerKeys = Set(roleTable.pinnedMarkerKeysInOrder)
    let demotedMarkerKeys = Set(roleTable.dotMarkerKeysInOrder)
    var visibleLabelCountsByMarkerKey: [String: Int] = [:]
    var visibleLabelsWithoutPromotedPinCount = 0
    var visibleLabelsForDemotedMarkerCount = 0
    var visibleLabelsWithoutPromotedPinMarkerKeys = Set<String>()
    var visibleLabelsForDemotedMarkerKeys = Set<String>()

    for featureId in visibleLabelFeatureIds {
      guard let markerKey = parseRenderedLabelCandidateFeatureId(featureId)?.markerKey else {
        visibleLabelsWithoutPromotedPinCount += 1
        continue
      }
      visibleLabelCountsByMarkerKey[markerKey, default: 0] += 1
      if !promotedMarkerKeys.contains(markerKey) {
        visibleLabelsWithoutPromotedPinCount += 1
        visibleLabelsWithoutPromotedPinMarkerKeys.insert(markerKey)
      }
      if demotedMarkerKeys.contains(markerKey) {
        visibleLabelsForDemotedMarkerCount += 1
        visibleLabelsForDemotedMarkerKeys.insert(markerKey)
      }
    }

    let promotedPinCollisionObstacleCount = roleTable.pinnedMarkerKeysInOrder.reduce(0) { count, markerKey in
      guard let row = roleTable.rowByMarkerKey[markerKey],
            row.role == "pin",
            row.labelCollisionFeature != nil
      else {
        return count
      }
      return count + 1
    }

    return [
      "nativeVisibleLabelsWithoutPromotedPinCount": visibleLabelsWithoutPromotedPinCount,
      "nativeVisibleLabelsForDemotedMarkerCount": visibleLabelsForDemotedMarkerCount,
      "nativeMultipleVisibleLabelCandidateMarkerCount":
        visibleLabelCountsByMarkerKey.values.filter { $0 > 1 }.count,
      "nativeVisibleLabelsWithoutPromotedPinMarkerKeys":
        Array(visibleLabelsWithoutPromotedPinMarkerKeys).sorted(),
      "nativeVisibleLabelsForDemotedMarkerKeys":
        Array(visibleLabelsForDemotedMarkerKeys).sorted(),
      "nativeExpectedPromotedPinCount": promotedMarkerKeys.count,
      "nativeExpectedDemotedDotCount": demotedMarkerKeys.count,
      "nativePromotedPinCollisionObstacleCount": promotedPinCollisionObstacleCount,
      "nativePromotedPinCollisionObstacleCountMatchesPins":
        promotedPinCollisionObstacleCount == promotedMarkerKeys.count,
    ]
  }

  private static func buildRenderedLabelObservation(
    from features: [QueriedRenderedFeature],
    allowedSourceIds: Set<String>
  ) -> [String] {
    var visibleLabelFeatureIds = Set<String>()
    for feature in features {
      guard allowedSourceIds.contains(feature.queriedFeature.source),
            let featureId = Self.parseRenderedLabelObservationFeature(feature)
      else {
        continue
      }
      visibleLabelFeatureIds.insert(featureId)
    }
    return Array(visibleLabelFeatureIds).sorted()
  }

  // Rendered-dot observation: of the markers that SHOULD show as visible dots
  // (the demoted set), how many actually painted (survived Mapbox collision)?
  // The dot source also holds resident opacity-0 dots for promoted markers, so
  // we intersect rendered dot feature markerKeys with the demoted set to count
  // only the dots that are supposed to be visible.
  private static func renderedDemotedDotMarkerKeys(
    from features: [QueriedRenderedFeature],
    dotSourceId: String,
    demotedMarkerKeys: Set<String>
  ) -> Set<String> {
    var rendered = Set<String>()
    for feature in features where feature.queriedFeature.source == dotSourceId {
      let rawFeature = feature.queriedFeature.feature
      let properties = rawFeature.properties?.turfRawValue as? [String: Any]
      let markerKey = (properties?["markerKey"] as? String)
        ?? rawFeature.identifier.flatMap(Self.featureIdentifierString)
      guard let markerKey, demotedMarkerKeys.contains(markerKey) else {
        continue
      }
      rendered.insert(markerKey)
    }
    return rendered
  }

  private static func parseRenderedLabelObservationFeature(
    _ feature: QueriedRenderedFeature
  ) -> String? {
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
    return featureId ?? Self.buildRenderedLabelCandidateFeatureId(markerKey: markerKey, candidate: candidate)
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
    requiredSourceIds: Set<String>
  ) -> [String: Any]? {
    var candidates: [(
      restaurantId: String,
      coordinate: [String: Any]?,
      lodZ: Double,
      rank: Double,
      featureIndex: Int
    )] = []

    for (featureIndex, feature) in features.enumerated() {
      guard requiredSourceIds.contains(feature.queriedFeature.source),
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

  private static func parseStringArray(_ payload: Any?) -> [String] {
    if let values = payload as? [String] {
      return values
    }
    return (payload as? [Any])?.compactMap { $0 as? String } ?? []
  }

  private static func parseNumberArray(_ payload: Any?) -> [NSNumber] {
    if let values = payload as? [NSNumber] {
      return values
    }
    return (payload as? [Any])?.compactMap { $0 as? NSNumber } ?? []
  }

  private static func rect(from values: [NSNumber], fallback: CGRect) -> CGRect {
    guard values.count == 4 else {
      return fallback
    }
    let x1 = CGFloat(truncating: values[0])
    let y1 = CGFloat(truncating: values[1])
    let x2 = CGFloat(truncating: values[2])
    let y2 = CGFloat(truncating: values[3])
    return CGRect(
      x: min(x1, x2),
      y: min(y1, y2),
      width: abs(x2 - x1),
      height: abs(y2 - y1)
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

  private func managedSourceIds(for state: InstanceState) -> [String] {
    Self.uniqueSourceIds([state.pinBundleSourceId, state.dotSourceId, state.labelCollisionSourceId])
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
    guard !Self.isVisualSourceInactiveOrDismissing(state) else {
      cancelLivePinTransitionAnimation(instanceId: instanceId)
      sourceRecoveryWorkItems[instanceId]?.cancel()
      sourceRecoveryWorkItems[instanceId] = nil
      state.isAwaitingSourceRecovery = false
      state.isReplayingSourceRecovery = false
      instances[instanceId] = state
      return
    }
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
    if let state = instances[instanceId],
       Self.isVisualSourceInactiveOrDismissing(state) {
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
      guard !Self.isVisualSourceInactiveOrDismissing(state) else {
        state.isAwaitingSourceRecovery = false
        state.isReplayingSourceRecovery = false
        self.instances[instanceId] = state
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

  private func installMapSubscriptions(for mapTag: NSNumber, handle: ResolvedMapHandle) {
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
    if handle.nativePressGestureRecognizer == nil {
      let recognizer = NativePressLifecycleGestureRecognizer()
      recognizer.onPressBegan = { [weak self, weak handle] point in
        guard let self, let handle else { return }
        self.handleNativePressBegan(mapTag: mapTag, handle: handle, point: point)
      }
      recognizer.onPressMoved = { [weak self, weak handle] point in
        guard let self, let handle else { return }
        self.handleNativePressMoved(mapTag: mapTag, handle: handle, point: point)
      }
      recognizer.onPressEnded = { [weak self, weak handle] point in
        guard let self, let handle else { return }
        self.handleNativePressEnded(mapTag: mapTag, handle: handle, point: point)
      }
      recognizer.onPressCancelled = { [weak self, weak handle] in
        guard let self, let handle else { return }
        self.cancelNativePressSession(handle: handle)
      }
      handle.mapView.addGestureRecognizer(recognizer)
      handle.nativePressGestureRecognizer = recognizer
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
      guard !Self.isVisualSourceInactiveOrDismissing(state) else {
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
      if sourceId == state.pinSourceId || sourceId == state.pinBundleSourceId {
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

  private func handleNativePressBegan(
    mapTag: NSNumber,
    handle: ResolvedMapHandle,
    point: CGPoint
  ) {
    guard let pressContext = activeNativePressContext(mapTag: mapTag) else {
      handle.nativePressSession = nil
      return
    }
    handle.nativePressSequence += 1
    let sequence = handle.nativePressSequence
    handle.nativePressSession = NativePressSession(
      sequence: sequence,
      instanceId: pressContext.instanceId,
      startedAtMs: Self.nowMs(),
      startPoint: point,
      latestPoint: point
    )
    let coordinate = handle.mapView.mapboxMap.coordinate(for: point)
    let dotRadius = pressContext.config.dotTapIntentRadiusPx
    let dotQueryRect = dotRadius > 0
      ? CGRect(
        x: point.x - dotRadius,
        y: point.y - dotRadius,
        width: dotRadius * 2,
        height: dotRadius * 2
      )
      : CGRect(x: point.x - 0.5, y: point.y - 0.5, width: 1, height: 1)
    resolveRenderedPressTarget(
      instanceId: pressContext.instanceId,
      state: pressContext.state,
      handle: handle,
      point: point,
      pinLayerIds: pressContext.config.pinLayerIds,
      labelLayerIds: pressContext.config.labelLayerIds,
      labelTapHitbox: pressContext.config.labelTapHitbox,
      dotLayerIds: pressContext.config.dotLayerIds,
      dotQueryRect: dotQueryRect,
      labelQueryRect: CGRect(x: point.x - 0.5, y: point.y - 0.5, width: 1, height: 1),
      tapCoordinate: (lng: coordinate.longitude, lat: coordinate.latitude)
    ) { [weak self, weak handle] result in
      guard let self, let handle else { return }
      guard let state = self.instances[pressContext.instanceId],
            !Self.isVisualSourceInactiveOrDismissing(state)
      else {
        handle.nativePressSession = nil
        return
      }
      guard var session = handle.nativePressSession,
            session.sequence == sequence,
            !session.didCancel
      else {
        return
      }
      switch result {
      case .success(let target):
        session.resolvedTarget = target
        session.didResolve = true
        handle.nativePressSession = session
        if session.didRelease {
          self.emitNativePressResolution(mapTag: mapTag, handle: handle, session: session)
        }
      case .failure(let error):
        self.emit([
          "type": "error",
          "instanceId": pressContext.instanceId,
          "message": "native_press_target_resolution_failed: \(error.localizedDescription)",
        ])
        handle.nativePressSession = nil
      }
    }
  }

  private func handleNativePressMoved(
    mapTag: NSNumber,
    handle: ResolvedMapHandle,
    point: CGPoint
  ) {
    guard var session = handle.nativePressSession else {
      return
    }
    guard let state = instances[session.instanceId],
          !Self.isVisualSourceInactiveOrDismissing(state)
    else {
      handle.nativePressSession = nil
      return
    }
    session.latestPoint = point
    let dx = point.x - session.startPoint.x
    let dy = point.y - session.startPoint.y
    if hypot(dx, dy) > nativePressCancelMovementThresholdPx {
      session.didCancel = true
      handle.nativePressSession = nil
      return
    }
    handle.nativePressSession = session
  }

  private func handleNativePressEnded(
    mapTag: NSNumber,
    handle: ResolvedMapHandle,
    point: CGPoint
  ) {
    guard var session = handle.nativePressSession else {
      return
    }
    guard let state = instances[session.instanceId],
          !Self.isVisualSourceInactiveOrDismissing(state)
    else {
      handle.nativePressSession = nil
      return
    }
    session.latestPoint = point
    let dx = point.x - session.startPoint.x
    let dy = point.y - session.startPoint.y
    guard hypot(dx, dy) <= nativePressCancelMovementThresholdPx else {
      handle.nativePressSession = nil
      return
    }
    session.didRelease = true
    handle.nativePressSession = session
    if session.didResolve {
      emitNativePressResolution(mapTag: mapTag, handle: handle, session: session)
    }
  }

  private func cancelNativePressSession(handle: ResolvedMapHandle) {
    handle.nativePressSession = nil
  }

  private func activeNativePressContext(
    mapTag: NSNumber
  ) -> (instanceId: String, state: InstanceState, config: NativePressTargetConfig)? {
    for instanceId in instances.keys.sorted() {
      guard let state = instances[instanceId],
            state.mapTag == mapTag,
            state.nativePressTargetConfig.enabled,
            state.interactionMode == "enabled",
            state.visualSourceLifecycleState != .dismissing,
            state.visualSourceLifecycleState != .hidden
      else {
        continue
      }
      return (instanceId, state, state.nativePressTargetConfig)
    }
    return nil
  }

  private func emitNativePressResolution(
    mapTag: NSNumber,
    handle: ResolvedMapHandle,
    session: NativePressSession
  ) {
    guard handle.nativePressSession?.sequence == session.sequence else {
      return
    }
    handle.nativePressSession = nil
    guard let state = instances[session.instanceId],
          state.mapTag == mapTag,
          state.nativePressTargetConfig.enabled,
          state.interactionMode == "enabled",
          state.visualSourceLifecycleState != .dismissing,
          state.visualSourceLifecycleState != .hidden
    else {
      return
    }
    let pressCoordinate = handle.mapView.mapboxMap.coordinate(for: session.startPoint)
    emit([
      "type": "native_press_target_resolved",
      "instanceId": session.instanceId,
      "sequence": session.sequence,
      "target": session.resolvedTarget ?? NSNull(),
      "point": [
        "x": Double(session.startPoint.x),
        "y": Double(session.startPoint.y),
      ],
      "pressCoordinate": [
        "lng": pressCoordinate.longitude,
        "lat": pressCoordinate.latitude,
      ],
      "durationMs": Self.round1(Self.nowMs() - session.startedAtMs),
      "resolvedAtMs": Self.nowMs(),
    ])
  }

  // Stage B (B2): project the ranked candidate catalog to screen space under the
  // LIVE camera and return the markerKeys whose projected point lands inside the
  // view rect (+pad). This is pitch/twist-accurate, unlike a lat/lng AABB. The
  // coordinate round-trip rejects coords behind the camera / over the horizon,
  // which `point(for:)` would otherwise project to bogus on-screen points.
  private func computeOnScreenMarkerKeys(
    catalog: [CandidateCatalogEntry],
    handle: ResolvedMapHandle,
    previouslyVisible: Set<String>
  ) -> [String] {
    // The decision (rect/pad containment, finiteness, behind-camera round-trip
    // guard, loop) lives in MapLodKit.ScreenSpaceVisibility — the single,
    // unit-tested source of truth (see MapLodKit/Tests). Only the raw Mapbox
    // projection stays here, injected as closures. Enter/exit pads differ
    // (spatial hysteresis) so an edge marker cannot oscillate its LOD role.
    return ScreenSpaceVisibility.onScreenMarkerKeys(
      catalog: catalog.map {
        ScreenSpaceVisibility.CatalogEntry(markerKey: $0.markerKey, coordinate: $0.coordinate)
      },
      viewBounds: handle.mapView.bounds,
      padPx: nativeScreenSpaceVisibilityPadPx,
      exitPadPx: nativeScreenSpaceVisibilityExitPadPx,
      previouslyVisible: previouslyVisible,
      project: { handle.mapView.mapboxMap.point(for: $0) },
      unproject: { handle.mapView.mapboxMap.coordinate(for: $0) }
    )
  }

  // Stage B (B2): project the resident candidate catalog to screen space against the
  // CURRENT camera and emit `map_native_visible_markers` when the on-screen set changed
  // (mutating the stored signature). The single source of truth for "what is on screen
  // right now" — called both on every camera tick (handleNativeCameraChanged) AND
  // immediately after a fresh catalog/source frame arrives (setCandidateCatalog /
  // setRenderFrame post-applySnapshot), so a brand-new search has a real on-screen set
  // at the FIRST decision instead of deferring to the next camera move. The previous
  // visible set is recovered from the stored signature (sorted keys joined with "|";
  // marker keys never contain "|") to feed the spatial enter/exit hysteresis.
  // `reason` distinguishes camera ticks from data-arrival projections in diagnostics.
  // Returns true when a (possibly empty) set was projected and the signature updated.
  // LOD OBSERVABILITY HARNESS: emit a structured [lodev] JSON event stream (one object per
  // line) covering everything about LOD + map objects, captured via `simctl log stream`. See
  // plans/lod-observability-harness.md + scripts/lod-harness.sh. Enabled by default for now;
  // make JS-controllable later so it is free in prod.
  static let lodHarnessEnabled = true
  static func harnessLog(_ json: String) {
    NSLog("[lodev] %@", json)
  }

  // GRANULAR LOD (native-owned, Phase 2). Apply the native promotion decision
  // (nativePromotedKeysInOrder, computed by projectAndEmitOnScreenMarkers from the on-screen
  // set) to the role table and drive the per-pin pin↔dot crossfade for ONLY the markers whose
  // role changed this frame. No JS round-trip, no whole-frame republish — reconcile scopes its
  // work to affectedMarkerKeys.
  private func driveNativeLod(instanceId: String) {
    guard var state = instances[instanceId] else {
      return
    }
    // Only when fully VISIBLE: during the reveal preroll the presentation lane owns the fade
    // and JS seeds the initial roles; taking over there risks reveal interference. Native owns
    // per-frame LOD once the surface is visible (normal pan/zoom).
    guard state.visualSourceLifecycleState == .visible else {
      return
    }
    let rows = state.markerRoleTable.rowByMarkerKey
    // Only promote markers that have a resident row (a pin feature to show).
    let basePinned = state.nativePromotedKeysInOrder.filter { rows[$0] != nil }
    // FORCE-PROMOTE the selected/tapped marker(s) regardless of rank or visibility, so a
    // tapped pin stays a pin when you pan (mirrors JS collectSelectedEntries).
    let basePinnedSet = Set(basePinned)
    let forcedPromote = state.highlightedMarkerKeys.filter { rows[$0] != nil && !basePinnedSet.contains($0) }
    let nextPinned = basePinned + forcedPromote
    let nextPinnedSet = Set(nextPinned)
    let prevPinnedSet = Set(state.markerRoleTable.pinnedMarkerKeysInOrder)
    let affected = prevPinnedSet.symmetricDifference(nextPinnedSet)
    guard !affected.isEmpty else {
      return
    }
    // HARNESS [lodev] lod event: the role flips this frame. promote/demote counts + whether
    // we're mid-gesture + whether the apply will actually animate (allowNew). If affected>0 &&
    // moving && allowNew but the pins still snap on settle, the deferral is DOWNSTREAM of here.
    if Self.lodHarnessEnabled {
      let promoteKeys = nextPinnedSet.subtracting(prevPinnedSet)
      let demoteKeys = prevPinnedSet.subtracting(nextPinnedSet)
      let allowNew = Self.allowsIncrementalMarkerTransitions(state, allowNewTransitions: true)
      let promoteRanks = promoteKeys.compactMap { k in state.candidateCatalog.first { $0.markerKey == k }?.rank }.sorted()
      Self.harnessLog(
        "{\"ev\":\"lod\",\"t\":\(Int(Self.nowMs())),\"moving\":\(state.currentViewportIsMoving),"
          + "\"affected\":\(affected.count),\"promote\":\(promoteKeys.count),\"demote\":\(demoteKeys.count),"
          + "\"allowNew\":\(allowNew),\"promoteRanks\":\"\(promoteRanks.prefix(8).map(String.init).joined(separator: ","))\"}"
      )
    }
    let residentDots = state.markerRoleTable.residentDotMarkerKeysInOrder.isEmpty
      ? Array(rows.keys)
      : state.markerRoleTable.residentDotMarkerKeysInOrder
    state.markerRoleTable.pinnedMarkerKeysInOrder = nextPinned
    // A marker is a visible DOT iff it is resident and NOT promoted (the crossfade partner).
    state.markerRoleTable.dotMarkerKeysInOrder = residentDots.filter { !nextPinnedSet.contains($0) }
    instances[instanceId] = state
    do {
      try reconcileAndApplyLiveMarkerRoleOutputs(
        for: instanceId,
        affectedMarkerKeys: affected,
        allowNewTransitions: true,
        reason: "native_lod"
      )
    } catch {
      NSLog("[mapdiag] native_lod reconcile failed: %@", error.localizedDescription)
    }
  }

  @discardableResult
  private func projectAndEmitOnScreenMarkers(
    instanceId: String,
    state: inout InstanceState,
    handle: ResolvedMapHandle,
    reason: String,
    isMoving: Bool
  ) -> Bool {
    // Respect the existing hidden/dismissing gating — never project a stale frame for a
    // source that is not on screen (mirrors handleNativeCameraChanged's per-instance guard).
    guard !Self.isVisualSourceInactiveOrDismissing(state) else {
      return false
    }
    guard !state.candidateCatalog.isEmpty else {
      return false
    }
    let previousSignature = state.lastVisibleMarkerSetSignature ?? ""
    let previouslyVisible = previousSignature.isEmpty
      ? Set<String>()
      : Set(previousSignature.components(separatedBy: "|"))
    let onScreenKeys = computeOnScreenMarkerKeys(
      catalog: state.candidateCatalog,
      handle: handle,
      previouslyVisible: previouslyVisible
    )
    let visibleSignature = onScreenKeys.sorted().joined(separator: "|")
    guard visibleSignature != state.lastVisibleMarkerSetSignature else {
      return false
    }
    state.lastVisibleMarkerSetSignature = visibleSignature
    // NATIVE-OWNED PROMOTION DECISION. A marker is a PIN iff it is in the top-`maxFullPins`
    // by rank among the on-screen markers (the native projection IS the visibility truth, with
    // spatial enter/exit hysteresis). Computed here per camera frame from data native already
    // has (catalog rank + the on-screen set) — no JS round-trip.
    let shadowLodMaxFullPins = 40
    let rankByKey = Dictionary(
      state.candidateCatalog.map { ($0.markerKey, $0.rank) }, uniquingKeysWith: { first, _ in first }
    )
    let nativePromotedKeys = Array(
      onScreenKeys
        .sorted { (rankByKey[$0] ?? Int.max) < (rankByKey[$1] ?? Int.max) }
        .prefix(shadowLodMaxFullPins)
    )
    state.nativePromotedKeysInOrder = nativePromotedKeys
    // HARNESS [lodev] frame event: on-screen membership, promoted count, and per-frame
    // enter/leave deltas (group-enter detector), with camera + motion.
    if Self.lodHarnessEnabled {
      let onScreenSet = Set(onScreenKeys)
      let enterCount = onScreenSet.subtracting(previouslyVisible).count
      let leaveCount = previouslyVisible.subtracting(onScreenSet).count
      let cam = handle.mapView.mapboxMap.cameraState
      Self.harnessLog(
        "{\"ev\":\"frame\",\"t\":\(Int(Self.nowMs())),\"e\":\(Int(Date().timeIntervalSince1970 * 1000)),"
          + "\"reason\":\"\(reason)\",\"moving\":\(isMoving),"
          + "\"visible\":\(onScreenKeys.count),\"promoted\":\(nativePromotedKeys.count),"
          + "\"enter\":\(enterCount),\"leave\":\(leaveCount),"
          + "\"pitch\":\(String(format: "%.1f", cam.pitch)),\"zoom\":\(String(format: "%.2f", cam.zoom))}"
      )
    }
    let cameraState = handle.mapView.mapboxMap.cameraState
    emit([
      "type": "map_native_visible_markers",
      "instanceId": instanceId,
      "markerKeys": onScreenKeys,
      "markerCount": onScreenKeys.count,
      "nativePromotedKeys": nativePromotedKeys,
      "nativePromotedCount": nativePromotedKeys.count,
      "catalogCount": state.candidateCatalog.count,
      "zoom": cameraState.zoom,
      "bearing": cameraState.bearing,
      "pitch": cameraState.pitch,
      "isMoving": isMoving,
      "reason": reason,
    ])
    return true
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
      String(Int((cameraState.bearing * 100).rounded())),
      String(Int((cameraState.pitch * 100).rounded())),
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
      guard !Self.isVisualSourceInactiveOrDismissing(state) else {
        labelObservationRefreshWorkItems[instanceId]?.cancel()
        labelObservationRefreshWorkItems[instanceId] = nil
        continue
      }
      var nextState = state
      nextState.currentViewportIsMoving = isMoving
      // Pin z-order is native (viewport-y) — no per-slot moveLayer pass on camera move.
      // Still emit a lightweight pin_visual_order_contract so the promotion-stability
      // detector (no collapse-and-recover oscillation during movement) keeps working;
      // z-order itself is now Mapbox-native, so usesViewportYZOrder=true and the old
      // moveLayer fields are reported as stable/no-op.
      let pinnedCount = nextState.markerRoleTable.pinnedMarkerKeysInOrder.count
      if pinnedCount > 0 {
        emit([
          "type": "pin_visual_order_contract",
          "instanceId": instanceId,
          "reason": isMoving ? "camera_moving" : "camera_idle",
          "pinCount": pinnedCount,
          "selectedPinCount": nextState.highlightedMarkerKeys.count,
          "movedGroupCount": 0,
          "previousGroupCount": pinnedCount,
          "screenYOrderViolationCount": 0,
          "stableSlotOwnership": true,
          "appliesScreenYOrdering": true,
          "usesLayerMoves": false,
          "usesViewportYZOrder": true,
          "sourceMutationCount": 0,
          "isMoving": isMoving,
          "cameraZoom": cameraState.zoom,
          "cameraBearing": cameraState.bearing,
          "emittedAtMs": Self.nowMs(),
        ])
      }
      // Stage B (B2): emit the screen-space on-screen marker set whenever it
      // changes (on camera move/idle), so JS can drive promotion/demotion off true
      // projected visibility instead of a padded lat/lng AABB. Throttled to
      // set-change to bound bridge traffic during gestures.
      projectAndEmitOnScreenMarkers(
        instanceId: instanceId,
        state: &nextState,
        handle: handle,
        reason: isMoving ? "camera_moving" : "camera_idle",
        isMoving: isMoving
      )
      instances[instanceId] = nextState
      // GRANULAR LOD (native-owned, Phase 2): apply the just-computed promotion decision to
      // the role table and crossfade ONLY the markers whose role changed — per-pin, native,
      // no JS round-trip / whole-frame republish.
      driveNativeLod(instanceId: instanceId)
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
        "bearing": cameraState.bearing,
        "pitch": cameraState.pitch,
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
    if state.blockedEnterStartRequestKey != nil,
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
      startEnterPresentationIfReady(instanceId: instanceId, state: &state)
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
      // Resident-data end state: sources stay mounted while hidden, so the mounted revision is
      // authoritative in every phase (no hidden-only source cache anymore).
      return Self.mountedSourceState(sourceId: sourceId, state: state)?.sourceRevision ?? ""
    }
    return [
      "pins": sourceRevision(state.pinSourceId),
      "pinInteractions": sourceRevision(state.pinInteractionSourceId),
      "dots": sourceRevision(state.dotSourceId),
      "labels": sourceRevision(state.labelSourceId),
      "labelCollisions": sourceRevision(state.labelCollisionSourceId),
    ]
  }

  private static func parseRenderSourceRevisions(_ value: Any?) -> [String: String]? {
    guard let dictionary = value as? [String: Any] else {
      return nil
    }
    let sourceIds = [
      "pins",
      "pinInteractions",
      "dots",
      "labels",
      "labelCollisions",
    ]
    var revisions: [String: String] = [:]
    revisions.reserveCapacity(sourceIds.count)
    for sourceId in sourceIds {
      guard let revision = dictionary[sourceId] as? String else {
        return nil
      }
      revisions[sourceId] = revision
    }
    return revisions
  }

  private static func doesSourceAdmissionPublishResidentSnapshot(_ sourceAdmissionOutcome: String) -> Bool {
    sourceAdmissionOutcome == "sources_applied_hidden" ||
      sourceAdmissionOutcome == "sources_applied_visible" ||
      sourceAdmissionOutcome == "sources_reused_resident"
  }

  private func capturePendingVisualSourceCommitFence(state: InstanceState) -> [String: Set<String>] {
    var fenceBySourceId: [String: Set<String>] = [:]
    for sourceId in visualSourceIds(for: state) {
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

  // Arms the reveal-start deadlock watchdog. `resetAttemptCount` is true when the reveal is
  // first armed (from `beginRevealVisualLifecycle`) so a fresh reveal starts with a clean
  // re-attempt budget; the watchdog re-arms itself with it false to preserve the running count.
  private func armRevealStartDeadlockFallback(
    instanceId: String,
    requestKey: String,
    resetAttemptCount: Bool = false
  ) {
    revealStartDeadlockFallbackWorkItems[instanceId]?.cancel()
    if resetAttemptCount {
      revealStartDeadlockReattemptCountByInstance[instanceId] = 0
    }
    let workItem = DispatchWorkItem { [weak self] in
      guard let self else { return }
      self.revealStartDeadlockFallbackWorkItems[instanceId] = nil
      guard let state = self.instances[instanceId] else { return }
      // Only fire for the reveal request this watchdog was armed for, and only if that reveal
      // has not already started (normal gate won) and is not being dismissed.
      guard state.lastEnterRequestKey == requestKey else { return }
      guard state.lastEnterStartedRequestKey != requestKey else { return }
      guard state.lastDismissRequestKey == nil else { return }
      guard !Self.isVisualSourceInactiveOrDismissing(state) else { return }
      // Re-attempt placement (re-wake layers + re-schedule the observation refresh). NEVER
      // bypasses the gate — the reveal still only starts once placement actually commits.
      self.reattemptLabelPlacementIfRevealStalled(instanceId: instanceId)
    }
    revealStartDeadlockFallbackWorkItems[instanceId] = workItem
    DispatchQueue.main.asyncAfter(
      deadline: .now() + .milliseconds(revealStartDeadlockFallbackDelayMs),
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
    forceReplaceSourceData: Bool = false,
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

    if forceReplaceSourceData || previousSourceLifecyclePhase != .incremental {
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
      nextSourceState: nextSourceState,
      forceReplaceSourceData: plan.forceReplaceSourceData
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
        forceReplaceSourceData: plan.forceReplaceSourceData,
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
    var sourceFamilyBySourceId = [
      state.pinSourceId: "pins",
      state.pinInteractionSourceId: "pinInteractions",
      state.dotSourceId: "dots",
      state.labelSourceId: "labels",
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
      // LOD RENDER-SNAP detector (the user-visible "fade out → flash IN at full →
      // flash out"). The stepper only interpolates, so an INSTANT opacity jump can
      // only come from this publish path: (a) REMOVING a stepper-owned feature-state
      // key while it was holding the marker at a different opacity than the baked
      // ['get'] fallback — render snaps to baked (stale 1 for a marker that demoted
      // since its last property rewrite, and the corrected source data lands frames
      // later → flash in, then flash out); (b) SETTING a stepper-owned key far from
      // its previous value (instant jump bypassing the crossfade). Emits per batch
      // with per-marker samples so the flash is attributable, not inferred.
      // NOTE: this measures what the publish pipeline PRODUCES. Since
      // applyFeatureStates filters stepperOwnedRenderFeatureStateKeys, none of these
      // reach Mapbox — events here are upstream-staleness diagnostics, not rendered
      // snaps (blockedByStepperOwnership: true in the payload).
      if plan.previousFeatureStateRevision != plan.nextSourceState.featureStateRevision {
        var fsRemovalFlashCount = 0
        var fsJumpCount = 0
        var snapSamples: [[String: Any]] = []
        for featureId in plan.nextSourceState.featureStateChangedIds {
          let previousState = plan.previousFeatureStateById[featureId] ?? [:]
          let nextState = plan.nextSourceState.featureStateById[featureId] ?? [:]
          for key in ["nativeLodOpacity", "nativeLodRankOpacity", "nativeDotOpacity", "nativeLabelOpacity"] {
            guard let prevValue = Self.numberValue(from: previousState[key]) else {
              continue
            }
            if nextState[key] == nil {
              // ANY removal of a stepper-owned key is a defect: the diffKey excludes
              // role-opacity properties, so the baked ['get'] fallback in MAPBOX still
              // holds the marker's FIRST-publish role (1 for anything ever promoted) —
              // the JS-side recomputed property never reaches the style. Removal ≙
              // instant revert to the original role (the flash), regardless of what
              // plan.next thinks the baked value is.
              let bakedNext = Self.numberValue(
                from: (plan.next.featureById[featureId]?.properties?.turfRawValue as? [String: Any])?[key]
              )
              let rewrittenThisBatch =
                plan.nextSourceState.updatedFeatureIdsInOrder.contains(featureId) ||
                plan.nextSourceState.addedFeatureIdsInOrder.contains(featureId)
              fsRemovalFlashCount += 1
              if snapSamples.count < 8 {
                snapSamples.append([
                  "k": featureId, "key": key, "kind": "remove",
                  "prevFs": prevValue, "bakedNext": bakedNext ?? -1,
                  "rewritten": rewrittenThisBatch,
                ])
              }
            } else if let nextValue = Self.numberValue(from: nextState[key]),
                      abs(nextValue - prevValue) > 0.5 {
              fsJumpCount += 1
              if snapSamples.count < 8 {
                snapSamples.append([
                  "k": featureId, "key": key, "kind": "set",
                  "prevFs": prevValue, "nextFs": nextValue,
                ])
              }
            }
          }
        }
        if fsRemovalFlashCount > 0 || fsJumpCount > 0 {
          emit([
            "type": "lod_render_snap_contract",
            "instanceId": instanceId,
            "sourceId": plan.sourceId,
            "fsRemovalFlashCount": fsRemovalFlashCount,
            "fsJumpCount": fsJumpCount,
            "blockedByStepperOwnership": true,
            "samples": snapSamples,
            "emittedAtMs": Self.nowMs(),
          ])
        }
      }
      let featureStatesStartedAt = CACurrentMediaTime() * 1000
      Self.applyFeatureStates(
        sourceId: plan.sourceId,
        previousFeatureStateRevision: plan.previousFeatureStateRevision,
        nextFeatureStateRevision: plan.nextSourceState.featureStateRevision,
        changedFeatureStateIds: plan.nextSourceState.featureStateChangedIds,
        featureStateById: plan.nextSourceState.featureStateById,
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
    labelSourceId: String,
    labelCollisionSourceId: String
  ) -> [String: DerivedFamilyState] {
    return [
      pinSourceId: emptyDerivedFamilyState(),
      pinInteractionSourceId: emptyDerivedFamilyState(),
      dotSourceId: emptyDerivedFamilyState(),
      labelSourceId: emptyDerivedFamilyState(),
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
    var familyState = state.derivedFamilyStates[sourceId] ?? emptyDerivedFamilyState()
    familyState.sourceState = sourceState
    syncCollectionMetadataFromMountedSourceState(&familyState.desiredCollection, sourceState: sourceState)
    syncCollectionMetadataFromMountedSourceState(&familyState.collection, sourceState: sourceState)
    state.derivedFamilyStates[sourceId] = familyState
  }

  private static func markLogicalFamilyCollectionResident(
    _ familyState: inout DerivedFamilyState
  ) {
    let sourceState = sourceStateFromCollection(familyState.collection)
    familyState.sourceState = sourceState
    syncCollectionMetadataFromMountedSourceState(&familyState.desiredCollection, sourceState: sourceState)
    syncCollectionMetadataFromMountedSourceState(&familyState.collection, sourceState: sourceState)
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
      let record = try Self.parseTransportFeatureRecord(rawRecord)
      let id = record.id
      guard seenFeatureIds.insert(id).inserted else {
        throw NSError(
          domain: "SearchMapRenderController",
          code: 5,
          userInfo: [NSLocalizedDescriptionKey: "Duplicate feature id \(id) in transport features"]
        )
      }
      idsInOrder.append(id)
      featureById[id] = record.feature
      diffKeyById[id] = record.diffKey
      markerKeyByFeatureId[id] = record.markerKey
      if !record.featureState.isEmpty {
        featureStateById[id] = record.featureState
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

  private static func parseTransportFeatureRecord(
    _ rawRecord: [String: Any]
  ) throws -> ParsedTransportFeatureRecord {
    guard let id = rawRecord["id"] as? String, !id.isEmpty else {
      throw NSError(
        domain: "SearchMapRenderController",
        code: 5,
        userInfo: [NSLocalizedDescriptionKey: "Transport feature missing id"]
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
    let diffKey = (rawRecord["diffKey"] as? String)?.isEmpty == false
      ? (rawRecord["diffKey"] as? String ?? id)
      : id
    let markerKey = (rawRecord["markerKey"] as? String)?.isEmpty == false
      ? (rawRecord["markerKey"] as? String ?? id)
      : id
    let featureState = rawRecord["featureState"] as? [String: Any] ?? [:]
    return ParsedTransportFeatureRecord(
      id: id,
      feature: feature,
      diffKey: diffKey,
      featureState: featureState,
      markerKey: markerKey
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
    let featureStateChangedIds = changedFeatureStateIds(
      previousFeatureStateEntryRevisionById: effectiveBase.featureStateEntryRevisionById,
      nextFeatureStateEntryRevisionById: nextFeatureStateEntryRevisionById
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

  private static func retainedLabelFeatureState(
    for feature: Feature,
    markerKey: String
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

  private static func changedFeatureStateIds(
    previousFeatureStateEntryRevisionById: [String: String],
    nextFeatureStateEntryRevisionById: [String: String]
  ) -> Set<String> {
    if previousFeatureStateEntryRevisionById == nextFeatureStateEntryRevisionById {
      return []
    }
    return Set(previousFeatureStateEntryRevisionById.keys)
      .union(nextFeatureStateEntryRevisionById.keys)
      .filter { featureId in
        previousFeatureStateEntryRevisionById[featureId] != nextFeatureStateEntryRevisionById[featureId]
      }
  }

  private static func clearKnownFeatureStates(
    sourceIds: [String],
    state: InstanceState,
    mapboxMap: MapboxMap
  ) {
    for sourceId in sourceIds {
      let familyState = derivedFamilyState(sourceId: sourceId, state: state)
      let featureIds = familyState.sourceState.featureIds
        .union(familyState.collection.featureIds)
        .union(familyState.desiredCollection.featureIds)
        .union(familyState.transientFeatureStateById.keys)
        .union(familyState.sourceState.featureStateById.keys)
      for featureId in featureIds {
        mapboxMap.removeFeatureState(
          sourceId: sourceId,
          featureId: featureId,
          stateKey: nil
        ) { _ in }
      }
    }
  }

  // LOD render-opacity keys owned EXCLUSIVELY by the live crossfade steppers (the
  // CADisplayLink writers in applyLivePinTransitionFeatureStates). The publish path
  // must neither SET nor REMOVE these in Mapbox: measured on the zoom-flash flow,
  // publish batches issued 930 removals (render falls back to the permanently-stale
  // baked role — diffKey excludes these properties, so Mapbox's stored value is the
  // marker's FIRST-publish role forever) and 928 instant jumps (stale mid-fade
  // snapshots like 0 → 0.773 landing after the fade settled) — the user-visible
  // "fade out → flash in at full → flash out". The in-memory featureStateById
  // bookkeeping is untouched; only the Mapbox writes are stepper-exclusive.
  private static let stepperOwnedRenderFeatureStateKeys: Set<String> = [
    "nativeLodOpacity",
    "nativeLodRankOpacity",
    "nativeLabelOpacity",
    "nativeDotOpacity",
  ]

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
      let previousState = (previousFeatureStateById[featureId] ?? [:])
        .filter { !Self.stepperOwnedRenderFeatureStateKeys.contains($0.key) }
      let nextState = (featureStateById[featureId] ?? [:])
        .filter { !Self.stepperOwnedRenderFeatureStateKeys.contains($0.key) }
      for removedKey in previousState.keys where nextState[removedKey] == nil {
        mapboxMap.removeFeatureState(
          sourceId: sourceId,
          featureId: featureId,
          stateKey: removedKey
        ) { _ in }
      }
      guard !nextState.isEmpty else {
        continue
      }
      if Self.featureStatesEqual(previousState, nextState) {
        continue
      }
      mapboxMap.setFeatureState(sourceId: sourceId, featureId: featureId, state: nextState) { _ in }
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

  private static func shortTypeName(_ object: AnyObject) -> String {
    let fullName = NSStringFromClass(type(of: object))
    return fullName.components(separatedBy: ".").last ?? fullName
  }

  private static func intFlag(_ value: Bool) -> Int {
    value ? 1 : 0
  }

  private static func rectSummary(_ rect: CGRect) -> String {
    "\(Int(rect.origin.x.rounded())),\(Int(rect.origin.y.rounded())),\(Int(rect.width.rounded()))x\(Int(rect.height.rounded()))"
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

  private static func parseVisualFrameTransaction(from payload: NSDictionary) throws -> VisualFrameTransaction {
    guard let rawTransaction = payload["visualFrameTransaction"] as? [String: Any] else {
      throw NSError(
        domain: "SearchMapRenderController",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "invalid render frame payload: missing visualFrameTransaction"]
      )
    }
    guard let kind = rawTransaction["kind"] as? String,
          let presentationPhase = rawTransaction["presentationPhase"] as? String,
          let sourceFrameKey = rawTransaction["sourceFrameKey"] as? String,
          let sourceDataKey = rawTransaction["sourceDataKey"] as? String,
          let sourceSnapshotKind = rawTransaction["sourceSnapshotKind"] as? String
    else {
      throw NSError(
        domain: "SearchMapRenderController",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "invalid render frame payload: incomplete visualFrameTransaction"]
      )
    }
    guard [
      "bootstrap",
      "hidden_preload",
      "enter",
      "live_update",
      "dismiss",
      "clear_hidden",
    ].contains(kind),
      [
        "idle",
        "covered",
        "enter_requested",
        "entering",
        "live",
        "exit_preroll",
        "exiting",
      ].contains(presentationPhase),
      ["pending", "ready", "empty"].contains(sourceSnapshotKind)
    else {
      throw NSError(
        domain: "SearchMapRenderController",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "invalid render frame payload: unsupported visualFrameTransaction"]
      )
    }
    return VisualFrameTransaction(
      kind: kind,
      presentationPhase: presentationPhase,
      requestKey: rawTransaction["requestKey"] as? String,
      visualCycleKey: rawTransaction["visualCycleKey"] as? String,
      readinessKey: rawTransaction["readinessKey"] as? String,
      shortcutCoverageRequestKey: rawTransaction["shortcutCoverageRequestKey"] as? String,
      markersRenderKey: rawTransaction["markersRenderKey"] as? String,
      sourceFrameKey: sourceFrameKey,
      sourceDataKey: sourceDataKey,
      sourceSnapshotKind: sourceSnapshotKind
    )
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

  private static func roundTo3(_ value: Double) -> Double {
    (value * 1000).rounded() / 1000
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
