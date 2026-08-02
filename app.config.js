module.exports = {
  expo: {
    name: 'crave-search',
    slug: 'crave-search',
    scheme: 'crave',
    version: '0.1.0',
    jsEngine: 'hermes',
    platforms: ['ios', 'android', 'web'],
    plugins: ['expo-apple-authentication'],
    android: {
      package: 'com.crave.search',
    },
    ios: {
      // Canonical, and authoritative because App Store Connect holds the app
      // record under it (app id 6793724490, "Crave - Find what to eat").
      // The Xcode project, every maestro flow, and the RevenueCat project all
      // agree. This value was 'com.crave.search' until 2026-08-02 — a prebuild
      // would have rewritten the native id and broken provisioning + the
      // RevenueCat product mapping. Do not change it without changing ASC.
      bundleIdentifier: 'com.brandonkimble.cravesearch',
      usesAppleSignIn: true,
    },
  },
};
