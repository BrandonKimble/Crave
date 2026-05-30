import React from 'react';

import { createSearchOverlayLocalRestaurantRouteGeometryFrameStateController } from '../controller/search-overlay-local-restaurant-route-geometry-frame-state-controller';
import { createSearchOverlayLocalRestaurantRouteMotionFrameStateController } from '../controller/search-overlay-local-restaurant-route-motion-frame-state-controller';
import { createSearchOverlayLocalRestaurantRouteSheetStateController } from '../controller/search-overlay-local-restaurant-route-sheet-state-controller';
import { createSearchOverlayLocalRestaurantRouteVisualStateController } from '../controller/search-overlay-local-restaurant-route-visual-state-controller';
import type { SearchRootOverlayLocalRestaurantRouteHostRuntime } from './search-root-overlay-local-restaurant-runtime-contract';
import type { SearchRootOverlayLocalRestaurantRouteHostRuntimeParams } from './search-root-overlay-local-restaurant-runtime-contract';

export const useSearchRootOverlayLocalRestaurantRouteHostRuntime = ({
  routeHostOverlayGeometryAuthority,
  routeSharedSheetVisualAuthority,
  routeHostVisualRuntimeAuthority,
}: SearchRootOverlayLocalRestaurantRouteHostRuntimeParams): SearchRootOverlayLocalRestaurantRouteHostRuntime => {
  const localRestaurantRouteGeometryFrameControllerRef = React.useRef(
    null as ReturnType<
      typeof createSearchOverlayLocalRestaurantRouteGeometryFrameStateController
    > | null
  );
  const localRestaurantRouteMotionFrameControllerRef = React.useRef(
    null as ReturnType<
      typeof createSearchOverlayLocalRestaurantRouteMotionFrameStateController
    > | null
  );
  const localRestaurantRouteSheetControllerRef = React.useRef(
    null as ReturnType<typeof createSearchOverlayLocalRestaurantRouteSheetStateController> | null
  );
  const localRestaurantRouteVisualControllerRef = React.useRef(
    null as ReturnType<typeof createSearchOverlayLocalRestaurantRouteVisualStateController> | null
  );

  if (localRestaurantRouteGeometryFrameControllerRef.current == null) {
    localRestaurantRouteGeometryFrameControllerRef.current =
      createSearchOverlayLocalRestaurantRouteGeometryFrameStateController({
        routeHostOverlayGeometryAuthority,
      });
  }
  if (localRestaurantRouteMotionFrameControllerRef.current == null) {
    localRestaurantRouteMotionFrameControllerRef.current =
      createSearchOverlayLocalRestaurantRouteMotionFrameStateController({
        routeHostVisualRuntimeAuthority,
      });
  }
  if (localRestaurantRouteSheetControllerRef.current == null) {
    localRestaurantRouteSheetControllerRef.current =
      createSearchOverlayLocalRestaurantRouteSheetStateController({
        routeSharedSheetVisualAuthority,
      });
  }
  if (localRestaurantRouteVisualControllerRef.current == null) {
    localRestaurantRouteVisualControllerRef.current =
      createSearchOverlayLocalRestaurantRouteVisualStateController({
        localRestaurantRouteGeometryFrameAuthority:
          localRestaurantRouteGeometryFrameControllerRef.current.outputAuthority,
        localRestaurantRouteMotionFrameAuthority:
          localRestaurantRouteMotionFrameControllerRef.current.outputAuthority,
        localRestaurantRouteSheetAuthority:
          localRestaurantRouteSheetControllerRef.current.outputAuthority,
      });
  }

  const localRestaurantRouteGeometryFrameController =
    localRestaurantRouteGeometryFrameControllerRef.current;
  const localRestaurantRouteMotionFrameController =
    localRestaurantRouteMotionFrameControllerRef.current;
  const localRestaurantRouteSheetController = localRestaurantRouteSheetControllerRef.current;
  const localRestaurantRouteVisualController = localRestaurantRouteVisualControllerRef.current;

  React.useEffect(
    () => () => {
      localRestaurantRouteVisualController.dispose();
      localRestaurantRouteMotionFrameController.dispose();
      localRestaurantRouteSheetController.dispose();
      localRestaurantRouteGeometryFrameController.dispose();
    },
    [
      localRestaurantRouteGeometryFrameController,
      localRestaurantRouteMotionFrameController,
      localRestaurantRouteSheetController,
      localRestaurantRouteVisualController,
    ]
  );

  return {
    localRestaurantRouteVisualAuthority: localRestaurantRouteVisualController.outputAuthority,
  };
};
