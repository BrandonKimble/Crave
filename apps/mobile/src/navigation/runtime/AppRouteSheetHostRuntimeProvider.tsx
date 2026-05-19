import React from 'react';

import { createAppRouteSheetHostAuthorityController } from './app-route-sheet-host-authority-controller';
import { useBottomSheetRuntimeModel } from '../../overlays/useBottomSheetRuntime';
import type { AppRouteSheetHostRuntimeOwner } from './app-route-sheet-host-runtime-contract';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';
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
    const initialNativeAdapterSnapshotRef = React.useRef(
      routeSheetHostAuthorityRuntime.nativeAdapterAuthority.getSnapshot()
    );
    const fallbackSheetRuntimeModel = useBottomSheetRuntimeModel({
      initialSheetY: initialNativeAdapterSnapshotRef.current.initialSheetY,
    });
    const routeSheetFrameHostAuthority = useAppRouteSheetFrameHostAuthority({
      fallbackSheetY: fallbackSheetRuntimeModel.presentationState.sheetY,
      nativeAdapterAuthority: routeSheetHostAuthorityRuntime.nativeAdapterAuthority,
    });

    React.useLayoutEffect(() => {
      routeSheetHostAuthorityRuntime.setNativeRuntime({
        fallbackRuntimeModel: fallbackSheetRuntimeModel,
        routeSheetFrameHostAuthority,
      });
    }, [fallbackSheetRuntimeModel, routeSheetFrameHostAuthority, routeSheetHostAuthorityRuntime]);

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
        routeSceneMotionRuntime: routeSceneRuntime.routeSceneMotionRuntime,
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
      routeSceneRuntime.routeSceneMotionRuntime,
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
	      replayPersistentPollSheetHostContract:
	        routeSheetHostAuthorityRuntime.replayPersistentPollSheetHostContract,
	    }),
	    [
	      routeSceneRuntime.routeSceneDisplayTargetRegistry,
      routeSceneRuntime.routeHostVisualRuntimeAuthority,
      routeSceneRuntime.sceneStackSurfaceAuthority,
      routeSheetHostAuthorityRuntime.replayPersistentPollSheetHostContract,
      routeSheetHostAuthorityRuntime.routeSheetMotionRuntimeAuthority,
      routeSheetHostAuthorityRuntime.routeSheetSurfaceBodyAuthority,
      routeSheetHostAuthorityRuntime.routeSheetSurfaceFrameAuthority,
      routeSheetHostAuthorityRuntime.routeSheetRuntimeConfigAuthority,
      routeSheetHostAuthorityRuntime.routeSheetSurfaceAuthority,
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
