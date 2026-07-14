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

  // BAIL-OUT FIX (perf attribution 2026-07-12): this merge used to be an inline spread
  // minting a NEW routeSheetHostRuntime object on every boundary render — every host in
  // the 12-level overlay chain memo-compares this prop (or its inline children) by
  // identity, so one fresh object here cascaded a full-tree re-render (measured
  // 40-112ms/commit) on every surface publish during submit/dismiss choreography.
  const routeSheetHostRuntime = React.useMemo(
    () =>
      searchInteractionRef == null
        ? null
        : {
            ...routeSheetHostRuntimeOwner,
            searchInteractionRef,
          },
    [routeSheetHostRuntimeOwner, searchInteractionRef]
  );

  if (routeSheetHostRuntime == null) {
    return null;
  }

  return (
    <AppOverlayRouteHost
      overlayChromeHostAuthority={authoritySurface.overlayChromeHostAuthority}
      overlayGateHostAuthority={authoritySurface.overlayGateHostAuthority}
      overlayShellHostAuthority={authoritySurface.overlayShellHostAuthority}
      overlayGlobalRestaurantHostAuthority={routeSceneRuntime.routeGlobalRestaurantOverlayAuthority}
      overlayLocalRestaurantSheetHostAuthority={
        authoritySurface.overlayLocalRestaurantSheetHostAuthority
      }
      routeSceneDisplayTargetRegistry={routeSceneRuntime.routeSceneDisplayTargetRegistry}
      routeSceneInputLane={routeSceneRuntime.sceneInputLane}
      routeOverlayTransitionActions={routeSceneRuntime.routeOverlayTransitionActions}
      routeSheetSnapSessionAuthority={routeSceneRuntime.routeSheetSnapSessionAuthority}
      routeSheetSnapSessionActions={routeSceneRuntime.routeSheetSnapSessionActions}
      routeSheetHostRuntime={routeSheetHostRuntime}
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
