import Foundation
import React

private func dispatchProfilePresentationCameraCommand(
  hostKey: String,
  stop: [String: Any]
) -> Bool {
  let bridgeClass =
    (NSClassFromString("rnmapbox_maps.ProfilePresentationCameraHostRegistryBridge")
      ?? NSClassFromString("ProfilePresentationCameraHostRegistryBridge")) as? NSObject.Type
  let sharedSelector = NSSelectorFromString("sharedBridge")
  let dispatchSelector = NSSelectorFromString("dispatchCommand:")

  guard
    let bridgeClass,
    bridgeClass.responds(to: sharedSelector),
    let bridge = bridgeClass.perform(sharedSelector)?.takeUnretainedValue() as? NSObject,
    bridge.responds(to: dispatchSelector)
  else {
    return false
  }

  let payload: NSDictionary = [
    "hostKey": hostKey,
    "stop": stop,
    "token": stop["animationCompletionId"] as? String as Any,
  ]
  bridge.perform(dispatchSelector, with: payload)
  return true
}

private func dispatchBottomSheetCommand(
  hostKey: String,
  snapTo: String,
  token: Int
) -> Bool {
  let bridgeClass =
    (NSClassFromString("cravesearch.BottomSheetHostRegistryBridge")
      ?? NSClassFromString("BottomSheetHostRegistryBridge")) as? NSObject.Type
  let sharedSelector = NSSelectorFromString("sharedBridge")
  let dispatchSelector = NSSelectorFromString("dispatchCommand:")

  guard
    let bridgeClass,
    bridgeClass.responds(to: sharedSelector),
    let bridge = bridgeClass.perform(sharedSelector)?.takeUnretainedValue() as? NSObject,
    bridge.responds(to: dispatchSelector)
  else {
    return false
  }

  let payload: NSDictionary = [
    "hostKey": hostKey,
    "snapTo": snapTo,
    "token": token,
  ]
  bridge.perform(dispatchSelector, with: payload)
  return true
}

@objc(PresentationCommandExecutor)
final class ProfilePresentationTransactionExecutor: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc
  func constantsToExport() -> [AnyHashable: Any]! {
    [
      "cameraCommandExecutionAvailable": true,
      "sheetCommandExecutionAvailable": true,
    ]
  }

  @objc(executeCameraCommand:resolver:rejecter:)
  func executeCameraCommand(
    _ payload: NSDictionary,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard
      let hostKey = payload["hostKey"] as? String,
      let stop = payload["stop"] as? [String: Any]
    else {
      reject("invalid_payload", "Expected hostKey and stop", nil)
      return
    }

    guard dispatchProfilePresentationCameraCommand(hostKey: hostKey, stop: stop) else {
      reject("camera_command_unavailable", "Camera command bridge unavailable", nil)
      return
    }

    resolve(nil)
  }

  @objc(executeSheetCommands:resolver:rejecter:)
  func executeSheetCommands(
    _ payload: NSDictionary,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    let executionContext = payload["executionContext"] as? [String: Any]
    let commandSet = payload["commandSet"] as? [String: Any]
    let requestToken = executionContext?["requestToken"] as? Int

    if
      let restaurantSheetCommand = commandSet?["restaurantSheetCommand"] as? [String: Any],
      let type = restaurantSheetCommand["type"] as? String,
      type == "request",
      let snapTo = restaurantSheetCommand["snap"] as? String,
      let requestToken
    {
      _ = dispatchBottomSheetCommand(
        hostKey: "restaurant_profile_sheet",
        snapTo: snapTo,
        token: requestToken
      )
    }

    if
      let resultsSheetCommand = commandSet?["resultsSheetCommand"] as? [String: Any],
      let type = resultsSheetCommand["type"] as? String,
      let requestToken
    {
      if type == "request", let snapTo = resultsSheetCommand["snap"] as? String {
        _ = dispatchBottomSheetCommand(
          hostKey: "app_overlay_sheet",
          snapTo: snapTo,
          token: requestToken
        )
      } else if type == "hide" {
        _ = dispatchBottomSheetCommand(
          hostKey: "app_overlay_sheet",
          snapTo: "hidden",
          token: requestToken
        )
      }
    }

    resolve(nil)
  }
}
