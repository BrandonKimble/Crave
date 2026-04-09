import React from 'react';

import RestaurantRouteLayerHost from './RestaurantRouteLayerHost';
import SearchRouteLayerHost from './SearchRouteLayerHost';
import { useOverlayStore } from '../store/overlayStore';

const NOOP_PROFILER_RENDER: React.ProfilerOnRenderCallback = () => undefined;

const AppOverlayRouteHost = () => {
  const activeOverlayRoute = useOverlayStore((state) => state.activeOverlayRoute);

  if (activeOverlayRoute.key === 'restaurant') {
    return (
      <React.Profiler id="AppOverlayRouteHost" onRender={NOOP_PROFILER_RENDER}>
        <RestaurantRouteLayerHost />
      </React.Profiler>
    );
  }

  return (
    <React.Profiler id="AppOverlayRouteHost" onRender={NOOP_PROFILER_RENDER}>
      <SearchRouteLayerHost />
    </React.Profiler>
  );
};

export default React.memo(AppOverlayRouteHost);
