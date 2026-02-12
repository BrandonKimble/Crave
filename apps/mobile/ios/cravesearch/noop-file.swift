import Foundation
import QuartzCore
import React
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
