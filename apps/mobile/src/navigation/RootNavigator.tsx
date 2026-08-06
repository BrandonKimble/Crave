import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { OnboardingScreen, SignInScreen } from '../screens';
import { PaywallScreen } from '../screens/PaywallScreen';
import StaticSplashArtShell from '../components/StaticSplashArtShell';
import SplashStudioScreen from '../splash-studio/SplashStudioScreen';
import { isSplashStudioEnabled } from '../splash-studio/config';
import type { RootStackParamList } from '../types/navigation';
import { AppShellMainNavigator } from './runtime/AppShellMainNavigator';
import { useAppRouteCoordinator } from './runtime/AppRouteCoordinator';
import { AccountDeletedScreen } from '../screens/AccountDeletedScreen';

const Stack = createStackNavigator<RootStackParamList>();

const OnboardingNavigator: React.FC = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
      cardStyle: { backgroundColor: 'transparent' },
    }}
  >
    <Stack.Screen name="Onboarding" component={OnboardingScreen} />
  </Stack.Navigator>
);

const AuthNavigator: React.FC = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
      cardStyle: { backgroundColor: 'transparent' },
    }}
  >
    <Stack.Screen name="SignIn" component={SignInScreen} />
  </Stack.Navigator>
);

// F942: THE `isReadyToRender` GATE IS GONE FROM THE FRONT DOOR, mutation-proven rather
// than assumed. The block that used to sit below the splash-studio branch —
//   `if (!isReadyToRender) return destination === 'main' ? <AppShellMainNavigator/> : null;`
// — could not change any path:
//   1. the guard above already returned unless `isReady && routeState`;
//   2. MainLaunchCoordinator binds its `isRouteReady` to that SAME coordinator `isReady`;
//   3. its `isReadyToRender` is `escape || (isRouteReady && routeState != null &&
//      (destination === 'main' ? startup && mainLaunchReady : TRUE))` — so for every
//      NON-main destination it is necessarily already true here, making the `: null` arm
//      unreachable; and the 'main' arm returned `<AppShellMainNavigator />`, byte-identical
//      to what `case 'main'` returns below.
// It compensated for an older split where the splash lived ABOVE the shell and main had to
// render early. The splash gate now lives INSIDE the main shell (shouldHideSplash), so the
// honest statement is that `isReadyToRender` is a main-launch concept that no longer routes
// anything — and RootNavigator stops consuming it.
const RootNavigator: React.FC = () => {
  const { isReady, routeState } = useAppRouteCoordinator();

  if (!isReady || !routeState) {
    return null;
  }

  if (routeState.destination === 'main' && isSplashStudioEnabled) {
    return <SplashStudioScreen />;
  }

  switch (routeState.destination) {
    case 'onboarding':
      return (
        <StaticSplashArtShell>
          <OnboardingNavigator />
        </StaticSplashArtShell>
      );
    case 'sign_in':
      return (
        <StaticSplashArtShell>
          <AuthNavigator />
        </StaticSplashArtShell>
      );
    case 'account_deleted':
      // Non-dismissible, like the paywall: the axis leaves when the server
      // says the account is live again (restore clears the flag).
      return (
        <StaticSplashArtShell>
          <AccountDeletedScreen />
        </StaticSplashArtShell>
      );
    case 'paywall':
      // HARD PAYWALL at onboarding end: non-dismissible (no onClose). Entry
      // to 'main' = server-truth access flipping active (the coordinator's
      // routing axis re-routes automatically post-purchase).
      return (
        <StaticSplashArtShell>
          <PaywallScreen />
        </StaticSplashArtShell>
      );
    case 'main':
      return <AppShellMainNavigator />;
    default:
      return null;
  }
};

export default RootNavigator;
