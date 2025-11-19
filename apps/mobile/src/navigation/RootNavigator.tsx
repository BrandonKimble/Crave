import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '@clerk/clerk-expo';
import { SearchScreen, ProfileScreen, OnboardingScreen, SignInScreen } from '../screens';
import type { RootStackParamList } from '../types/navigation';
import { useOnboardingStore } from '../store/onboardingStore';

const Stack = createStackNavigator<RootStackParamList>();

const RootNavigator: React.FC = () => {
  const hasCompletedOnboarding = useOnboardingStore((state) => state.hasCompletedOnboarding);
  const { isSignedIn } = useAuth();
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

  if (!isHydrated) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
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
});

export default RootNavigator;
