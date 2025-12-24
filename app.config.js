module.exports = {
  expo: {
    name: 'crave-search',
    slug: 'crave-search',
    scheme: 'crave',
    version: '0.1.0',
    platforms: ['ios', 'android', 'web'],
    plugins: ['expo-apple-authentication'],
    android: {
      package: 'com.crave.search',
    },
    ios: {
      bundleIdentifier: 'com.crave.search',
      usesAppleSignIn: true,
    },
  },
};
