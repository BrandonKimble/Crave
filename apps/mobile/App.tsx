// App.tsx
// IMPORTANT: This must be the FIRST import to patch react-native before anything else loads
import './src/polyfills/react-native-codegen';
import 'react-native-gesture-handler';
import React from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { enableScreens } from 'react-native-screens';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { RootNavigator } from './src/navigation';
import { AuthProvider } from './src/providers/AuthProvider';

const queryClient = new QueryClient();

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
      <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <SafeAreaProvider>
          <AuthProvider>
            <NavigationContainer>
              <RootNavigator />
            </NavigationContainer>
          </AuthProvider>
          <StatusBar style="auto" />
        </SafeAreaProvider>
      </View>
    </QueryClientProvider>
  );
}
