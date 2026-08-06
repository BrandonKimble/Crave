import React from 'react';

import { useAppRouteSceneRuntime } from '../../../../navigation/runtime/AppRouteSceneRuntimeProvider';
import { usePublishAppRouteDynamicSceneInputRuntime } from '../../../../navigation/runtime/app-route-dynamic-scene-input-runtime-controller';
import { useAppRouteSceneCameraMotionTargetRuntime } from '../../../../navigation/runtime/use-app-route-scene-camera-motion-target-runtime';
import { useSearchRouteSceneDefinitionOwner } from './use-search-route-scene-definition-owner';
import { useSearchRootAppRouteOverlayPublicationRuntime } from './use-search-root-app-route-overlay-publication-runtime';
import { useSearchRootRuntimeFoundationStageRuntime } from './use-search-root-runtime-foundation-stage-runtime';
import { useSearchRootRuntimeControlStageRuntime } from './use-search-root-runtime-control-stage-runtime';
import { useSearchRootRuntimeMapHostPublicationStageRuntime } from './use-search-root-runtime-map-host-publication-stage-runtime';
import { useSearchRootRuntimeOverlayFoundationAssemblyRuntime } from './use-search-root-runtime-overlay-foundation-assembly-runtime';
import { useSearchRootRouteAncillaryPublicationRuntime } from './use-search-root-route-ancillary-publication-runtime';
import { useSearchRootRouteControlRuntime } from './use-search-root-route-control-runtime';
import { useSearchRootRouteOverlayHostPublicationLanesRuntime } from './use-search-root-route-overlay-host-publication-lanes-runtime';
import { selectSearchRootRouteSurfaceHostRuntime } from './select-search-root-route-surface-host-runtime';
import { useSearchRootRuntimeVisualStageRuntime } from './use-search-root-runtime-visual-stage-runtime';
import { useSearchRouteResultsPolicyDomainRuntime } from './use-search-route-results-policy-domain-runtime';
import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';
import type { SearchRootRuntimeStageRuntime } from './search-root-runtime-stage-contract';

export const useSearchRootRuntimeStageRuntime = ({
  appEntryPlaneRuntime,
}: {
  appEntryPlaneRuntime: ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>;
}): SearchRootRuntimeStageRuntime => {
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const searchRouteResultsPolicyRuntime = useSearchRouteResultsPolicyDomainRuntime({
    routeSceneRuntime,
  });
  const { sessionAssemblyRuntime, stateAssemblyRuntime, searchRuntimeBus } =
    useSearchRootRuntimeFoundationStageRuntime({
      appEntryPlaneRuntime,
      searchRuntimeBus: searchRouteResultsPolicyRuntime.searchRuntimeBus,
      resultsPresentationAuthority: searchRouteResultsPolicyRuntime.resultsPresentationAuthority,
      resultsPresentationSurfaceAuthority:
        searchRouteResultsPolicyRuntime.resultsPresentationSurfaceAuthority,
      searchMapSourceFramePort: searchRouteResultsPolicyRuntime.searchMapSourceFramePort,
      primitiveUiStateController: searchRouteResultsPolicyRuntime.primitiveUiStateController,
      suggestionPanelStateController:
        searchRouteResultsPolicyRuntime.suggestionPanelStateController,
      foregroundPolicyPublicationAuthority:
        searchRouteResultsPolicyRuntime.foregroundPolicyPublicationAuthority,
    });
  const { routeRestaurantOverlayRuntime, routeSceneSwitchAuthority } =
    useSearchRootRouteControlRuntime({
      routeSceneRuntime,
    });
  const routeSurfaceHostRuntime = selectSearchRootRouteSurfaceHostRuntime({
    routeSceneRuntime,
    routeRestaurantOverlayRuntime,
  });
  const { routeOverlayVisibilityAuthority } = routeSurfaceHostRuntime;
  const routeOverlayHostPublicationLanesRuntime =
    useSearchRootRouteOverlayHostPublicationLanesRuntime({
      routeSceneRuntime,
      routeRestaurantOverlayRuntime,
    });
  const overlayFoundationAssemblyRuntime = useSearchRootRuntimeOverlayFoundationAssemblyRuntime({
    appEntryPlaneRuntime,
    sessionAssemblyRuntime,
    stateAssemblyRuntime,
    routeSceneRuntime,
    routeOverlayIdentityAuthority: routeSceneRuntime.routeOverlayIdentityAuthority,
    routeOverlayVisibilityAuthority,
  });
  const controlStageRuntime = useSearchRootRuntimeControlStageRuntime({
    appEntryPlaneRuntime,
    sessionAssemblyRuntime,
    stateAssemblyRuntime,
    overlayFoundationAssemblyRuntime,
    foregroundPolicyPublicationAuthority:
      searchRouteResultsPolicyRuntime.foregroundPolicyPublicationAuthority,
  });
  const {
    controlAuthorityRuntime,
    profileControlRuntime,
    viewportShortcutControlLane,
    filterModalControlLane,
    resultsControlRuntime,
    foregroundInteractionControlLane,
    foregroundInputControlLane,
  } = controlStageRuntime;
  const { visualAssemblyRuntime } = useSearchRootRuntimeVisualStageRuntime({
    appEntryPlaneRuntime,
    stateAssemblyRuntime,
    overlayFoundationAssemblyRuntime,
    controlAuthorityRuntime,
    resultsControlRuntime,
    viewportShortcutControlLane,
  });
  const appRouteSceneCameraMotionTargetPorts = React.useMemo(
    () => ({
      ...sessionAssemblyRuntime.sessionRuntime.sessionPrimitivesLane
        .appRouteSceneCameraMotionTargetPorts,
      onCameraIntentWillCommit: () => {
        stateAssemblyRuntime.stateFoundationLane.rootPrimitivesRuntime.mapState.setIsFollowingUser(
          false
        );
        stateAssemblyRuntime.stateFoundationLane.rootPrimitivesRuntime.mapState.suppressMapMoved();
      },
    }),
    [
      sessionAssemblyRuntime.sessionRuntime.sessionPrimitivesLane
        .appRouteSceneCameraMotionTargetPorts,
      stateAssemblyRuntime.stateFoundationLane.rootPrimitivesRuntime.mapState,
    ]
  );
  useAppRouteSceneCameraMotionTargetRuntime(appRouteSceneCameraMotionTargetPorts);
  const {
    routeLocalRestaurantOverlaySessionAuthority,
    routeLocalRestaurantOverlayPanelContentAuthority,
    routeLocalRestaurantOverlayPolicyAuthority,
    routeLocalRestaurantOverlayInteractionAuthority,
    routeHostOverlayGeometryAuthority,
    routeSharedSheetVisualAuthority,
    routeHostVisualRuntimeAuthority,
  } = routeSurfaceHostRuntime;
  const {
    routeRestaurantOverlayPanelContentPublicationLane,
    routeRestaurantOverlayPolicyPublicationLane,
    routeRestaurantOverlayInteractionPublicationLane,
    routeVisualHostPublicationLane,
  } = routeOverlayHostPublicationLanesRuntime;
  useSearchRootAppRouteOverlayPublicationRuntime({
    appEntryPlaneRuntime,
    stateFoundationLane: stateAssemblyRuntime.stateFoundationLane,
    rootOverlayFoundationRuntime: overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime,
    routeOverlayVisibilityAuthority,
    routeLocalRestaurantOverlaySessionAuthority,
    routeLocalRestaurantOverlayPanelContentAuthority,
    routeLocalRestaurantOverlayPolicyAuthority,
    routeLocalRestaurantOverlayInteractionAuthority,
    routeHostOverlayGeometryAuthority,
    routeSharedSheetVisualAuthority,
    routeHostVisualRuntimeAuthority,
    overlayHostVisualRuntime: visualAssemblyRuntime.hostVisualRuntime.overlayHostVisualRuntime,
    overlaySceneHostVisualRuntime:
      visualAssemblyRuntime.hostVisualRuntime.overlaySceneHostVisualRuntime,
    foregroundInteractionControlLane,
    foregroundInputControlLane,
    filterModalControlLane,
    profileControlRuntime,
    controlAuthorityRuntime,
    searchInteractionRef:
      sessionAssemblyRuntime.sessionRuntime.sessionPrimitivesLane.primitives.searchInteractionRef,
  });
  const mapRenderHostAuthority = useSearchRootRuntimeMapHostPublicationStageRuntime({
    appEntryPlaneRuntime,
    sessionAssemblyRuntime,
    stateAssemblyRuntime,
    overlayFoundationAssemblyRuntime,
    controlAuthorityRuntime,
    profileControlRuntime,
  });
  useSearchRouteSceneDefinitionOwner({
    sessionAssemblyRuntime,
    stateAssemblyRuntime,
    overlayFoundationAssemblyRuntime,
    visualAssemblyRuntime,
    routeSceneSwitchAuthority,
    routeSceneInputLane: routeSceneRuntime.sceneInputLane,
    controlAuthorityRuntime,
    profileControlRuntime,
    resultsControlRuntime,
    filterModalControlLane,
    foregroundInteractionControlLane,
    searchRouteResultsPolicyRuntime,
  });

  useSearchRootRouteAncillaryPublicationRuntime({
    sessionAssemblyRuntime,
    stateAssemblyRuntime,
    overlayFoundationAssemblyRuntime,
    routeVisualHostPublicationLane,
    routeRestaurantOverlayPanelContentPublicationLane,
    routeRestaurantOverlayPolicyPublicationLane,
    routeRestaurantOverlayInteractionPublicationLane,
    profileControlRuntime,
    resultsControlRuntime,
    visualAssemblyRuntime,
  });
  const routeDynamicSceneInputRuntime = React.useMemo(
    () => ({
      searchInteractionRef:
        sessionAssemblyRuntime.sessionRuntime.sessionPrimitivesLane.primitives.searchInteractionRef,
    }),
    [sessionAssemblyRuntime.sessionRuntime.sessionPrimitivesLane.primitives.searchInteractionRef]
  );
  usePublishAppRouteDynamicSceneInputRuntime({
    routeSceneRuntime,
    runtime: routeDynamicSceneInputRuntime,
  });

  return {
    searchRuntimeBus,
    resultsPresentationAuthority: searchRouteResultsPolicyRuntime.resultsPresentationAuthority,
    resultsPresentationSurfaceAuthority:
      searchRouteResultsPolicyRuntime.resultsPresentationSurfaceAuthority,
    searchMapSourceFramePort: searchRouteResultsPolicyRuntime.searchMapSourceFramePort,
    mapRenderHostAuthority,
    onProfilerRender:
      overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.rootInstrumentationRuntime
        .handleProfilerRender,
  };
};
