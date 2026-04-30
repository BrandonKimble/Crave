import Foundation
import React
import UIKit

struct SearchChromeNativeHitTargetRegion {
  let targetId: String
  let frame: CGRect
  let enabled: Bool
}

final class SearchChromeNativeHitTargetSurfaceRegistry {
  static let shared = SearchChromeNativeHitTargetSurfaceRegistry()

  private final class WeakSurface {
    weak var value: SearchChromeNativeHitTargetSurface?

    init(value: SearchChromeNativeHitTargetSurface) {
      self.value = value
    }
  }

  private var surfacesByKey: [String: WeakSurface] = [:]
  private var pendingRegionsByKey: [String: [SearchChromeNativeHitTargetRegion]] = [:]
  private let lock = NSLock()

  func register(surface: SearchChromeNativeHitTargetSurface, hostKey: String) {
    lock.lock()
    surfacesByKey[hostKey] = WeakSurface(value: surface)
    let pendingRegions = pendingRegionsByKey[hostKey]
    lock.unlock()

    if let pendingRegions {
      DispatchQueue.main.async {
        surface.applyRegions(pendingRegions)
      }
    }
  }

  func unregister(surface: SearchChromeNativeHitTargetSurface, hostKey: String?) {
    guard let hostKey else {
      return
    }
    lock.lock()
    defer { lock.unlock() }
    guard let registeredSurface = surfacesByKey[hostKey]?.value, registeredSurface === surface else {
      return
    }
    surfacesByKey.removeValue(forKey: hostKey)
  }

  func syncRegions(hostKey: String, regions: [SearchChromeNativeHitTargetRegion]) {
    lock.lock()
    let surface = surfacesByKey[hostKey]?.value
    pendingRegionsByKey[hostKey] = regions
    lock.unlock()

    DispatchQueue.main.async {
      surface?.applyRegions(regions)
    }
  }
}

@objc(SearchChromeNativeHitTargetRegistry)
final class SearchChromeNativeHitTargetRegistryBridge: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc
  func constantsToExport() -> [AnyHashable: Any]! {
    [
      "searchChromeNativeHitTargetAvailable": true,
    ]
  }

  @objc(syncRegions:resolver:rejecter:)
  func syncRegions(
    _ payload: NSDictionary,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard let hostKey = payload["hostKey"] as? String else {
      reject("invalid_payload", "Expected hostKey", nil)
      return
    }

    let regions = (payload["regions"] as? [NSDictionary] ?? []).compactMap(parseRegion)
    SearchChromeNativeHitTargetSurfaceRegistry.shared.syncRegions(hostKey: hostKey, regions: regions)
    resolve(nil)
  }
}

@objc(SearchChromeNativeHitTargetSurfaceManager)
final class SearchChromeNativeHitTargetSurfaceManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func view() -> UIView! {
    SearchChromeNativeHitTargetSurface()
  }
}

final class SearchChromeNativeHitTargetSurface: UIView {
  @objc var hostKey: NSString? {
    didSet {
      let previousKey = oldValue as String?
      if previousKey == hostKey as String? {
        return
      }
      SearchChromeNativeHitTargetSurfaceRegistry.shared.unregister(surface: self, hostKey: previousKey)
      if let nextKey = hostKey as String? {
        SearchChromeNativeHitTargetSurfaceRegistry.shared.register(surface: self, hostKey: nextKey)
      }
    }
  }

  @objc var onSearchChromeNativeHitTargetPress: RCTDirectEventBlock?

  private var regions: [SearchChromeNativeHitTargetRegion] = []
  private var activeTargetId: String?

  override init(frame: CGRect) {
    super.init(frame: frame)
    configureSurface()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    configureSurface()
  }

  deinit {
    SearchChromeNativeHitTargetSurfaceRegistry.shared.unregister(surface: self, hostKey: hostKey as String?)
  }

  func applyRegions(_ nextRegions: [SearchChromeNativeHitTargetRegion]) {
    regions = nextRegions
    isUserInteractionEnabled = nextRegions.contains { $0.enabled }
  }

  override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
    targetId(at: point) != nil
  }

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    targetId(at: point) == nil ? nil : self
  }

  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
    activeTargetId = touches.first.map { targetId(at: $0.location(in: self)) } ?? nil
    if activeTargetId == nil {
      super.touchesBegan(touches, with: event)
    }
  }

  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
    guard
      let targetId = activeTargetId,
      let point = touches.first?.location(in: self),
      targetId == self.targetId(at: point)
    else {
      activeTargetId = nil
      super.touchesEnded(touches, with: event)
      return
    }

    activeTargetId = nil
    onSearchChromeNativeHitTargetPress?(["targetId": targetId])
  }

  override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
    activeTargetId = nil
    super.touchesCancelled(touches, with: event)
  }

  private func configureSurface() {
    backgroundColor = .clear
    isUserInteractionEnabled = false
  }

  private func targetId(at point: CGPoint) -> String? {
    regions.first { region in
      region.enabled && region.frame.contains(point)
    }?.targetId
  }
}

private func parseRegion(_ payload: NSDictionary) -> SearchChromeNativeHitTargetRegion? {
  guard
    let targetId = payload["targetId"] as? String,
    let x = payload["x"] as? NSNumber,
    let y = payload["y"] as? NSNumber,
    let width = payload["width"] as? NSNumber,
    let height = payload["height"] as? NSNumber
  else {
    return nil
  }

  return SearchChromeNativeHitTargetRegion(
    targetId: targetId,
    frame: CGRect(
      x: CGFloat(truncating: x),
      y: CGFloat(truncating: y),
      width: max(0, CGFloat(truncating: width)),
      height: max(0, CGFloat(truncating: height))
    ),
    enabled: (payload["enabled"] as? Bool) == true
  )
}
