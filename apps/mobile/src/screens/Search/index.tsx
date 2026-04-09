import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';

import type { RootStackParamList } from '../../types/navigation';
import { useAppRouteCoordinator } from '../../navigation/runtime/AppRouteCoordinator';
import { useMainLaunchCoordinator } from '../../navigation/runtime/MainLaunchCoordinator';
import { SearchRootRenderSurface } from './components/SearchRootRenderSurface';
import { SearchRuntimeBusContext } from './runtime/shared/search-runtime-bus';
import { useSearchRootRuntime } from './runtime/shared/use-search-root-runtime';

const SearchScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const {
    userLocation,
    userLocationRef,
    ensureUserLocation,
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
    shouldRenderSearchOverlay,
    statusBarFadeHeight,
    searchOverlayChromeModel,
    searchMapProps,
    bottomNavProps,
    rankAndScoreSheetsProps,
    priceSheetProps,
    handleProfilerRender,
  } = useSearchRootRuntime({
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
    ensureUserLocation,
    activeMainIntent,
    consumeActiveMainIntent,
    navigation,
    routeSearchIntent: route.params?.searchIntent ?? null,
  });

  return (
    <SearchRuntimeBusContext.Provider value={searchRuntimeBus}>
      <SearchRootRenderSurface
        isInitialCameraReady={isInitialCameraReady}
        markerEngineRef={markerEngineRef}
        searchMapProps={searchMapProps}
        statusBarFadeHeight={statusBarFadeHeight}
        shouldRenderSearchOverlay={shouldRenderSearchOverlay}
        searchOverlayChromeModel={searchOverlayChromeModel}
        bottomNavProps={bottomNavProps}
        rankAndScoreSheetsProps={rankAndScoreSheetsProps}
        priceSheetProps={priceSheetProps}
        onProfilerRender={handleProfilerRender}
      />
    </SearchRuntimeBusContext.Provider>
  );
};

export default SearchScreen;
