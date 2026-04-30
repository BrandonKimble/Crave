import Foundation
import React
import UIKit

private struct SearchChromeScalarSurfaceHostRegistration {
  let hostKey: String
  let layoutOwnership: String
}

private struct SearchChromeScalarSurfaceSnapshot {
  let hostKey: String
  let revision: Int
  let regions: [[String: Any]]
}

private struct SearchChromeScalarSurfaceMeasuredControlRegistration {
  let hostKey: String
  let controlId: String
  let nativeTag: NSNumber
}

private struct SearchChromeScalarSurfaceMeasuredFrame {
  let controlId: String
  let x: CGFloat
  let y: CGFloat
  let width: CGFloat
  let height: CGFloat

  var dictionary: [String: Any] {
    [
      "controlId": controlId,
      "x": x,
      "y": y,
      "width": width,
      "height": height,
    ]
  }
}

private struct SearchChromeScalarSurfacePlatformOwnerRegistration {
  let hostKey: String
  let measurementOwnership: String
  let scalarOwnership: String
  let actionResolution: String
}

private struct SearchChromeScalarSurfacePlatformScalarSlotRegistration {
  let hostKey: String
  let controlId: String
  let visibleSource: String
  let enabledSource: String
  let passThroughSource: String
}

private final class SearchChromeScalarSurfaceMeasuredControlObserver: NSObject {
  private let hostKey: String
  private let controlId: String
  private weak var view: UIView?
  private var boundsObservation: NSKeyValueObservation?
  private var centerObservation: NSKeyValueObservation?
  private var transformObservation: NSKeyValueObservation?

  init(hostKey: String, controlId: String, view: UIView) {
    self.hostKey = hostKey
    self.controlId = controlId
    self.view = view
    super.init()

    boundsObservation = view.observe(\.bounds, options: [.new]) { [weak self] view, _ in
      self?.cacheFrame(from: view)
    }
    centerObservation = view.observe(\.center, options: [.new]) { [weak self] view, _ in
      self?.cacheFrame(from: view)
    }
    transformObservation = view.observe(\.transform, options: [.new]) { [weak self] view, _ in
      self?.cacheFrame(from: view)
    }
  }

  func invalidate() {
    boundsObservation?.invalidate()
    centerObservation?.invalidate()
    transformObservation?.invalidate()
    boundsObservation = nil
    centerObservation = nil
    transformObservation = nil
    view = nil
  }

  func cacheCurrentFrame() {
    guard let view else {
      return
    }
    cacheFrame(from: view)
  }

  private func cacheFrame(from view: UIView) {
    guard view.bounds.width > 0, view.bounds.height > 0 else {
      return
    }
    let frame = view.convert(view.bounds, to: nil)
    SearchChromeScalarSurfaceRegistry.shared.cacheMeasuredFrame(
      hostKey: hostKey,
      controlId: controlId,
      frame: SearchChromeScalarSurfaceMeasuredFrame(
        controlId: controlId,
        x: frame.origin.x,
        y: frame.origin.y,
        width: frame.size.width,
        height: frame.size.height
      )
    )
  }
}

private final class SearchChromeScalarSurfaceRegistry {
  static let shared = SearchChromeScalarSurfaceRegistry()

  private let lock = NSLock()
  private var hostsByKey: [String: SearchChromeScalarSurfaceHostRegistration] = [:]
  private var snapshotsByKey: [String: SearchChromeScalarSurfaceSnapshot] = [:]
  private var platformOwnersByKey: [String: SearchChromeScalarSurfacePlatformOwnerRegistration] = [:]
  private var platformScalarSlotsByHostKey: [String: [String: SearchChromeScalarSurfacePlatformScalarSlotRegistration]] = [:]
  private var measuredControlsByHostKey: [String: [String: SearchChromeScalarSurfaceMeasuredControlRegistration]] = [:]
  private var measuredFramesByHostKey: [String: [String: SearchChromeScalarSurfaceMeasuredFrame]] = [:]
  private var measuredControlObserversByHostKey: [String: [String: SearchChromeScalarSurfaceMeasuredControlObserver]] = [:]

  func registerHost(_ registration: SearchChromeScalarSurfaceHostRegistration) {
    lock.lock()
    hostsByKey[registration.hostKey] = registration
    lock.unlock()
  }

  func syncSnapshot(_ snapshot: SearchChromeScalarSurfaceSnapshot) {
    lock.lock()
    snapshotsByKey[snapshot.hostKey] = snapshot
    lock.unlock()
  }

  func registerPlatformOwner(_ registration: SearchChromeScalarSurfacePlatformOwnerRegistration) {
    lock.lock()
    platformOwnersByKey[registration.hostKey] = registration
    lock.unlock()
  }

  func platformOwnerStatus(hostKey: String) -> [String: Any] {
    lock.lock()
    let owner = platformOwnersByKey[hostKey]
    lock.unlock()

    return [
      "hostKey": hostKey,
      "available": true,
      "active": false,
      "measurementOwnership": owner?.measurementOwnership ?? "nativeMeasurementRegistry",
      "scalarOwnership": owner?.scalarOwnership ?? "platformReadableTargets",
      "actionResolution": owner?.actionResolution ?? "jsPressTimeResolver",
      "ownsMeasuredFrames": true,
      "ownsScalarValues": false,
      "composesNativeRegions": false,
      "resolvesActionsAtPressTime": false,
      "missingHooks": [
        "platformReadableScalarTargets",
        "nativeRegionCompositionLoop",
        "pressTimeActionResolver",
      ],
    ]
  }

  func registerPlatformScalarSlot(_ registration: SearchChromeScalarSurfacePlatformScalarSlotRegistration) {
    lock.lock()
    var scalarSlots = platformScalarSlotsByHostKey[registration.hostKey] ?? [:]
    scalarSlots[registration.controlId] = registration
    platformScalarSlotsByHostKey[registration.hostKey] = scalarSlots
    lock.unlock()
  }

  func platformScalarSlotStatus(hostKey: String) -> [String: Any] {
    lock.lock()
    let registeredControlIds = platformScalarSlotsByHostKey[hostKey]?.keys.map { $0 } ?? []
    lock.unlock()

    return [
      "hostKey": hostKey,
      "available": true,
      "active": false,
      "scalarSlotContractAvailable": true,
      "registeredControlIds": registeredControlIds,
      "ownsScalarValues": false,
      "missingScalarOwner": "platformReadableScalarSource",
    ]
  }

  func registerMeasuredControl(_ registration: SearchChromeScalarSurfaceMeasuredControlRegistration) {
    lock.lock()
    var controls = measuredControlsByHostKey[registration.hostKey] ?? [:]
    controls[registration.controlId] = registration
    measuredControlsByHostKey[registration.hostKey] = controls
    lock.unlock()
  }

  func registerNativeLayoutObserver(
    hostKey: String,
    controlId: String,
    view: UIView
  ) {
    let observer = SearchChromeScalarSurfaceMeasuredControlObserver(
      hostKey: hostKey,
      controlId: controlId,
      view: view
    )
    lock.lock()
    var observers = measuredControlObserversByHostKey[hostKey] ?? [:]
    observers[controlId]?.invalidate()
    observers[controlId] = observer
    measuredControlObserversByHostKey[hostKey] = observers
    lock.unlock()
    observer.cacheCurrentFrame()
  }

  func cacheMeasuredFrame(
    hostKey: String,
    controlId: String,
    frame: SearchChromeScalarSurfaceMeasuredFrame
  ) {
    lock.lock()
    var frames = measuredFramesByHostKey[hostKey] ?? [:]
    frames[controlId] = frame
    measuredFramesByHostKey[hostKey] = frames
    lock.unlock()
  }

  func measuredControls(hostKey: String) -> [SearchChromeScalarSurfaceMeasuredControlRegistration] {
    lock.lock()
    let controls = measuredControlsByHostKey[hostKey]?.values.map { $0 } ?? []
    lock.unlock()
    return controls
  }

  func measuredFrames(hostKey: String) -> [[String: Any]] {
    lock.lock()
    let frames = measuredFramesByHostKey[hostKey]?.values.map { $0.dictionary } ?? []
    lock.unlock()
    return frames
  }

  func clearMeasuredControl(hostKey: String, controlId: String) {
    lock.lock()
    measuredControlsByHostKey[hostKey]?[controlId] = nil
    measuredFramesByHostKey[hostKey]?[controlId] = nil
    measuredControlObserversByHostKey[hostKey]?[controlId]?.invalidate()
    measuredControlObserversByHostKey[hostKey]?[controlId] = nil
    lock.unlock()
  }

  func clearHost(_ hostKey: String) {
    lock.lock()
    hostsByKey.removeValue(forKey: hostKey)
    snapshotsByKey.removeValue(forKey: hostKey)
    platformOwnersByKey.removeValue(forKey: hostKey)
    platformScalarSlotsByHostKey.removeValue(forKey: hostKey)
    measuredControlsByHostKey.removeValue(forKey: hostKey)
    measuredFramesByHostKey.removeValue(forKey: hostKey)
    let observers = measuredControlObserversByHostKey.removeValue(forKey: hostKey)
    lock.unlock()
    observers?.values.forEach { observer in
      observer.invalidate()
    }
  }
}

@objc(SearchChromeScalarSurfaceRegistry)
final class SearchChromeScalarSurfaceRegistryBridge: NSObject {
  @objc
  var bridge: NSObject?

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc
  func constantsToExport() -> [AnyHashable: Any]! {
    [
      "searchChromeScalarSurfaceAvailable": true,
      "searchChromeScalarSurfaceActive": false,
      "searchChromeScalarSurfacePlatformOwnerAvailable": true,
      "searchChromeScalarSurfacePlatformOwnerActive": false,
    ]
  }

  @objc(registerSurfaceHost:resolver:rejecter:)
  func registerSurfaceHost(
    _ payload: NSDictionary,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard
      let hostKey = payload["hostKey"] as? String,
      let layoutOwnership = payload["layoutOwnership"] as? String
    else {
      reject("invalid_payload", "Expected hostKey and layoutOwnership", nil)
      return
    }

    SearchChromeScalarSurfaceRegistry.shared.registerHost(
      SearchChromeScalarSurfaceHostRegistration(
        hostKey: hostKey,
        layoutOwnership: layoutOwnership
      )
    )
    resolve(nil)
  }

  @objc(registerPlatformOwner:resolver:rejecter:)
  func registerPlatformOwner(
    _ payload: NSDictionary,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard
      let hostKey = payload["hostKey"] as? String,
      let measurementOwnership = payload["measurementOwnership"] as? String,
      let scalarOwnership = payload["scalarOwnership"] as? String,
      let actionResolution = payload["actionResolution"] as? String
    else {
      reject(
        "invalid_payload",
        "Expected hostKey, measurementOwnership, scalarOwnership, and actionResolution",
        nil
      )
      return
    }

    SearchChromeScalarSurfaceRegistry.shared.registerPlatformOwner(
      SearchChromeScalarSurfacePlatformOwnerRegistration(
        hostKey: hostKey,
        measurementOwnership: measurementOwnership,
        scalarOwnership: scalarOwnership,
        actionResolution: actionResolution
      )
    )
    resolve(nil)
  }

  @objc(readPlatformOwnerStatus:resolver:rejecter:)
  func readPlatformOwnerStatus(
    _ hostKey: NSString,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(
      SearchChromeScalarSurfaceRegistry.shared.platformOwnerStatus(
        hostKey: hostKey as String
      )
    )
  }

  @objc(registerPlatformScalarSlot:resolver:rejecter:)
  func registerPlatformScalarSlot(
    _ payload: NSDictionary,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard
      let hostKey = payload["hostKey"] as? String,
      let controlId = payload["controlId"] as? String,
      let visibleSource = payload["visibleSource"] as? String,
      let enabledSource = payload["enabledSource"] as? String,
      let passThroughSource = payload["passThroughSource"] as? String
    else {
      reject(
        "invalid_payload",
        "Expected hostKey, controlId, visibleSource, enabledSource, and passThroughSource",
        nil
      )
      return
    }

    SearchChromeScalarSurfaceRegistry.shared.registerPlatformScalarSlot(
      SearchChromeScalarSurfacePlatformScalarSlotRegistration(
        hostKey: hostKey,
        controlId: controlId,
        visibleSource: visibleSource,
        enabledSource: enabledSource,
        passThroughSource: passThroughSource
      )
    )
    resolve(nil)
  }

  @objc(readPlatformScalarSlotStatus:resolver:rejecter:)
  func readPlatformScalarSlotStatus(
    _ hostKey: NSString,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(
      SearchChromeScalarSurfaceRegistry.shared.platformScalarSlotStatus(
        hostKey: hostKey as String
      )
    )
  }

  @objc(registerMeasuredControl:resolver:rejecter:)
  func registerMeasuredControl(
    _ payload: NSDictionary,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard
      let hostKey = payload["hostKey"] as? String,
      let controlId = payload["controlId"] as? String,
      let nativeTag = payload["nativeTag"] as? NSNumber
    else {
      reject("invalid_payload", "Expected hostKey, controlId, and nativeTag", nil)
      return
    }

    SearchChromeScalarSurfaceRegistry.shared.registerMeasuredControl(
      SearchChromeScalarSurfaceMeasuredControlRegistration(
        hostKey: hostKey,
        controlId: controlId,
        nativeTag: nativeTag
      )
    )
    DispatchQueue.main.async {
      guard let uiManager = self.bridge?.value(forKey: "uiManager") as? NSObject else {
        return
      }
      guard let view = Self.resolveReactView(from: uiManager, nativeTag: nativeTag) else {
        return
      }
      SearchChromeScalarSurfaceRegistry.shared.registerNativeLayoutObserver(
        hostKey: hostKey,
        controlId: controlId,
        view: view
      )
    }
    resolve(nil)
  }

  @objc(measureRegisteredControls:resolver:rejecter:)
  func measureRegisteredControls(
    _ hostKey: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let resolvedHostKey = hostKey as String
    resolve([
      "hostKey": resolvedHostKey,
      "frames": SearchChromeScalarSurfaceRegistry.shared.measuredFrames(
        hostKey: resolvedHostKey
      ),
    ])
  }

  private static func resolveReactView(
    from owner: NSObject,
    nativeTag: NSNumber
  ) -> UIView? {
    let selector = NSSelectorFromString("viewForReactTag:")
    guard owner.responds(to: selector) else {
      return nil
    }
    guard
      let unmanagedView = owner.perform(selector, with: nativeTag),
      let resolvedView = unmanagedView.takeUnretainedValue() as? UIView
    else {
      return nil
    }
    return resolvedView
  }

  @objc(syncScalarSnapshot:resolver:rejecter:)
  func syncScalarSnapshot(
    _ payload: NSDictionary,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard
      let hostKey = payload["hostKey"] as? String,
      let revision = payload["revision"] as? NSNumber
    else {
      reject("invalid_payload", "Expected hostKey and revision", nil)
      return
    }

    SearchChromeScalarSurfaceRegistry.shared.syncSnapshot(
      SearchChromeScalarSurfaceSnapshot(
        hostKey: hostKey,
        revision: revision.intValue,
        regions: payload["regions"] as? [[String: Any]] ?? []
      )
    )
    resolve(nil)
  }

  @objc(clearMeasuredControl:resolver:rejecter:)
  func clearMeasuredControl(
    _ payload: NSDictionary,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard
      let hostKey = payload["hostKey"] as? String,
      let controlId = payload["controlId"] as? String
    else {
      reject("invalid_payload", "Expected hostKey and controlId", nil)
      return
    }

    SearchChromeScalarSurfaceRegistry.shared.clearMeasuredControl(
      hostKey: hostKey,
      controlId: controlId
    )
    resolve(nil)
  }

  @objc(clearSurfaceHost:resolver:rejecter:)
  func clearSurfaceHost(
    _ hostKey: NSString,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    SearchChromeScalarSurfaceRegistry.shared.clearHost(hostKey as String)
    resolve(nil)
  }
}
