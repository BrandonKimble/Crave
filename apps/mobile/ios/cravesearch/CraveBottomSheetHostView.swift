import Foundation
import React
import UIKit

final class BottomSheetHostRegistry {
  static let shared = BottomSheetHostRegistry()

  private struct PendingCommand {
    let snapTo: String
    let token: Int
  }

  private final class WeakHost {
    weak var value: CraveBottomSheetHostView?

    init(value: CraveBottomSheetHostView) {
      self.value = value
    }
  }

  private var hostsByKey: [String: WeakHost] = [:]
  private var pendingCommandsByKey: [String: PendingCommand] = [:]
  private let lock = NSLock()

  func register(host: CraveBottomSheetHostView, hostKey: String) {
    lock.lock()
    hostsByKey[hostKey] = WeakHost(value: host)
    let pendingCommand = pendingCommandsByKey[hostKey]
    lock.unlock()
    if let pendingCommand {
      DispatchQueue.main.async {
        host.dispatchProgrammaticCommand(snapTo: pendingCommand.snapTo, token: pendingCommand.token)
      }
    }
  }

  func unregister(host: CraveBottomSheetHostView, hostKey: String?) {
    guard let hostKey else {
      return
    }
    lock.lock()
    defer { lock.unlock() }
    guard let registeredHost = hostsByKey[hostKey]?.value, registeredHost === host else {
      return
    }
    hostsByKey.removeValue(forKey: hostKey)
  }

  func dispatchCommand(hostKey: String, snapTo: String, token: Int) {
    lock.lock()
    let host = hostsByKey[hostKey]?.value
    pendingCommandsByKey[hostKey] = PendingCommand(snapTo: snapTo, token: token)
    lock.unlock()
    DispatchQueue.main.async {
      host?.dispatchProgrammaticCommand(snapTo: snapTo, token: token)
    }
  }
}

@objc(BottomSheetHostRegistryBridge)
final class BottomSheetHostRegistryBridge: NSObject {
  private static let sharedInstance = BottomSheetHostRegistryBridge()

  @objc(sharedBridge)
  static func sharedBridge() -> BottomSheetHostRegistryBridge {
    sharedInstance
  }

  @objc(dispatchCommand:)
  func dispatchCommand(_ payload: NSDictionary) {
    guard
      let hostKey = payload["hostKey"] as? String,
      let snapTo = payload["snapTo"] as? String,
      let token = payload["token"] as? Int
    else {
      return
    }

    BottomSheetHostRegistry.shared.dispatchCommand(
      hostKey: hostKey,
      snapTo: snapTo,
      token: token
    )
  }
}

@objc(CraveBottomSheetHostViewManager)
final class CraveBottomSheetHostViewManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func view() -> UIView! {
    CraveBottomSheetHostView()
  }
}

final class CraveBottomSheetHostView: UIView, UIGestureRecognizerDelegate {
  private struct SnapCandidate {
    let key: String
    let value: CGFloat
  }

  private let stepSnapSmallDragPx: CGFloat = 20
  private let stepSnapDirectionEpsilonPx: CGFloat = 4
  private let stepSnapReversalCancelVelocityPxPerS: CGFloat = 220
  private let stepSnapReversalCancelDragPx: CGFloat = 140
  private let snapGateFallbackPx: CGFloat = 96
  private let snapVelocityProjectionSeconds: CGFloat = 0.18

  @objc var visible: Bool = false {
    didSet {
      handleVisibilityChange(previousValue: oldValue)
    }
  }

  @objc var snapPoints: NSDictionary? {
    didSet {
      applySnapPoints(previousValue: oldValue)
    }
  }

  @objc var initialSnapPoint: NSString = "middle"
  @objc var preservePositionOnSnapPointsChange: Bool = false
  @objc var preventSwipeDismiss: Bool = false
  @objc var interactionEnabled: Bool = true {
    didSet {
      panGesture.isEnabled = interactionEnabled
    }
  }
  @objc var animateOnMount: Bool = false
  @objc var dismissThreshold: NSNumber?
  @objc var snapStepThreshold: NSNumber?

  @objc var sheetCommand: NSDictionary? {
    didSet {
      applySheetCommand()
    }
  }

  @objc var hostKey: NSString? {
    didSet {
      let previousKey = oldValue as String?
      if previousKey == hostKey as String? {
        return
      }
      BottomSheetHostRegistry.shared.unregister(host: self, hostKey: previousKey)
      if let nextKey = hostKey as String? {
        BottomSheetHostRegistry.shared.register(host: self, hostKey: nextKey)
      }
    }
  }

  @objc var onSheetHostEvent: RCTDirectEventBlock?

  private lazy var panGesture = UIPanGestureRecognizer(
    target: self,
    action: #selector(handlePan(_:))
  )
  private var currentSnapPoints: [String: CGFloat] = [
    "expanded": 0,
    "middle": 0,
    "collapsed": 0,
    "hidden": 0,
  ]
  private var currentSnapPoint = "hidden"
  private var lastCommandToken: Int = -1
  private var dragStartY: CGFloat = 0
  private var currentSheetY: CGFloat = 0

  override init(frame: CGRect) {
    super.init(frame: frame)
    configureBottomSheetHostView()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    configureBottomSheetHostView()
  }

  deinit {
    BottomSheetHostRegistry.shared.unregister(host: self, hostKey: hostKey as String?)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    syncSheetPresentationViewLayout()
    let nextSnapY = resolveSnapValue(currentSnapPoint) ?? bounds.height
    if !visible && currentSnapPoint == "hidden" {
      applySheetY(nextSnapY, emitEvent: false)
    }
  }

  override func didAddSubview(_ subview: UIView) {
    super.didAddSubview(subview)
    syncSheetPresentationViewLayout()
  }

  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
  ) -> Bool {
    true
  }

  override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    guard
      gestureRecognizer === panGesture,
      let recognizer = gestureRecognizer as? UIPanGestureRecognizer
    else {
      return true
    }

    let velocity = recognizer.velocity(in: self)
    guard abs(velocity.y) > abs(velocity.x) * 1.15 else {
      return false
    }

    let expanded = resolveSnapValue("expanded") ?? 0
    let isExpanded = sheetY <= expanded + 2
    guard isExpanded else {
      return true
    }

    let scrollView = (reactManagedSheetPresentationView() ?? subviews.last).flatMap(
      findScrollableDescendant(in:)
    )
    let canScrollUp = scrollView.map(isScrollViewAboveTop) ?? false

    if velocity.y < 0, canScrollUp {
      return false
    }

    if velocity.y > 0, canScrollUp {
      return false
    }

    return true
  }

  private func configureBottomSheetHostView() {
    backgroundColor = .clear
    panGesture.delegate = self
    panGesture.isEnabled = interactionEnabled
    addGestureRecognizer(panGesture)
  }

  override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
    let interactiveFrame = currentSheetInteractiveFrame()
    return visible && interactiveFrame.contains(point)
  }

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let interactiveFrame = currentSheetInteractiveFrame()
    guard visible, interactiveFrame.contains(point) else {
      return nil
    }
    let hitView = super.hitTest(point, with: event)
    return hitView === self ? nil : hitView
  }

  private func applySnapPoints(previousValue: NSDictionary?) {
    currentSnapPoints["expanded"] = readSnapValue(
      "expanded",
      fallback: currentSnapPoints["expanded"] ?? 0
    )
    currentSnapPoints["middle"] = readSnapValue(
      "middle",
      fallback: currentSnapPoints["middle"] ?? 0
    )
    currentSnapPoints["collapsed"] = readSnapValue(
      "collapsed",
      fallback: currentSnapPoints["collapsed"] ?? 0
    )
    currentSnapPoints["hidden"] = readSnapValue(
      "hidden",
      fallback: currentSnapPoints["hidden"] ?? max(bounds.height, UIScreen.main.bounds.height)
    )

    if preservePositionOnSnapPointsChange, previousValue != nil {
      return
    }
    let targetSnap = visible ? currentSnapPointForVisibleSheet() : "hidden"
    currentSnapPoint = targetSnap
    applySheetY(resolveSnapValue(targetSnap) ?? 0, emitEvent: true)
  }

  private func handleVisibilityChange(previousValue: Bool) {
    let targetSnap = visible ? currentSnapPointForVisibleSheet() : "hidden"
    currentSnapPoint = targetSnap
    guard previousValue != visible || animateOnMount else {
      applySheetY(resolveSnapValue(targetSnap) ?? 0, emitEvent: true)
      return
    }
    notifySnapStart(targetSnap, source: "programmatic")
    setSettling(true)
    animateSheet(to: resolveSnapValue(targetSnap) ?? 0, source: "programmatic", snapPoint: targetSnap)
  }

  private func currentSnapPointForVisibleSheet() -> String {
    currentSnapPoint == "hidden" ? initialSnapPoint as String : currentSnapPoint
  }

  private func applySheetCommand() {
    guard
      let command = sheetCommand as? [String: Any],
      let token = command["token"] as? Int,
      let snapTo = command["snapTo"] as? String
    else {
      return
    }
    dispatchProgrammaticCommand(snapTo: snapTo, token: token)
  }

  func dispatchProgrammaticCommand(snapTo: String, token: Int) {
    guard
      token != lastCommandToken,
      let targetY = resolveSnapValue(snapTo)
    else {
      return
    }
    lastCommandToken = token
    currentSnapPoint = snapTo
    notifySnapStart(snapTo, source: "programmatic")
    setSettling(true)
    animateSheet(to: targetY, source: "programmatic", snapPoint: snapTo)
  }

  @objc private func handlePan(_ recognizer: UIPanGestureRecognizer) {
    guard interactionEnabled else {
      return
    }

    switch recognizer.state {
    case .began:
      reactManagedSheetPresentationView()?.layer.removeAllAnimations()
      dragStartY = sheetY
      setDragging(true)
      setSettling(false)
    case .changed:
      let translationY = recognizer.translation(in: self).y
      let nextY = clampSheetY(dragStartY + translationY)
      applySheetY(nextY, emitEvent: true)
    case .ended, .cancelled, .failed:
      setDragging(false)
      let velocityY = recognizer.velocity(in: self).y
      let nextSnap = resolveSnapPoint(
        for: sheetY,
        velocityY: velocityY,
        gestureStartY: dragStartY
      )
      currentSnapPoint = nextSnap
      notifySnapStart(nextSnap, source: "gesture")
      setSettling(true)
      animateSheet(
        to: resolveSnapValue(nextSnap) ?? sheetY,
        source: "gesture",
        snapPoint: nextSnap
      )
    default:
      break
    }
  }

  private func readSnapValue(_ key: String, fallback: CGFloat) -> CGFloat {
    guard
      let snapPoints,
      let value = snapPoints[key] as? NSNumber
    else {
      return fallback
    }
    return CGFloat(truncating: value)
  }

  private var sheetY: CGFloat {
    currentSheetY
  }

  private func reactManagedSheetPresentationView() -> UIView? {
    let selector = NSSelectorFromString("reactSubviews")
    guard
      responds(to: selector),
      let unmanagedValue = perform(selector)
    else {
      return nil
    }

    if let reactSubviews = unmanagedValue.takeUnretainedValue() as? [UIView] {
      return reactSubviews.last
    }

    return nil
  }

  private func resolvedSheetPresentationView() -> UIView? {
    reactManagedSheetPresentationView() ?? subviews.last
  }

  private func syncSheetPresentationViewLayout() {
    guard let sheetPresentationView = resolvedSheetPresentationView() else {
      return
    }
    if sheetPresentationView.frame != bounds {
      sheetPresentationView.frame = bounds
    }
    if transform != .identity {
      transform = .identity
    }
    let nextTransform = CGAffineTransform(translationX: 0, y: sheetY)
    if sheetPresentationView.transform != nextTransform {
      sheetPresentationView.transform = nextTransform
    }
  }

  private func currentSheetInteractiveFrame() -> CGRect {
    CGRect(
      x: 0,
      y: sheetY,
      width: bounds.width,
      height: max(bounds.height - sheetY, 0)
    )
  }

  private func resolveSnapValue(_ snapPoint: String) -> CGFloat? {
    currentSnapPoints[snapPoint]
  }

  private func clampSheetY(_ value: CGFloat) -> CGFloat {
    let expanded = resolveSnapValue("expanded") ?? 0
    let lower = preventSwipeDismiss
      ? (resolveSnapValue("collapsed") ?? expanded)
      : (resolveSnapValue("hidden") ?? resolveSnapValue("collapsed") ?? expanded)
    return min(max(value, expanded), lower)
  }

  private func resolveSnapPoint(
    for value: CGFloat,
    velocityY: CGFloat,
    gestureStartY: CGFloat
  ) -> String {
    let expanded = resolveSnapValue("expanded") ?? 0
    let middle = resolveSnapValue("middle") ?? expanded
    let collapsed = resolveSnapValue("collapsed") ?? middle
    let hidden = resolveSnapValue("hidden") ?? collapsed

    let candidates = buildVisibleSnapCandidates(
      expanded: expanded,
      middle: middle,
      collapsed: collapsed,
      hidden: preventSwipeDismiss ? nil : hidden
    )
    let targetValue = resolveHeaderGatedSnapValue(
      value: clampSheetY(value),
      velocityY: velocityY,
      gestureStartY: clampSheetY(gestureStartY),
      candidates: candidates
    )
    return candidates[findNearestPointIndex(targetValue, candidates: candidates)].key
  }

  private func buildVisibleSnapCandidates(
    expanded: CGFloat,
    middle: CGFloat,
    collapsed: CGFloat,
    hidden: CGFloat?
  ) -> [SnapCandidate] {
    var candidates: [SnapCandidate] = []
    appendVisibleSnapCandidate(&candidates, key: "expanded", value: expanded)
    appendVisibleSnapCandidate(&candidates, key: "middle", value: middle)
    appendVisibleSnapCandidate(&candidates, key: "collapsed", value: collapsed)
    if let hidden {
      appendVisibleSnapCandidate(&candidates, key: "hidden", value: hidden)
    }
    return candidates
  }

  private func appendVisibleSnapCandidate(
    _ candidates: inout [SnapCandidate],
    key: String,
    value: CGFloat
  ) {
    guard let previous = candidates.last else {
      candidates.append(SnapCandidate(key: key, value: value))
      return
    }
    if abs(previous.value - value) < 0.5 {
      return
    }
    candidates.append(SnapCandidate(key: key, value: value))
  }

  private func findNearestPointIndex(_ value: CGFloat, candidates: [SnapCandidate]) -> Int {
    var closestIndex = 0
    var minDistance = abs(value - candidates[0].value)
    for index in 1..<candidates.count {
      let distance = abs(value - candidates[index].value)
      if distance < minDistance {
        minDistance = distance
        closestIndex = index
      }
    }
    return closestIndex
  }

  private func resolveHeaderGatedSnapValue(
    value: CGFloat,
    velocityY: CGFloat,
    gestureStartY: CGFloat,
    candidates: [SnapCandidate]
  ) -> CGFloat {
    guard !candidates.isEmpty else {
      return value
    }

    let lastIndex = candidates.count - 1
    let startIndex = findNearestPointIndex(gestureStartY, candidates: candidates)
    let startValue = candidates[startIndex].value
    let resolvedGateDistance = max(
      1,
      snapStepThreshold.map { CGFloat(truncating: $0) } ?? snapGateFallbackPx
    )
    let projectedValue = min(
      max(value + velocityY * snapVelocityProjectionSeconds, candidates[0].value),
      candidates[lastIndex].value
    )
    let dragDelta = value - startValue
    let projectedDelta = projectedValue - startValue
    let absDragDelta = abs(dragDelta)
    let absProjectedDelta = abs(projectedDelta)
    let absVelocity = abs(velocityY)

    if absDragDelta <= stepSnapSmallDragPx && absProjectedDelta < resolvedGateDistance {
      return startValue
    }

    let dragDirection =
      absDragDelta >= stepSnapDirectionEpsilonPx ? (dragDelta > 0 ? 1 : -1) : 0
    let projectedDirection =
      absProjectedDelta >= stepSnapDirectionEpsilonPx ? (projectedDelta > 0 ? 1 : -1) : 0

    if
      dragDirection != 0 &&
      projectedDirection != 0 &&
      dragDirection != projectedDirection &&
      absVelocity >= stepSnapReversalCancelVelocityPxPerS &&
      absDragDelta <= stepSnapReversalCancelDragPx
    {
      return startValue
    }

    let direction = projectedDirection != 0 ? projectedDirection : dragDirection
    if direction == 0 {
      return startValue
    }

    var targetIndex = startIndex
    if direction > 0 {
      var index = startIndex + 1
      while index <= lastIndex {
        let gate = candidates[index - 1].value + resolvedGateDistance
        if projectedValue < gate {
          break
        }
        targetIndex = index
        index += 1
      }
    } else {
      var index = startIndex - 1
      while index >= 0 {
        let gate = candidates[index + 1].value - resolvedGateDistance
        if projectedValue > gate {
          break
        }
        targetIndex = index
        index -= 1
      }
    }

    return candidates[targetIndex].value
  }

  private func animateSheet(to targetY: CGFloat, source: String, snapPoint: String) {
    let animations = { [weak self] in
      guard let self else {
        return
      }
      self.resolvedSheetPresentationView()?.transform = CGAffineTransform(
        translationX: 0,
        y: targetY
      )
    }
    UIView.animate(
      withDuration: 0.34,
      delay: 0,
      usingSpringWithDamping: 0.88,
      initialSpringVelocity: 0,
      options: [.allowUserInteraction, .beginFromCurrentState],
      animations: animations,
      completion: { [weak self] finished in
        guard let self else {
          return
        }
        applySheetY(targetY, emitEvent: true)
        setSettling(false)
        if finished {
          notifySnapChange(snapPoint, source: source)
        }
      }
    )
  }

  private func applySheetY(_ value: CGFloat, emitEvent: Bool) {
    currentSheetY = value
    if transform != .identity {
      transform = .identity
    }
    let nextTransform = CGAffineTransform(translationX: 0, y: value)
    if let sheetPresentationView = resolvedSheetPresentationView(),
      sheetPresentationView.transform != nextTransform
    {
      sheetPresentationView.transform = nextTransform
    }
    guard emitEvent else {
      return
    }
    emitSheetEvent([
      "eventType": "sheet_y",
      "sheetY": Double(value),
    ])
  }

  private func notifySnapStart(_ snapPoint: String, source: String) {
    emitSheetEvent([
      "eventType": "snap_start",
      "snap": snapPoint,
      "source": source,
    ])
  }

  private func notifySnapChange(_ snapPoint: String, source: String) {
    emitSheetEvent([
      "eventType": "snap_change",
      "snap": snapPoint,
      "source": source,
    ])
  }

  private func setDragging(_ value: Bool) {
    emitSheetEvent([
      "eventType": "drag_state",
      "isActive": value,
    ])
  }

  private func setSettling(_ value: Bool) {
    emitSheetEvent([
      "eventType": "settle_state",
      "isActive": value,
    ])
  }

  private func emitSheetEvent(_ event: [String: Any]) {
    onSheetHostEvent?(event)
  }

  private func findScrollableDescendant(in view: UIView) -> UIScrollView? {
    for subview in view.subviews {
      if let scrollView = subview as? UIScrollView {
        return scrollView
      }
      if let nested = findScrollableDescendant(in: subview) {
        return nested
      }
    }
    return nil
  }

  private func isScrollViewAboveTop(_ scrollView: UIScrollView) -> Bool {
    scrollView.contentOffset.y > -scrollView.adjustedContentInset.top + 2
  }
}
