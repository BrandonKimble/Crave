import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import {
  SearchScreen,
  ProfileScreen,
  OnboardingScreen,
  SignInScreen,
  FavoritesListDetailScreen,
  RecentSearchesScreen,
  RecentlyViewedScreen,
} from '../screens';
import StaticSplashArtShell from '../components/StaticSplashArtShell';
import SplashStudioScreen from '../splash-studio/SplashStudioScreen';
import { isSplashStudioEnabled } from '../splash-studio/config';
import type { RootStackParamList } from '../types/navigation';
import { useAppRouteCoordinator } from './runtime/AppRouteCoordinator';
import { useMainLaunchCoordinator } from './runtime/MainLaunchCoordinator';

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

const MainNavigator: React.FC = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Main" component={SearchScreen} />
    <Stack.Screen name="Profile" component={ProfileScreen} />
    <Stack.Screen name="RecentSearches" component={RecentSearchesScreen} />
    <Stack.Screen name="RecentlyViewed" component={RecentlyViewedScreen} />
    <Stack.Screen
      name="FavoritesListDetail"
      component={FavoritesListDetailScreen}
      options={{ presentation: 'modal', headerShown: false }}
    />
  </Stack.Navigator>
);

const RootNavigator: React.FC = () => {
  const { isReady, routeState } = useAppRouteCoordinator();
  const { isReadyToRender } = useMainLaunchCoordinator();

  if (!isReady || !routeState) {
    return null;
  }

  if (routeState.destination === 'main' && isSplashStudioEnabled) {
    return <SplashStudioScreen />;
  }

  if (!isReadyToRender) {
    return routeState.destination === 'main' ? <MainNavigator /> : null;
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
    case 'main':
      return <MainNavigator />;
    default:
      return null;
  }
};

export default RootNavigator;
