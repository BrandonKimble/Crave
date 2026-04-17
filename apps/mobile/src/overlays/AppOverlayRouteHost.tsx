import React from 'react';
import { StyleSheet, View } from 'react-native';

import RestaurantRouteLayerHost from './RestaurantRouteLayerHost';
import SearchAppShellHost from './SearchAppShellHost';
import { useOverlayStore } from '../store/overlayStore';

const NOOP_PROFILER_RENDER: React.ProfilerOnRenderCallback = () => undefined;

const AppOverlayRouteHost = () => {
  const activeOverlayRoute = useOverlayStore((state) => state.activeOverlayRoute);

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <SearchAppShellHost />
      {activeOverlayRoute.key === 'restaurant' ? (
        <React.Profiler id="AppOverlayRouteHost" onRender={NOOP_PROFILER_RENDER}>
          <RestaurantRouteLayerHost />
        </React.Profiler>
      ) : null}
    </View>
  );
};

export default React.memo(AppOverlayRouteHost);
