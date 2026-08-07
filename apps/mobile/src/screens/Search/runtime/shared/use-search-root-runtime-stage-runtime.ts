import React from 'react';

import { useAppRouteSceneRuntime } from '../../../../navigation/runtime/AppRouteSceneRuntimeProvider';
import { usePublishAppRouteDynamicSceneInputRuntime } from '../../../../navigation/runtime/app-route-dynamic-scene-input-runtime-controller';
import { useAppRouteSceneCameraMotionTargetRuntime } from '../../../../navigation/runtime/use-app-route-scene-camera-motion-target-runtime';
import { useSearchRouteSearchSceneModelOwner } from './use-search-route-search-scene-model-owner';
import { useSearchRouteSearchSceneRouteInputOwner } from './use-search-route-search-scene-route-input-owner';
import { useSearchRouteSearchSceneBodyInputOwner } from './use-search-route-search-scene-body-input-owner';
import { useSearchRootSearchSceneListHydrationPublicationRuntime } from './use-search-root-search-scene-list-hydration-publication-runtime';
import { useSearchRootSearchSceneBusPublicationRuntime } from './use-search-root-search-scene-bus-publication-runtime';
import { useSearchRootAppRouteOverlayPublicationRuntime } from './use-search-root-app-route-overlay-publication-runtime';
import { useSearchRootRuntimeFoundationStageRuntime } from './use-search-root-runtime-foundation-stage-runtime';
import { useSearchRootRuntimeControlStageRuntime } from './use-search-root-runtime-control-stage-runtime';
import { useSearchRootRuntimeMapHostPublicationStageRuntime } from './use-search-root-runtime-map-host-publication-stage-runtime';
import { useSearchRootRuntimeOverlayFoundationAssemblyRuntime } from './use-search-root-runtime-overlay-foundation-assembly-runtime';
import { useSearchRootRouteRestaurantOverlayInteractionPublicationRuntime } from './use-search-root-route-restaurant-overlay-interaction-publication-runtime';
import { useSearchRootRouteRestaurantOverlayPolicyPublicationRuntime } from './use-search-root-route-restaurant-overlay-policy-publication-runtime';
import { useSearchRootRouteRestaurantOverlayPanelContentPublicationRuntime } from './use-search-root-route-restaurant-overlay-panel-content-publication-runtime';
import { useSearchRootRouteVisualHostPublicationRuntime } from './use-search-root-route-visual-host-publication-runtime';
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
  const routeSearchSceneModel = useSearchRouteSearchSceneModelOwner({
    sessionAssemblyRuntime,
    stateAssemblyRuntime,
    overlayFoundationAssemblyRuntime,
    visualAssemblyRuntime,
    routeSceneSwitchAuthority,
    controlAuthorityRuntime,
    profileControlRuntime,
    resultsControlRuntime,
    filterModalControlLane,
    readModelPolicyWriters: searchRouteResultsPolicyRuntime.readModelPolicyWriters,
  });

  useSearchRouteSearchSceneRouteInputOwner({
    routeSceneInputLane: routeSceneRuntime.sceneInputLane,
    routeSearchSceneModel,
  });

  useSearchRouteSearchSceneBodyInputOwner({
    routeSearchSceneModel,
  });

  useSearchRootSearchSceneListHydrationPublicationRuntime({
    activeTab:
      routeSearchSceneModel.routeSearchSceneDataRuntime.routeSearchSceneResultsRuntimeState
        .activeTab,
    resultsPresentationSurfaceAuthority:
      sessionAssemblyRuntime.sessionRuntime.sessionCoreLane.resultsPresentationSurfaceAuthority,
    routeSceneSwitchAuthority,
    searchInteractionRef:
      sessionAssemblyRuntime.sessionRuntime.sessionPrimitivesLane.primitives.searchInteractionRef,
    hydrationKeyRuntime:
      routeSearchSceneModel.routeSearchSceneDataRuntime.routeSearchSceneHydrationKeyRuntime,
    resultsReadModelSelectors:
      routeSearchSceneModel.routeSearchSceneReadModelRuntime
        .routeSearchSceneResultsReadModelSelectors,
  });
  useSearchRootSearchSceneBusPublicationRuntime({
    sessionCoreLane: sessionAssemblyRuntime.sessionRuntime.sessionCoreLane,
    filterModalControlLane,
    foregroundInteractionControlLane,
  });

  useSearchRootRouteVisualHostPublicationRuntime({
    routeVisualHostPublicationLane,
    rootOverlayFoundationRuntime: overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime,
    routeHostVisualRuntime: visualAssemblyRuntime.hostVisualRuntime.routeHostVisualRuntime,
  });
  useSearchRootRouteRestaurantOverlayPanelContentPublicationRuntime({
    routeRestaurantOverlayPanelContentPublicationLane,
    profilePresentationControlLane: profileControlRuntime.profilePresentationControlLane,
    stateFoundationLane: stateAssemblyRuntime.stateFoundationLane,
  });
  useSearchRootRouteRestaurantOverlayPolicyPublicationRuntime({
    routeRestaurantOverlayPolicyPublicationLane,
    resultsPresentationStateControlLane: resultsControlRuntime.resultsPresentationStateControlLane,
  });
  useSearchRootRouteRestaurantOverlayInteractionPublicationRuntime({
    routeRestaurantOverlayInteractionPublicationLane,
    profilePresentationControlLane: profileControlRuntime.profilePresentationControlLane,
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
