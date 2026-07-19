import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';

import type { RootStackParamList } from '../../../../types/navigation';
import { useAppRouteCoordinator } from '../../../../navigation/runtime/AppRouteCoordinator';
import { useMainLaunchCoordinator } from '../../../../navigation/runtime/MainLaunchCoordinator';

export const useSearchScreenAppEntryPlaneRuntime = () => {
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const isFocused = useIsFocused();
  const {
    userLocation,
    userLocationRef,
    startupLocationSnapshot,
    startupCamera,
    startupPollBounds,
    markMainMapLoaded,
    markMainMapReady,
  } = useMainLaunchCoordinator();
  const { activeMainIntent, consumeActiveMainIntent } = useAppRouteCoordinator();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Main'>>();
  const accessToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

  return React.useMemo(
    () => ({
      accessToken,
      insets,
      isSignedIn: !!isSignedIn,
      isFocused,
      userLocation,
      userLocationRef,
      startupLocationSnapshot,
      startupCamera,
      startupPollBounds,
      markMainMapLoaded,
      markMainMapReady,
      activeMainIntent,
      consumeActiveMainIntent,
      navigation,
      routeSearchIntent: route.params?.searchIntent ?? null,
    }),
    [
      accessToken,
      activeMainIntent,
      consumeActiveMainIntent,
      insets,
      isFocused,
      isSignedIn,
      markMainMapLoaded,
      markMainMapReady,
      navigation,
      route.params?.searchIntent,
      startupCamera,
      startupLocationSnapshot,
      startupPollBounds,
      userLocation,
      userLocationRef,
    ]
  );
};
