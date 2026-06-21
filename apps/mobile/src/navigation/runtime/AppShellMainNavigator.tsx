import React from 'react';
import { createStackNavigator, type StackNavigationOptions } from '@react-navigation/stack';

import {
  ProfileScreen,
  RecentSearchesScreen,
  RecentlyViewedScreen,
  SearchScreen,
} from '../../screens';
import type { RootStackParamList } from '../../types/navigation';
import { AppRouteOverlayHostRuntimeProvider } from './AppRouteOverlayHostRuntimeProvider';
import { AppRouteSharedSheetRuntimeProvider } from './AppRouteSharedSheetRuntimeProvider';
import { AppRouteSceneChromeMotionRuntimeProvider } from './AppRouteSceneChromeMotionRuntimeProvider';
import { AppRouteSheetHostRuntimeProvider } from './AppRouteSheetHostRuntimeProvider';
import { useAppRouteSceneRuntime } from './AppRouteSceneRuntimeProvider';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';
import { createAppRoutePollsSceneInputController } from './app-route-polls-scene-input-controller';
import { useAppRouteDynamicSceneInputWritersRuntime } from './use-app-route-dynamic-scene-input-writers-runtime';
import { useAppRoutePollsSceneInputWriterRuntime } from './use-app-route-polls-scene-input-writer-runtime';
import { usePerfScenarioOverlaySceneCommand } from '../../perf/use-perf-scenario-overlay-scene-command';

const Stack = createStackNavigator<RootStackParamList>();

type MainStackSceneDefinition = {
  routeName: keyof RootStackParamList;
  component: React.ComponentType<object>;
  options?: StackNavigationOptions;
};

const MAIN_STACK_SCENE_DEFINITIONS: MainStackSceneDefinition[] = [
  {
    routeName: 'Main',
    component: SearchScreen as React.ComponentType<object>,
  },
  {
    routeName: 'Profile',
    component: ProfileScreen as React.ComponentType<object>,
  },
  {
    routeName: 'RecentSearches',
    component: RecentSearchesScreen as React.ComponentType<object>,
  },
  {
    routeName: 'RecentlyViewed',
    component: RecentlyViewedScreen as React.ComponentType<object>,
  },
];

const AppRouteSceneInputWritersRuntimeHost = React.memo(
  function AppRouteSceneInputWritersRuntimeHost({
    routeSceneRuntime,
  }: {
    routeSceneRuntime: AppRouteSceneRuntime;
  }) {
    React.useEffect(() => {
      const pollsSceneInputController = createAppRoutePollsSceneInputController({
        routeSceneRuntime,
      });

      return () => {
        pollsSceneInputController.dispose();
      };
    }, [routeSceneRuntime]);

    useAppRoutePollsSceneInputWriterRuntime({
      routeSceneRuntime,
    });

    useAppRouteDynamicSceneInputWritersRuntime({
      routeSceneRuntime,
    });

    usePerfScenarioOverlaySceneCommand({
      routeSceneRuntime,
    });

    return null;
  }
);

const AppShellRouteRuntimeProviders = React.memo(function AppShellRouteRuntimeProviders({
  children,
  routeSceneRuntime,
}: React.PropsWithChildren<{
  routeSceneRuntime: AppRouteSceneRuntime;
}>) {
  return (
    <AppRouteSharedSheetRuntimeProvider routeSceneRuntime={routeSceneRuntime}>
      <AppRouteSheetHostRuntimeProvider routeSceneRuntime={routeSceneRuntime}>
        <AppRouteSceneChromeMotionRuntimeProvider routeSceneRuntime={routeSceneRuntime}>
          <AppRouteOverlayHostRuntimeProvider>{children}</AppRouteOverlayHostRuntimeProvider>
        </AppRouteSceneChromeMotionRuntimeProvider>
      </AppRouteSheetHostRuntimeProvider>
    </AppRouteSharedSheetRuntimeProvider>
  );
});

const AppShellMainStack = React.memo(function AppShellMainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {MAIN_STACK_SCENE_DEFINITIONS.map((scene) => (
        <Stack.Screen
          key={scene.routeName}
          name={scene.routeName}
          component={scene.component}
          options={scene.options}
        />
      ))}
    </Stack.Navigator>
  );
});

export const AppShellMainNavigator: React.FC = () => {
  const routeSceneRuntime = useAppRouteSceneRuntime();

  return (
    <AppShellRouteRuntimeProviders routeSceneRuntime={routeSceneRuntime}>
      <AppRouteSceneInputWritersRuntimeHost routeSceneRuntime={routeSceneRuntime} />
      <AppShellMainStack />
    </AppShellRouteRuntimeProviders>
  );
};
