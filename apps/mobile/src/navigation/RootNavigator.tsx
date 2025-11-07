import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import BottomTabNavigator from './BottomTabNavigator';
import { OnboardingScreen } from '../screens';
import type { RootStackParamList } from '../types/navigation';
import { useOnboardingStore } from '../store/onboardingStore';

const Stack = createStackNavigator<RootStackParamList>();

const RootNavigator: React.FC = () => {
  const hasCompletedOnboarding = useOnboardingStore((state) => state.hasCompletedOnboarding);
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

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!hasCompletedOnboarding ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      ) : null}
      <Stack.Screen name="Tabs" component={BottomTabNavigator} />
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
