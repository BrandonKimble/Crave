import React, { useSyncExternalStore } from 'react';

import AppOverlayRouteHost from '../../overlays/AppOverlayRouteHost';
import {
  createAppRouteOverlayHostAuthorityController,
  type AppRouteOverlayHostAuthorityController,
} from './app-route-overlay-host-authority-controller';
import type { AppRouteOverlayHostPublicationLane } from './app-route-overlay-host-runtime-contract';
import { useAppRouteSceneRuntime } from './AppRouteSceneRuntimeProvider';

const AppRouteOverlayHostPublicationLaneContext =
  React.createContext<AppRouteOverlayHostPublicationLane | null>(null);

const AppRouteOverlayHostRuntimeBoundary = React.memo(function AppRouteOverlayHostRuntimeBoundary({
  controller,
}: {
  controller: AppRouteOverlayHostAuthorityController;
}) {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const authoritySurface = controller.authoritySurface;
  // F1362: subscribe on the publication VERSION, not the search-interaction ref
  // directly — the ref is unchanged when only `overlayLocalRestaurantSheetHostAuthority`
  // swaps, so a useSyncExternalStore keyed on the ref snapshot bails out and the host
  // renders a stale authority. The version bumps on every publish (ref OR authority),
  // so this boundary always re-renders and re-reads the ref fresh below.
  useSyncExternalStore(
    authoritySurface.subscribeOverlayHostPublicationVersion,
    authoritySurface.getOverlayHostPublicationVersionSnapshot,
    authoritySurface.getOverlayHostPublicationVersionSnapshot
  );
  const searchInteractionRef = authoritySurface.getSearchInteractionRefSnapshot();

  // R8 (2026-08-08): the merged routeSheetHostRuntime object died with the old
  // sheet subtree (its only consumer). The mount gate it used to carry stays:
  // the host still mounts only once the search interaction ref is published —
  // the same boot ordering the old merge enforced.
  if (searchInteractionRef == null) {
    return null;
  }

  return (
    <AppOverlayRouteHost
      overlayChromeHostAuthority={authoritySurface.overlayChromeHostAuthority}
      overlayGateHostAuthority={authoritySurface.overlayGateHostAuthority}
      overlayShellHostAuthority={authoritySurface.overlayShellHostAuthority}
      overlayLocalRestaurantSheetHostAuthority={
        authoritySurface.overlayLocalRestaurantSheetHostAuthority
      }
      routeSceneDisplayTargetRegistry={routeSceneRuntime.routeSceneDisplayTargetRegistry}
      routeSceneInputLane={routeSceneRuntime.sceneInputLane}
      routeOverlayTransitionActions={routeSceneRuntime.routeOverlayTransitionActions}
      routeSheetSnapSessionAuthority={routeSceneRuntime.routeSheetSnapSessionAuthority}
      routeSheetSnapSessionActions={routeSceneRuntime.routeSheetSnapSessionActions}
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
