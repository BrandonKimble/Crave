import React, { useSyncExternalStore } from 'react';

import AppOverlayRouteHost from '../../overlays/AppOverlayRouteHost';
import {
  createAppRouteOverlayHostAuthorityController,
  type AppRouteOverlayHostAuthorityController,
} from './app-route-overlay-host-authority-controller';
import type { AppRouteOverlayHostPublicationLane } from './app-route-overlay-host-runtime-contract';
import { useAppRouteSheetHostOwner } from './AppRouteSheetHostRuntimeProvider';
import { useAppRouteSceneRuntime } from './AppRouteSceneRuntimeProvider';

const AppRouteOverlayHostPublicationLaneContext =
  React.createContext<AppRouteOverlayHostPublicationLane | null>(null);

const AppRouteOverlayHostRuntimeBoundary = React.memo(function AppRouteOverlayHostRuntimeBoundary({
  controller,
}: {
  controller: AppRouteOverlayHostAuthorityController;
}) {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const routeSheetHostRuntimeOwner = useAppRouteSheetHostOwner();
  const authoritySurface = controller.authoritySurface;
  const searchInteractionRef = useSyncExternalStore(
    authoritySurface.subscribeSearchInteractionRef,
    authoritySurface.getSearchInteractionRefSnapshot,
    authoritySurface.getSearchInteractionRefSnapshot
  );

  if (searchInteractionRef == null) {
    return null;
  }

  return (
    <AppOverlayRouteHost
      overlayChromeFrameHostAuthority={authoritySurface.overlayChromeFrameHostAuthority}
      overlayChromeContainerHostAuthority={authoritySurface.overlayChromeContainerHostAuthority}
      overlayChromeHeaderHostAuthority={authoritySurface.overlayChromeHeaderHostAuthority}
      overlayChromeSuggestionSurfaceHostAuthority={
        authoritySurface.overlayChromeSuggestionSurfaceHostAuthority
      }
      overlayGateHostAuthority={authoritySurface.overlayGateHostAuthority}
      overlayShellHostAuthority={authoritySurface.overlayShellHostAuthority}
      overlayGlobalRestaurantHostAuthority={routeSceneRuntime.routeGlobalRestaurantOverlayAuthority}
      overlayLocalRestaurantSheetHostAuthority={
        authoritySurface.overlayLocalRestaurantSheetHostAuthority
      }
      routeSceneDisplayTargetRegistry={routeSceneRuntime.routeSceneDisplayTargetRegistry}
      routeOverlayTransitionActions={routeSceneRuntime.routeOverlayTransitionActions}
      routeSheetHostRuntime={{
        ...routeSheetHostRuntimeOwner,
        searchInteractionRef,
      }}
    />
  );
});

export const AppRouteOverlayHostRuntimeProvider = React.memo(
  function AppRouteOverlayHostRuntimeProvider({ children }: React.PropsWithChildren) {
    const controllerRef = React.useRef<AppRouteOverlayHostAuthorityController | null>(null);

    if (controllerRef.current == null) {
      controllerRef.current = createAppRouteOverlayHostAuthorityController();
    }

    const controller = controllerRef.current;

    React.useEffect(
      () => () => {
        controller.dispose();
      },
      [controller]
    );

    return (
      <AppRouteOverlayHostPublicationLaneContext.Provider value={controller.publicationLane}>
        {children}
        <AppRouteOverlayHostRuntimeBoundary controller={controller} />
      </AppRouteOverlayHostPublicationLaneContext.Provider>
    );
  }
);

export const useAppRouteOverlayHostPublicationLane = (): AppRouteOverlayHostPublicationLane => {
  const publicationLane = React.useContext(AppRouteOverlayHostPublicationLaneContext);

  if (publicationLane == null) {
    throw new Error(
      'useAppRouteOverlayHostPublicationLane must be used inside AppRouteOverlayHostRuntimeProvider'
    );
  }

  return publicationLane;
};
