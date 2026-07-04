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
import { useSearchRootRouteSurfaceHostRuntime } from './use-search-root-route-surface-host-runtime';
import { useSearchRootRuntimeVisualStageRuntime } from './use-search-root-runtime-visual-stage-runtime';
import { createSearchChromeScalarSurfaceRuntime } from '../native/search-chrome-scalar-surface-runtime';
import { useSearchChromeScalarSurfaceRuntimeBusPrimitiveSourceRuntime } from '../native/use-search-chrome-scalar-surface-runtime-bus-primitive-source-runtime';
import { useSearchRouteResultsPolicyDomainRuntime } from './use-search-route-results-policy-domain-runtime';
import type { useSearchScreenAppEntryPlaneRuntime } from './use-search-screen-app-entry-plane-runtime';
import type { SearchRootRuntimeStageRuntime } from './search-root-runtime-stage-contract';

export const useSearchRootRuntimeStageRuntime = ({
  appEntryPlaneRuntime,
}: {
  appEntryPlaneRuntime: ReturnType<typeof useSearchScreenAppEntryPlaneRuntime>;
}): SearchRootRuntimeStageRuntime => {
  const searchChromeScalarSurfaceRuntime = React.useMemo(
    () => createSearchChromeScalarSurfaceRuntime(),
    []
  );
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const searchRouteResultsPolicyRuntime = useSearchRouteResultsPolicyDomainRuntime({
    routeSceneRuntime,
  });
  const { sessionAssemblyRuntime, stateAssemblyRuntime, searchRuntimeBus } =
    useSearchRootRuntimeFoundationStageRuntime({
      appEntryPlaneRuntime,
      searchChromeScalarSurfaceRuntime,
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
  useSearchChromeScalarSurfaceRuntimeBusPrimitiveSourceRuntime({
    primitiveSourceRuntime: searchChromeScalarSurfaceRuntime.primitiveSourceRuntime,
    searchRuntimeBus,
  });
  React.useEffect(
    () =>
      stateAssemblyRuntime.stateFoundationLane.rootPrimitivesRuntime.searchState.setSearchChromeScalarPrimitiveTarget(
        searchChromeScalarSurfaceRuntime.primitiveSourceRuntime
      ),
    [
      searchChromeScalarSurfaceRuntime.primitiveSourceRuntime,
      stateAssemblyRuntime.stateFoundationLane.rootPrimitivesRuntime.searchState,
    ]
  );
  const { routeRestaurantOverlayRuntime, routeSceneSwitchAuthority } =
    useSearchRootRouteControlRuntime({
      routeSceneRuntime,
    });
  const routeSurfaceHostRuntime = useSearchRootRouteSurfaceHostRuntime({
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
    searchChromeScalarSurfaceRuntime,
  });
  const controlStageRuntime = useSearchRootRuntimeControlStageRuntime({
    appEntryPlaneRuntime,
    sessionAssemblyRuntime,
    stateAssemblyRuntime,
    overlayFoundationAssemblyRuntime,
    resultsSurfacePolicyController: searchRouteResultsPolicyRuntime.surfacePolicyController,
    foregroundPolicyPublicationAuthority:
      searchRouteResultsPolicyRuntime.foregroundPolicyPublicationAuthority,
    searchChromeScalarSurfaceRuntime,
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
    searchChromeScalarSurfaceRuntime,
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
      pollBounds:
        overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.rootSharedSheetRuntimeLane
          .pollBounds,
      startupPollsSnapshot: appEntryPlaneRuntime.startupPollsSnapshot,
      userLocation: appEntryPlaneRuntime.userLocation,
      searchInteractionRef:
        sessionAssemblyRuntime.sessionRuntime.sessionPrimitivesLane.primitives.searchInteractionRef,
    }),
    [
      appEntryPlaneRuntime.startupPollsSnapshot,
      appEntryPlaneRuntime.userLocation,
      overlayFoundationAssemblyRuntime.rootOverlayFoundationRuntime.rootSharedSheetRuntimeLane
        .pollBounds,
      sessionAssemblyRuntime.sessionRuntime.sessionPrimitivesLane.primitives.searchInteractionRef,
    ]
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
