import React
import UIKit

private func makeSearchRouteNavSilhouetteMaterialPath(
  materialRect: CGRect,
  localNavBodyBoundaryY: CGFloat,
  cutoutHeight: CGFloat,
  cutoutRadius: CGFloat
) -> CGPath? {
  guard !materialRect.isNull, materialRect.width > 0, materialRect.height > 0 else {
    return nil
  }

  let materialPath = UIBezierPath(rect: materialRect)
  guard let cutoutGeometry = makeSearchRouteNavCutoutGeometry(
    materialRect: materialRect,
    localNavBodyBoundaryY: localNavBodyBoundaryY,
    cutoutHeight: cutoutHeight,
    cutoutRadius: cutoutRadius
  ) else {
    return materialPath.cgPath
  }

  materialPath.append(
    UIBezierPath(
      roundedRect: cutoutGeometry.rect,
      cornerRadius: cutoutGeometry.radius
    )
  )
  return materialPath.cgPath
}

private struct SearchRouteNavCutoutGeometry {
  let rect: CGRect
  let radius: CGFloat
}

private func makeSearchRouteNavCutoutGeometry(
  materialRect: CGRect,
  localNavBodyBoundaryY: CGFloat,
  cutoutHeight: CGFloat,
  cutoutRadius: CGFloat
) -> SearchRouteNavCutoutGeometry? {
  let resolvedCutoutHeight = max(0, cutoutHeight)
  guard materialRect.width > 0, resolvedCutoutHeight > 0 else {
    return nil
  }
  let baseRadius = min(
    max(0, cutoutRadius),
    max(0, materialRect.width / 4),
    max(0, resolvedCutoutHeight / 2)
  )
  guard baseRadius > 0 else {
    return nil
  }

  let navBodyTopY = max(materialRect.minY, min(materialRect.maxY, localNavBodyBoundaryY))
  let cutoutRect = CGRect(
    x: materialRect.minX,
    y: navBodyTopY - resolvedCutoutHeight,
    width: materialRect.width,
    height: resolvedCutoutHeight
  )
  let resolvedRadius = min(
    baseRadius,
    max(0, cutoutRect.width / 2),
    max(0, cutoutRect.height / 2)
  )
  guard cutoutRect.width > 0, cutoutRect.height > 0, resolvedRadius > 0 else {
    return nil
  }
  return SearchRouteNavCutoutGeometry(rect: cutoutRect, radius: resolvedRadius)
}

@objc(SearchRouteNavSilhouetteHostViewManager)
final class SearchRouteNavSilhouetteHostViewManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func view() -> UIView! {
    SearchRouteNavSilhouetteHostView()
  }
}

final class SearchRouteNavSilhouetteHostView: RCTView {
  @objc var materialEnabled: Bool = true {
    didSet {
      guard oldValue != materialEnabled else { return }
      requestMaterialPathUpdate()
    }
  }

  @objc var materialBlurAmount: NSNumber = 15 {
    didSet {
      guard oldValue != materialBlurAmount else { return }
      updateMaterialEffect()
    }
  }

  @objc var materialBlurType: NSString = "light" {
    didSet {
      guard oldValue != materialBlurType else { return }
      updateMaterialEffect()
    }
  }

  @objc var materialTintColor: UIColor = UIColor(red: 248 / 255, green: 251 / 255, blue: 255 / 255, alpha: 0.30) {
    didSet {
      tintView.backgroundColor = materialTintColor
    }
  }

  @objc var navMaterialTopInset: CGFloat = 0 {
    didSet {
      guard abs(oldValue - navMaterialTopInset) >= 0.25 else { return }
      requestMaterialPathUpdate()
    }
  }

  @objc var cutoutHeight: CGFloat = 0 {
    didSet {
      guard abs(oldValue - cutoutHeight) >= 0.25 else { return }
      requestMaterialPathUpdate()
    }
  }

  @objc var cutoutRadius: CGFloat = 0 {
    didSet {
      guard abs(oldValue - cutoutRadius) >= 0.25 else { return }
      requestMaterialPathUpdate()
    }
  }

  private let effectView = UIVisualEffectView(effect: UIBlurEffect(style: .light))
  private let tintView = UIView()
  private let effectMaskLayer = CAShapeLayer()
  private let tintMaskLayer = CAShapeLayer()
  private var lastAppliedMaterialGeometryKey: String?

  override init(frame: CGRect) {
    super.init(frame: frame)
    configure()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    configure()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    effectView.frame = bounds
    tintView.frame = bounds
    effectMaskLayer.frame = effectView.bounds
    tintMaskLayer.frame = tintView.bounds
    CATransaction.commit()
    requestMaterialPathUpdate()
  }

  private func configure() {
    backgroundColor = .clear
    clipsToBounds = false
    isUserInteractionEnabled = false
    effectView.isUserInteractionEnabled = false
    effectView.backgroundColor = .clear
    tintView.isUserInteractionEnabled = false
    tintView.backgroundColor = materialTintColor
    effectMaskLayer.fillRule = .evenOdd
    effectMaskLayer.fillColor = UIColor.black.cgColor
    effectMaskLayer.path = CGMutablePath()
    tintMaskLayer.fillRule = .evenOdd
    tintMaskLayer.fillColor = UIColor.black.cgColor
    tintMaskLayer.path = CGMutablePath()
    effectView.layer.mask = effectMaskLayer
    tintView.layer.mask = tintMaskLayer
    addSubview(effectView)
    addSubview(tintView)
    updateMaterialEffect()
  }

  private func updateMaterialEffect() {
    let blurType = materialBlurType as String
    let effectStyle: UIBlurEffect.Style = blurType == "dark" ? .dark : .light
    let blurAmount = CGFloat(truncating: materialBlurAmount)
    effectView.effect = blurAmount <= 0 ? nil : UIBlurEffect(style: effectStyle)
    effectView.alpha = max(0, min(1, blurAmount / 15))
  }

  private func requestMaterialPathUpdate() {
    updateMaterialPath()
  }

  private func updateMaterialPath() {
    guard bounds.width > 0, bounds.height > 0, materialEnabled else {
      lastAppliedMaterialGeometryKey = nil
      CATransaction.begin()
      CATransaction.setDisableActions(true)
      effectMaskLayer.path = CGMutablePath()
      tintMaskLayer.path = CGMutablePath()
      CATransaction.commit()
      return
    }

    let geometryKey = [
      roundedKey(bounds.width),
      roundedKey(bounds.height),
      roundedKey(navMaterialTopInset),
      roundedKey(cutoutHeight),
      roundedKey(cutoutRadius)
    ].joined(separator: "|")
    guard geometryKey != lastAppliedMaterialGeometryKey else {
      return
    }

    let materialPath = makeSearchRouteNavSilhouetteMaterialPath(
      materialRect: bounds,
      localNavBodyBoundaryY: navMaterialTopInset,
      cutoutHeight: cutoutHeight,
      cutoutRadius: cutoutRadius
    ) ?? CGMutablePath()

    CATransaction.begin()
    CATransaction.setDisableActions(true)
    effectMaskLayer.frame = effectView.bounds
    effectMaskLayer.path = materialPath
    effectMaskLayer.fillRule = .evenOdd
    effectMaskLayer.fillColor = UIColor.black.cgColor
    tintMaskLayer.frame = tintView.bounds
    tintMaskLayer.path = materialPath
    tintMaskLayer.fillRule = .evenOdd
    tintMaskLayer.fillColor = UIColor.black.cgColor
    CATransaction.commit()
    lastAppliedMaterialGeometryKey = geometryKey
  }

  private func roundedKey(_ value: CGFloat) -> String {
    if !value.isFinite {
      return "nan"
    }
    return String(Int((value * 2).rounded()))
  }
}

@objc(SearchRouteSheetNavExclusionMaskViewManager)
final class SearchRouteSheetNavExclusionMaskViewManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func view() -> UIView! {
    SearchRouteSheetNavExclusionMaskView()
  }
}

final class SearchRouteSheetNavExclusionMaskView: RCTView {
  @objc var maskEnabled: Bool = false {
    didSet {
      guard oldValue != maskEnabled else { return }
      requestMaskPathUpdate()
    }
  }

  @objc var navBodyBoundaryVisibleY: CGFloat = 0 {
    didSet {
      guard abs(oldValue - navBodyBoundaryVisibleY) >= 0.25 else { return }
      scheduleBoundaryTargetChange()
    }
  }

  @objc var navBodyBoundaryHiddenY: CGFloat = 0 {
    didSet {
      guard abs(oldValue - navBodyBoundaryHiddenY) >= 0.25 else { return }
      scheduleBoundaryTargetChange()
    }
  }

  @objc var navBodyBoundaryTranslateY: CGFloat = 0 {
    didSet {
      guard abs(oldValue - navBodyBoundaryTranslateY) >= 0.25 else { return }
      applyMaskTransformForCurrentTranslate()
    }
  }

  @objc var maskOriginY: CGFloat = 0 {
    didSet {
      guard abs(oldValue - maskOriginY) >= 0.25 else { return }
      requestMaskPathUpdate()
    }
  }

  private let shapeMaskLayer = CAShapeLayer()
  private var pendingMaskPathUpdate = false
  private var isMaskPathUpdateScheduled = false
  private var lastAppliedMaskGeometryKey: String?
  private var currentBoundaryDeltaY: CGFloat?
  private let maskOverscanPadding: CGFloat = 96

  override init(frame: CGRect) {
    super.init(frame: frame)
    configure()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    configure()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    requestMaskPathUpdate()
  }

  private func configure() {
    backgroundColor = .clear
    clipsToBounds = false
    shapeMaskLayer.fillRule = .evenOdd
    shapeMaskLayer.fillColor = UIColor.black.cgColor
  }

  private func requestMaskPathUpdate() {
    scheduleMaskPathUpdate()
  }

  private func scheduleMaskPathUpdate() {
    pendingMaskPathUpdate = true
    guard !isMaskPathUpdateScheduled else {
      return
    }
    isMaskPathUpdateScheduled = true
    DispatchQueue.main.async { [weak self] in
      guard let self else {
        return
      }
      self.isMaskPathUpdateScheduled = false
      guard self.pendingMaskPathUpdate else {
        return
      }
      self.pendingMaskPathUpdate = false
      self.updateMaskPath()
    }
  }

  private func updateMaskPath() {
    guard bounds.width > 0, bounds.height > 0, maskEnabled else {
      lastAppliedMaskGeometryKey = nil
      currentBoundaryDeltaY = nil
      shapeMaskLayer.removeAnimation(forKey: "navBoundaryTransform")
      shapeMaskLayer.transform = CATransform3DIdentity
      shapeMaskLayer.path = nil
      if layer.mask != nil {
        layer.mask = nil
      }
      return
    }

    ensureTranslatedMaskPath()
    guard layer.mask === shapeMaskLayer else {
      return
    }

    let targetDeltaY = resolvedBoundaryTranslateY()
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    shapeMaskLayer.removeAnimation(forKey: "navBoundaryTransform")
    shapeMaskLayer.transform = CATransform3DMakeTranslation(0, targetDeltaY, 0)
    currentBoundaryDeltaY = targetDeltaY
    CATransaction.commit()
  }

  private func ensureTranslatedMaskPath() {
    let fullRect = bounds
    let visibleBoundaryY = navBodyBoundaryVisibleY
    let hiddenBoundaryY = max(navBodyBoundaryVisibleY, navBodyBoundaryHiddenY)
    let boundaryTravelY = max(0, hiddenBoundaryY - visibleBoundaryY)
    let overscanY = boundaryTravelY + maskOverscanPadding
    let maskLayerFrame = fullRect.insetBy(dx: 0, dy: -overscanY)
    let maskPathRect = CGRect(origin: .zero, size: maskLayerFrame.size)
    let localVisibleBoundaryY = visibleBoundaryY - maskOriginY - maskLayerFrame.minY
    let geometryKey = [
      roundedKey(fullRect.width),
      roundedKey(fullRect.height),
      roundedKey(maskLayerFrame.minY),
      roundedKey(maskLayerFrame.height),
      roundedKey(localVisibleBoundaryY),
      roundedKey(hiddenBoundaryY - visibleBoundaryY)
    ].joined(separator: "|")
    guard geometryKey != lastAppliedMaskGeometryKey else {
      return
    }
    guard let maskPath = makeSheetExclusionMaskPath(
      fullRect: maskPathRect,
      localNavBodyBoundaryY: localVisibleBoundaryY
    ) else {
      lastAppliedMaskGeometryKey = geometryKey
      currentBoundaryDeltaY = nil
      shapeMaskLayer.removeAnimation(forKey: "navBoundaryTransform")
      shapeMaskLayer.path = nil
      if layer.mask != nil {
        layer.mask = nil
      }
      return
    }

    CATransaction.begin()
    CATransaction.setDisableActions(true)
    shapeMaskLayer.frame = maskLayerFrame
    shapeMaskLayer.path = maskPath
    shapeMaskLayer.fillRule = .evenOdd
    shapeMaskLayer.fillColor = UIColor.black.cgColor
    if layer.mask !== shapeMaskLayer {
      layer.mask = shapeMaskLayer
    }
    lastAppliedMaskGeometryKey = geometryKey
    CATransaction.commit()
  }

  private func scheduleBoundaryTargetChange() {
    requestMaskPathUpdate()
  }

  private func applyMaskTransformForCurrentTranslate() {
    if lastAppliedMaskGeometryKey == nil {
      scheduleMaskPathUpdate()
      return
    }
    guard layer.mask === shapeMaskLayer, shapeMaskLayer.path != nil else {
      scheduleMaskPathUpdate()
      return
    }
    let toDeltaY = resolvedBoundaryTranslateY()
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    shapeMaskLayer.removeAnimation(forKey: "navBoundaryTransform")
    shapeMaskLayer.transform = CATransform3DMakeTranslation(0, toDeltaY, 0)
    currentBoundaryDeltaY = toDeltaY
    CATransaction.commit()
  }

  private func resolvedBoundaryTranslateY() -> CGFloat {
    let hiddenBoundaryY = max(navBodyBoundaryVisibleY, navBodyBoundaryHiddenY)
    let maxBoundaryTranslateY = max(0, hiddenBoundaryY - navBodyBoundaryVisibleY)
    return max(0, min(maxBoundaryTranslateY, navBodyBoundaryTranslateY))
  }

  private func makeSheetExclusionMaskPath(
    fullRect: CGRect,
    localNavBodyBoundaryY: CGFloat
  ) -> CGPath? {
    let navBodyTopY = max(fullRect.minY, min(fullRect.maxY, localNavBodyBoundaryY))
    let navBodyRect = CGRect(
      x: fullRect.minX,
      y: navBodyTopY,
      width: fullRect.width,
      height: max(0, fullRect.maxY - navBodyTopY)
    ).intersection(fullRect)
    guard !navBodyRect.isNull, navBodyRect.width > 0, navBodyRect.height > 0 else {
      return nil
    }

    let maskPath = UIBezierPath(rect: fullRect)
    maskPath.append(UIBezierPath(rect: navBodyRect))
    return maskPath.cgPath
  }

  private func roundedKey(_ value: CGFloat) -> String {
    if !value.isFinite {
      return "nan"
    }
    return String(Int((value * 2).rounded()))
  }

}
