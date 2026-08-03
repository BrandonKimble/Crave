import Foundation
import React

// ===========================================================================
// STRING-REFLECTION COUPLING (D44/F1113, documented 2026-08-03 — made VISIBLE,
// deliberately not "fixed").
//
// Both dispatch functions below reach their target through
// NSClassFromString + NSSelectorFromString. That is FOUR string literals per
// hatch that no compiler checks, and a miss degrades to `return false` — the
// caller rejects the promise and the user simply sees "the camera command
// didn't happen".
//
// The two hatches are NOT the same kind of thing:
//
//  1. ProfilePresentationCameraHostRegistryBridge lives INSIDE the patched
//     @rnmapbox/maps pod (patches/@rnmapbox+maps+10.3.1.patch ADDS that very
//     class). There is no header to import across that boundary, so reflection
//     is the honest tool here. The live hazard is the PATCH: if it fails to
//     apply after a `yarn install`, the class does not exist and every profile
//     camera command silently no-ops. That has happened before — the 10.2.9
//     patch went unapplied for weeks (see product/pre-launch.md).
//
//  2. BottomSheetHostRegistryBridge lives in THIS SAME TARGET
//     (CraveBottomSheetHostView.swift, ~line 60). Reflection buys nothing
//     there and costs the compiler's guarantee; a direct
//     `BottomSheetHostRegistryBridge.sharedBridge().dispatchCommand(payload)`
//     would make a rename a build error. Left as-is by the D44 ruling (comment,
//     do not change behaviour) — the ideal shape is recorded, not applied.
//
// IF YOU RENAME EITHER BRIDGE CLASS OR ITS `sharedBridge` / `dispatchCommand:`
// SELECTORS, GREP THIS FILE. Note the fallbacks also hardcode the Swift
// module-name mangling prefixes (`rnmapbox_maps.`, `cravesearch.`), so a
// module rename breaks them too.
//
// Corollary worth knowing before you delete anything: BottomSheetHostRegistry
// Bridge has ZERO references anywhere in JS and is nonetheless VERY MUCH ALIVE
// — this file is its only caller, by reflection. A dead-code sweep that trusts
// grep will delete a live bridge.
// ===========================================================================

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
