import UIKit
import Expo
import React
import ReactAppDependencyProvider

private final class AppReactNativeFactoryDelegate: ExpoReactNativeFactoryDelegate {
  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings()
      .jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}

@objc(AppDelegate)
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?
  private var reactNativeDelegate: ExpoReactNativeFactoryDelegate?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let reactNativeDelegate = AppReactNativeFactoryDelegate()
    reactNativeDelegate.dependencyProvider = RCTAppDependencyProvider()
    self.reactNativeDelegate = reactNativeDelegate

    let reactNativeFactory = ExpoReactNativeFactory(delegate: reactNativeDelegate)
    bindReactNativeFactory(reactNativeFactory)

    let window = UIWindow(frame: UIScreen.main.bounds)
    self.window = window
    reactNativeFactory.startReactNative(
      withModuleName: "main",
      in: window,
      initialProperties: [:],
      launchOptions: launchOptions
    )

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) ||
      RCTLinkingManager.application(app, open: url, options: options)
  }

  override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let handled = RCTLinkingManager.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    )
    return super.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    ) || handled
  }
}
