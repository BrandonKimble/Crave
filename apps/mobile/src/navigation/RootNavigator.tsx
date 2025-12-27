import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '@clerk/clerk-expo';
import {
  SearchScreen,
  ProfileScreen,
  OnboardingScreen,
  SignInScreen,
  FavoritesListDetailScreen,
} from '../screens';
import type { RootStackParamList } from '../types/navigation';
import { useOnboardingStore } from '../store/onboardingStore';
import splashImage from '../assets/splash.png';

const Stack = createStackNavigator<RootStackParamList>();

const RootNavigator: React.FC = () => {
  const hasCompletedOnboarding = useOnboardingStore((state) => state.hasCompletedOnboarding);
  const { isLoaded, isSignedIn } = useAuth();
  const [isHydrated, setIsHydrated] = React.useState(() =>
    useOnboardingStore.persist.hasHydrated()
  );

  React.useEffect(() => {
    if (useOnboardingStore.persist.hasHydrated()) {
      setIsHydrated(true);
      return;
    }
    const unsub = useOnboardingStore.persist.onFinishHydration(() => {
      setIsHydrated(true);
    });
    return () => {
      unsub();
    };
  }, []);

  if (!isHydrated || !isLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <Image source={splashImage} style={styles.loadingImage} resizeMode="contain" />
      </View>
    );
  }

  const showOnboarding = !hasCompletedOnboarding;
  const showSignIn = hasCompletedOnboarding && !isSignedIn;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {showOnboarding ? <Stack.Screen name="Onboarding" component={OnboardingScreen} /> : null}
      {showSignIn ? <Stack.Screen name="SignIn" component={SignInScreen} /> : null}
      <Stack.Screen name="Main" component={SearchScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen
        name="FavoritesListDetail"
        component={FavoritesListDetailScreen}
        options={{ presentation: 'modal', headerShown: false }}
      />
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  loadingImage: {
    width: '70%',
    maxWidth: 280,
    height: 220,
  },
});

export default RootNavigator;
