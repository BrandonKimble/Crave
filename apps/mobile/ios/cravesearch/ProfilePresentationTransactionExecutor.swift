import Foundation
import React

private final class WeakCameraHost {
  weak var value: RNMBXCamera?

  init(value: RNMBXCamera) {
    self.value = value
  }
}

private struct PendingCameraCommand {
  let stop: [String: Any]
  let token: String?
}

final class ProfilePresentationCameraHostRegistry {
  static let shared = ProfilePresentationCameraHostRegistry()

  private var hostsByKey: [String: WeakCameraHost] = [:]
  private var pendingCommandsByKey: [String: PendingCameraCommand] = [:]

  func register(host: RNMBXCamera, hostKey: String) {
    hostsByKey[hostKey] = WeakCameraHost(value: host)
    if let pendingCommand = pendingCommandsByKey[hostKey] {
      dispatchCommand(hostKey: hostKey, stop: pendingCommand.stop, token: pendingCommand.token)
    }
  }

  func unregister(host: RNMBXCamera, hostKey: String) {
    guard hostsByKey[hostKey]?.value === host else {
      return
    }
    hostsByKey.removeValue(forKey: hostKey)
  }

  func dispatchCommand(hostKey: String, stop: [String: Any], token: String?) {
    pendingCommandsByKey[hostKey] = PendingCameraCommand(stop: stop, token: token)
    guard let host = hostsByKey[hostKey]?.value else {
      return
    }
    DispatchQueue.main.async {
      host.applyProfilePresentationCameraCommand(stop)
    }
  }
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

    ProfilePresentationCameraHostRegistry.shared.dispatchCommand(
      hostKey: hostKey,
      stop: stop,
      token: stop["animationCompletionId"] as? String
    )
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
      BottomSheetHostRegistry.shared.dispatchCommand(
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
        BottomSheetHostRegistry.shared.dispatchCommand(
          hostKey: "app_overlay_sheet",
          snapTo: snapTo,
          token: requestToken
        )
      } else if type == "hide" {
        BottomSheetHostRegistry.shared.dispatchCommand(
          hostKey: "app_overlay_sheet",
          snapTo: "hidden",
          token: requestToken
        )
      }
    }

    resolve(nil)
  }
}
