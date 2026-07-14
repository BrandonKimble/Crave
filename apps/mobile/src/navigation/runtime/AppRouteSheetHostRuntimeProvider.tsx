import React from 'react';

import { createAppRouteSheetHostAuthorityController } from './app-route-sheet-host-authority-controller';
import type { AppRouteSheetHostRuntimeOwner } from './app-route-sheet-host-runtime-contract';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';
import { useAppRouteSharedSheetRuntimeOwner } from './AppRouteSharedSheetRuntimeProvider';
import { useAppRouteSheetFrameHostAuthority } from './use-app-route-sheet-frame-host-authority';

const AppRouteSheetHostRuntimeContext = React.createContext<AppRouteSheetHostRuntimeOwner | null>(
  null
);

export const useAppRouteSheetHostOwner = (): AppRouteSheetHostRuntimeOwner => {
  const runtimeOwner = React.useContext(AppRouteSheetHostRuntimeContext);
  if (runtimeOwner == null) {
    throw new Error(
      'useAppRouteSheetHostOwner must be used within AppRouteSheetHostRuntimeProvider'
    );
  }
  return runtimeOwner;
};

const AppRouteSheetHostNativeRuntimeBinder = React.memo(
  function AppRouteSheetHostNativeRuntimeBinder({
    routeSheetHostAuthorityRuntime,
  }: {
    routeSheetHostAuthorityRuntime: ReturnType<typeof createAppRouteSheetHostAuthorityController>;
  }) {
    const sharedSheetRuntimeOwner = useAppRouteSharedSheetRuntimeOwner();
    const sharedSheetRuntimeModel = sharedSheetRuntimeOwner.sharedSheetRuntimeModel;
    const routeSheetFrameHostAuthority = useAppRouteSheetFrameHostAuthority({
      nativeAdapterAuthority: routeSheetHostAuthorityRuntime.nativeAdapterAuthority,
    });

    React.useLayoutEffect(() => {
      routeSheetHostAuthorityRuntime.setNativeRuntime({
        sharedRuntimeModel: sharedSheetRuntimeModel,
        routeSheetFrameHostAuthority,
      });
    }, [sharedSheetRuntimeModel, routeSheetFrameHostAuthority, routeSheetHostAuthorityRuntime]);

    return null;
  }
);

export const AppRouteSheetHostRuntimeProvider = ({
  children,
  routeSceneRuntime,
}: React.PropsWithChildren<{
  routeSceneRuntime: AppRouteSceneRuntime;
}>) => {
  const routeSheetHostAuthorityRuntime = React.useMemo(
    () =>
      createAppRouteSheetHostAuthorityController({
        routeSceneFrameAuthority: routeSceneRuntime.sceneFrameAuthority,
        routeSheetHostSurfaceAuthority: routeSceneRuntime.routeSheetHostSurfaceAuthority,
        routeOverlayNavigationAuthority: routeSceneRuntime.routeSheetHostNavigationAuthority,
        routeOverlaySheetPolicyAuthority: routeSceneRuntime.routeSheetHostSheetPolicyAuthority,
        routeSheetVisualAuthority: routeSceneRuntime.routeSheetVisualAuthority,
        routeSceneSwitchAuthority: routeSceneRuntime.sceneSwitchAuthority,
        routeSceneInteractivityAuthority: routeSceneRuntime.sceneInteractivityAuthority,
        routeSceneTransitionAuthority: routeSceneRuntime.sceneTransitionAuthority,
        routeSceneMotionRuntime: routeSceneRuntime.routeSceneMotionRuntime,
        routeSceneSwitchActions: routeSceneRuntime.routeOverlayTransitionActions,
        routeSharedSheetPresentationRuntime: routeSceneRuntime.routeSharedSheetPresentationRuntime,
        routeSheetSnapSessionAuthority: routeSceneRuntime.routeSheetSnapSessionAuthority,
        routeSheetSnapSessionActions: routeSceneRuntime.routeSheetSnapSessionActions,
      }),
    [
      routeSceneRuntime.sceneFrameAuthority,
      routeSceneRuntime.routeSheetHostSurfaceAuthority,
      routeSceneRuntime.routeSheetHostNavigationAuthority,
      routeSceneRuntime.routeSheetHostSheetPolicyAuthority,
      routeSceneRuntime.routeSheetVisualAuthority,
      routeSceneRuntime.sceneSwitchAuthority,
      routeSceneRuntime.sceneInteractivityAuthority,
      routeSceneRuntime.sceneTransitionAuthority,
      routeSceneRuntime.routeSceneMotionRuntime,
      routeSceneRuntime.routeOverlayTransitionActions,
      routeSceneRuntime.routeSharedSheetPresentationRuntime,
      routeSceneRuntime.routeSheetSnapSessionAuthority,
      routeSceneRuntime.routeSheetSnapSessionActions,
    ]
  );

  React.useEffect(
    () => () => {
      routeSheetHostAuthorityRuntime.dispose();
    },
    [routeSheetHostAuthorityRuntime]
  );

  // Stable render-side completer for the overlap 'content' settle plane. Bound here (where the
  // motion runtime is available) and threaded down to the scene-stack crossfade ramp so the
  // 'content' plane settles at ramp-end instead of waiting on the controller fallback timeout.
  const routeSceneMotionRuntime = routeSceneRuntime.routeSceneMotionRuntime;
  const handleContentSettleComplete = React.useCallback(
    (token: number) => {
      routeSceneMotionRuntime.completeFromContentSettle(token);
    },
    [routeSceneMotionRuntime]
  );

  const runtimeOwner = React.useMemo<AppRouteSheetHostRuntimeOwner>(
    () => ({
      routeSheetSurfaceAuthority: routeSheetHostAuthorityRuntime.routeSheetSurfaceAuthority,
      routeSheetSurfaceBodyAuthority: routeSheetHostAuthorityRuntime.routeSheetSurfaceBodyAuthority,
      routeSheetMotionRuntimeAuthority:
        routeSheetHostAuthorityRuntime.routeSheetMotionRuntimeAuthority,
      routeSheetSurfaceFrameAuthority:
        routeSheetHostAuthorityRuntime.routeSheetSurfaceFrameAuthority,
      routeSheetRuntimeConfigAuthority:
        routeSheetHostAuthorityRuntime.routeSheetRuntimeConfigAuthority,
      sceneStackSurfaceAuthority: routeSceneRuntime.sceneStackSurfaceAuthority,
      routeSceneDisplayTargetRegistry: routeSceneRuntime.routeSceneDisplayTargetRegistry,
      routeHostVisualRuntimeAuthority: routeSceneRuntime.routeHostVisualRuntimeAuthority,
      onContentSettleComplete: handleContentSettleComplete,
    }),
    [
      routeSceneRuntime.routeSceneDisplayTargetRegistry,
      routeSceneRuntime.routeHostVisualRuntimeAuthority,
      routeSceneRuntime.sceneStackSurfaceAuthority,
      routeSheetHostAuthorityRuntime.routeSheetMotionRuntimeAuthority,
      routeSheetHostAuthorityRuntime.routeSheetSurfaceBodyAuthority,
      routeSheetHostAuthorityRuntime.routeSheetSurfaceFrameAuthority,
      routeSheetHostAuthorityRuntime.routeSheetRuntimeConfigAuthority,
      routeSheetHostAuthorityRuntime.routeSheetSurfaceAuthority,
      handleContentSettleComplete,
    ]
  );

  return (
    <AppRouteSheetHostRuntimeContext.Provider value={runtimeOwner}>
      <AppRouteSheetHostNativeRuntimeBinder
        routeSheetHostAuthorityRuntime={routeSheetHostAuthorityRuntime}
      />
      {children}
    </AppRouteSheetHostRuntimeContext.Provider>
  );
};
