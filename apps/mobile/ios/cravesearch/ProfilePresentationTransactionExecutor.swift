import Foundation
import React

// ===========================================================================
// STRING-REFLECTION COUPLING (D44/F1113, documented 2026-08-03; camera half
// DELETED by D61, 2026-08-04).
//
// The dispatch function below reaches its target through
// NSClassFromString + NSSelectorFromString. That is FOUR string literals that
// no compiler checks, and a miss degrades to `return false`.
//
// BottomSheetHostRegistryBridge lives in THIS SAME TARGET
// (CraveBottomSheetHostView.swift, ~line 60). Reflection buys nothing here and
// costs the compiler's guarantee; a direct
// `BottomSheetHostRegistryBridge.sharedBridge().dispatchCommand(payload)`
// would make a rename a build error. Left as-is by the D44 ruling (comment,
// do not change behaviour) — the ideal shape is recorded, not applied.
//
// The SECOND hatch this comment used to document — the camera-command dispatch
// into the patched @rnmapbox/maps pod's ProfilePresentationCameraHostRegistry
// Bridge — is GONE (D61): the camera lane's hostless window is handled by the
// CameraIntentArbiter's park-and-replay in JS, and the native fallback's
// contract could not tell "applied" from "parked forever" (F1716). Do not
// rebuild it.
//
// IF YOU RENAME THE BRIDGE CLASS OR ITS `sharedBridge` / `dispatchCommand:`
// SELECTORS, GREP THIS FILE. The fallback also hardcodes the Swift
// module-name mangling prefix (`cravesearch.`), so a module rename breaks it.
//
// Corollary worth knowing before you delete anything: BottomSheetHostRegistry
// Bridge has ZERO references anywhere in JS and is nonetheless VERY MUCH ALIVE
// — this file is its only caller, by reflection. A dead-code sweep that trusts
// grep will delete a live bridge.
// ===========================================================================

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
      "sheetCommandExecutionAvailable": true,
    ]
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
