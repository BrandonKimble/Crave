// App.tsx
// IMPORTANT: This must be the FIRST import to patch react-native before anything else loads
import './src/polyfills/react-native-codegen';
import 'react-native-gesture-handler';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { enableScreens } from 'react-native-screens';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as WebBrowser from 'expo-web-browser';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { RootNavigator } from './src/navigation';
import { AppModalHost } from './src/components/AppModalHost';
import { OptionSelectorHost } from './src/components/OptionSelectorHost';
import { ScoreInfoHost } from './src/components/ScoreInfoHost';
import { CollaboratorModalHost } from './src/components/CollaboratorModalHost';
import { ListEditHost } from './src/components/ListEditHost';
import { ShareModalHost } from './src/components/ShareModalHost';
import {
  announceFailureIfOnline,
  wireFailureAnnouncerOfflineRead,
} from './src/components/app-modal-store';
import { AuthProvider } from './src/providers/AuthProvider';
import { AppRouteCoordinator } from './src/navigation/runtime/AppRouteCoordinator';
import { AppRouteSceneRuntimeProvider } from './src/navigation/runtime/AppRouteSceneRuntimeProvider';
import { MainLaunchCoordinator } from './src/navigation/runtime/MainLaunchCoordinator';
import NetworkStatusListener from './src/providers/NetworkStatusListener';
import { PurchasesProvider } from './src/providers/PurchasesProvider';
import { PaywallDevPreview } from './src/screens/PaywallDevPreview';
import { EntitlementLapseHost } from './src/screens/EntitlementLapseHost';
import { CameraCaptureHost } from './src/screens/CameraCaptureHost';
import { PostPhotosFunnelHost } from './src/overlays/PostPhotosFunnelHost';
import PollNotificationListener from './src/providers/PollNotificationListener';
import SystemStatusBanner from './src/components/SystemStatusBanner';
import { PerfScenarioCoordinator } from './src/perf/PerfScenarioCoordinator';
import { ResidentShellPrototype } from './src/perf/ResidentShellPrototype';
import { scheduleResidentShellPrewarm } from './src/overlays/shell-residency-manager';
import { LifecycleHarnessCoordinator } from './src/perf/lifecycle-harness/LifecycleHarnessCoordinator';
import { LifecycleHarnessBridge } from './src/perf/lifecycle-harness/LifecycleHarnessBridge';
import { CutoutSkeletonDevPreview } from './src/components/skeletons/CutoutSkeletonDevPreview';
import { useSystemStatusStore } from './src/store/systemStatusStore';
import { OVERLAY_CORNER_RADIUS } from './src/overlays/overlaySheetStyles';
import { colors } from './src/constants/theme';

// THE UNIFORM FAILURE CHOKEPOINT (owner spec, 2026-07-08): every react-query mutation
// failure in the app announces through the ONE standard modal — no per-call-site error
// handling. Offline the announcer stays silent (offline = the universal hang: the
// system banner + persisting skeletons own that story). Mutations that legitimately
// handle their own failure UX opt out via `meta: { suppressFailureModal: true }`.
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.suppressFailureModal === true) {
        return;
      }
      // Entitlement lapse is ONE story: the paywall takeover owns it — no
      // generic failure modal stacked on top.
      if ((error as { isEntitlementLapse?: boolean })?.isEntitlementLapse) {
        return;
      }
      announceFailureIfOnline();
    },
  }),
});
// The announcer's offline read is wired lazily to keep the modal store dependency-free.
wireFailureAnnouncerOfflineRead(() => useSystemStatusStore.getState().isOffline);
const SYSTEM_BANNER_PUSH_HEIGHT = 32;
const BANNER_BACKGROUND = '#000000';

enableScreens();
WebBrowser.maybeCompleteAuthSession();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

SplashScreen.preventAutoHideAsync().catch(() => {
  // noop if already prevented
});
SplashScreen.setOptions({
  fade: true,
  duration: 280,
});

export default function App() {
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

  // L3 warm-before-navigate: mount the residency-managed shells at app-idle so a
  // navigation never compiles one (the [SHELL-RESIDENCY][CONTRACT] RED stays quiet).
  React.useEffect(() => {
    scheduleResidentShellPrewarm();
  }, []);
  const contentAnimatedStyle = useAnimatedStyle(() => ({
    paddingTop: SYSTEM_BANNER_PUSH_HEIGHT * bannerProgress.value,
    borderTopLeftRadius: OVERLAY_CORNER_RADIUS * bannerProgress.value,
    borderTopRightRadius: OVERLAY_CORNER_RADIUS * bannerProgress.value,
  }));
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={[styles.appRoot, isBannerVisible ? styles.appRootBannerVisible : null]}>
          <SafeAreaProvider initialMetrics={initialWindowMetrics ?? undefined}>
            <NetworkStatusListener />
            <PerfScenarioCoordinator />
            {__DEV__ ? <LifecycleHarnessCoordinator /> : null}
            <AuthProvider>
              <AppRouteCoordinator>
                <MainLaunchCoordinator>
                  <AppRouteSceneRuntimeProvider>
                    {/* L3 residency prototype (measurement harness): must sit INSIDE the
                        scene runtime provider — PageBodyShell's failure-law hook reads it. */}
                    <ResidentShellPrototype />
                    <PollNotificationListener />
                    {__DEV__ ? <LifecycleHarnessBridge /> : null}
                    <PurchasesProvider />
                    <EntitlementLapseHost />
                    {/* W2 photo funnel (page-registry §7.4): the app-wide 2-option modal host
                        + the full-screen custom camera (outside the sheet system, §9a). */}
                    <PostPhotosFunnelHost />
                    <CameraCaptureHost />
                    {__DEV__ ? <PaywallDevPreview /> : null}
                    <SystemStatusBanner />
                    <Reanimated.View style={[styles.contentSurface, contentAnimatedStyle]}>
                      <NavigationContainer>
                        <RootNavigator />
                      </NavigationContainer>
                    </Reanimated.View>
                  </AppRouteSceneRuntimeProvider>
                </MainLaunchCoordinator>
              </AppRouteCoordinator>
            </AuthProvider>
            <ShareModalHost />
            <AppModalHost />
            {/* Dropdown-toggle selector host (toggle-strip primitive): any strip's
                SelectorChip opens its option sheet here via showOptionSelector. */}
            <OptionSelectorHost />
            {/* Score-info sheet host (result cards' info button): viewport-anchored
                mount for every non-search surface via showScoreInfo. */}
            <ScoreInfoHost />
            {/* Collaborator-roster modal host (list detail's avatar-stack chip):
                viewport-anchored mount via showCollaboratorModal. */}
            <CollaboratorModalHost />
            {/* The ONE listEdit panel (wave-3 §4): create-vs-edit list metadata,
                opened from the Lists home plus and per-list ellipsis "Edit". */}
            <ListEditHost />
            {__DEV__ ? <CutoutSkeletonDevPreview /> : null}
            <StatusBar style={isBannerVisible ? 'light' : 'auto'} />
          </SafeAreaProvider>
        </View>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
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
