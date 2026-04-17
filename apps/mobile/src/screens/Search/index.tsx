import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';

import type { RootStackParamList } from '../../types/navigation';
import { useAppRouteCoordinator } from '../../navigation/runtime/AppRouteCoordinator';
import { useMainLaunchCoordinator } from '../../navigation/runtime/MainLaunchCoordinator';
import { SearchMapRenderSurface } from './components/SearchMapRenderSurface';
import { SearchRuntimeBusContext } from './runtime/shared/search-runtime-bus';
import { useSearchRootRuntime } from './runtime/shared/use-search-root-runtime';

const SearchScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const isFocused = useIsFocused();
  const {
    userLocation,
    userLocationRef,
    startupLocationSnapshot,
    startupCamera,
    startupPollBounds,
    startupPollsSnapshot,
    markMainMapReady,
  } = useMainLaunchCoordinator();
  const { activeMainIntent, consumeActiveMainIntent } = useAppRouteCoordinator();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Main'>>();
  const accessToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';
  const {
    searchRuntimeBus,
    markerEngineRef,
    isInitialCameraReady,
    mapRenderSurfaceModel,
    handleProfilerRender,
  } = useSearchRootRuntime({
    isSearchScreenFocused: isFocused,
    insets,
    isSignedIn: !!isSignedIn,
    accessToken,
    startupPollBounds,
    startupCamera,
    startupLocationSnapshot,
    startupPollsSnapshot,
    markMainMapReady,
    userLocation,
    userLocationRef,
    activeMainIntent,
    consumeActiveMainIntent,
    navigation,
    routeSearchIntent: route.params?.searchIntent ?? null,
  });

  return (
    <SearchRuntimeBusContext.Provider value={searchRuntimeBus}>
      <SearchMapRenderSurface
        isInitialCameraReady={isInitialCameraReady}
        markerEngineRef={markerEngineRef}
        mapRenderSurfaceModel={mapRenderSurfaceModel}
        onProfilerRender={handleProfilerRender}
      />
    </SearchRuntimeBusContext.Provider>
  );
};

export default SearchScreen;
