// App.tsx
// IMPORTANT: This must be the FIRST import to patch react-native before anything else loads
import './src/polyfills/react-native-codegen';
import 'react-native-gesture-handler';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { enableScreens } from 'react-native-screens';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { RootNavigator } from './src/navigation';
import { AuthProvider } from './src/providers/AuthProvider';
import NetworkStatusListener from './src/providers/NetworkStatusListener';
import { navigationRef } from './src/navigation/navigationRef';
import SystemStatusBanner from './src/components/SystemStatusBanner';
import { useSystemStatusStore } from './src/store/systemStatusStore';
import { OVERLAY_CORNER_RADIUS } from './src/overlays/overlaySheetStyles';
import { colors } from './src/constants/theme';

const queryClient = new QueryClient();
const SYSTEM_BANNER_PUSH_HEIGHT = 32;
const BANNER_BACKGROUND = '#0b0b0f';

enableScreens();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

SplashScreen.preventAutoHideAsync().catch(() => {
  // noop if already prevented
});

export default function App() {
  const [appIsReady, setAppIsReady] = React.useState(false);
  const isBannerVisible = useSystemStatusStore(
    (state) => state.isOffline || Boolean(state.serviceIssue)
  );
  const bannerProgress = useSharedValue(0);

  React.useEffect(() => {
    bannerProgress.value = withTiming(isBannerVisible ? 1 : 0, {
      duration: 220,
      easing: isBannerVisible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    });
  }, [bannerProgress, isBannerVisible]);

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    paddingTop: SYSTEM_BANNER_PUSH_HEIGHT * bannerProgress.value,
    borderTopLeftRadius: OVERLAY_CORNER_RADIUS * bannerProgress.value,
    borderTopRightRadius: OVERLAY_CORNER_RADIUS * bannerProgress.value,
  }));

  React.useEffect(() => {
    const prepare = async () => {
      try {
        // TODO: load fonts/resources when needed
      } finally {
        setAppIsReady(true);
      }
    };

    void prepare();
  }, []);

  const onLayoutRootView = React.useCallback(async () => {
    if (appIsReady) {
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <View
        style={[styles.appRoot, isBannerVisible ? styles.appRootBannerVisible : null]}
        onLayout={onLayoutRootView}
      >
        <SafeAreaProvider>
          <NetworkStatusListener />
          <AuthProvider>
            <SystemStatusBanner />
            <Reanimated.View style={[styles.contentSurface, contentAnimatedStyle]}>
              <NavigationContainer ref={navigationRef}>
                <RootNavigator />
              </NavigationContainer>
            </Reanimated.View>
          </AuthProvider>
          <StatusBar style={isBannerVisible ? 'light' : 'auto'} />
        </SafeAreaProvider>
      </View>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
    backgroundColor: colors.background,
  },
  appRootBannerVisible: {
    backgroundColor: BANNER_BACKGROUND,
  },
  contentSurface: {
    flex: 1,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
});
