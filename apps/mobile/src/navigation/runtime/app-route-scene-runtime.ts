import {
  createAppRouteSceneFoundationRuntime,
  type RouteShellOverlayIdentityAuthority,
  type RouteShellOverlayNavigationAuthority,
  type RouteShellOverlayRootAuthority,
  type RouteShellOverlayDisplayAuthority,
  type RouteShellOverlayChromeModeAuthority,
  type RouteShellOverlayPollsVisibilityAuthority,
  type RouteShellOverlaySheetPolicyAuthority,
  type RouteShellOverlayVisibilityAuthority,
  type RouteShellSheetHostSurfaceAuthority,
  type RouteShellSceneActivityAuthority,
  type RouteShellSceneInteractivityAuthority,
  type RouteShellScenePayloadAuthority,
  type RouteShellSceneSwitchAuthority,
  type RouteShellSceneTransitionAuthority,
  type RouteShellSceneInputLane,
} from './app-route-scene-foundation-runtime';
import {
  createAppRouteSceneStackRuntime,
  type AppRouteSceneStackLayerFrameAuthority,
} from './app-route-scene-stack-runtime';
import {
  createAppRoutePollsSceneRuntime,
  type AppRoutePollsSceneRuntime,
} from './app-route-polls-scene-runtime';
import {
  createAppRouteDynamicSceneInputRuntimeController,
  type AppRouteDynamicSceneInputRuntimeActions,
  type AppRouteDynamicSceneInputRuntimeAuthority,
} from './app-route-dynamic-scene-input-runtime-controller';
import {
  createAppRouteStaticSceneDescriptorRuntime,
  type AppRouteStaticSceneDescriptorRuntime,
} from './app-route-static-scene-descriptor-controller';
import { createRouteVisualRuntime, type RouteVisualRuntime } from './route-visual-runtime';
import { createAppRouteOverlaySessionStateController } from './app-route-overlay-session-state-controller';
import {
  createAppRouteSceneMotionRuntime,
  type AppRouteSceneMotionRuntime,
} from './app-route-scene-motion-controller';
import {
  createAppRouteResultsSheetVisibilityRuntime,
  type AppRouteResultsSheetVisibilityRuntime,
} from './app-route-results-sheet-visibility-controller';
import {
  createAppRouteSceneSwitchRuntime,
  type AppRouteSceneSwitchRuntime,
  type RouteSceneSwitchTransitionActions,
} from './app-route-scene-switch-controller';
import {
  createAppOverlayRouteCommandRuntime,
  type AppOverlayRouteCommandRuntime,
} from './app-overlay-route-command-runtime';
import {
  createAppSearchRouteCommandActions,
  type AppSearchRouteCommandActions,
} from './app-search-route-command-runtime';
import { createRouteSceneTransitionFanoutController } from './app-route-scene-transition-fanout-controller';
import { createAppRouteSceneSheetMotionTargetRegistry } from './app-route-scene-sheet-motion-target-registry';
import {
  createAppRouteSceneDisplayTargetRegistry,
  type AppRouteSceneDisplayTargetRegistry,
} from './app-route-scene-display-target-registry';
import {
  createAppRouteOverlayCommandController,
  type AppRouteOverlayCommandActions,
  type AppRouteOverlayCommandAuthority,
  type AppRouteOverlayCommandControllerRuntime,
} from './app-route-overlay-command-controller';
import {
  createAppRouteGlobalRestaurantRouteController,
  type AppRouteGlobalRestaurantRouteActions,
  type AppRouteGlobalRestaurantRouteAuthority,
} from './app-route-global-restaurant-route-controller';
import {
  createAppRouteSheetSnapSessionRuntime,
  type AppRouteSheetSnapSessionActions,
  type AppRouteSheetSnapSessionAuthority,
  type AppRouteSheetSnapSessionRuntime,
} from './app-route-sheet-snap-session-runtime';
import type {
  AppRouteOverlaySessionActions,
  AppRouteOverlaySessionAuthority,
} from './app-route-overlay-session-contract';
import type { AppRouteSceneStackSurfaceAuthority } from './app-route-scene-stack-surface-contract';
import type { RouteScenePolicyAuthority } from './route-scene-policy-authority-contract';
import { createRouteSceneVisibilityPolicyController } from './route-scene-visibility-policy-controller';
import type { RouteSceneVisibilityPolicyRuntime } from './app-route-scene-visibility-policy-contract';

export type { AppRouteSceneStackSurfaceAuthority };
export type { AppRouteSceneStackLayerFrameAuthority as RouteSceneFrameAuthority } from './app-route-scene-stack-runtime';
export type {
  RouteShellOverlayNavigationAuthority,
  RouteShellOverlayIdentityAuthority,
  RouteShellOverlayRootAuthority,
  RouteShellOverlayPollsVisibilityAuthority,
  RouteShellOverlaySheetPolicyAuthority,
  RouteShellOverlayVisibilityAuthority,
  RouteShellSheetHostSurfaceAuthority,
  RouteShellSceneActivityAuthority,
  RouteShellSceneInteractivityAuthority,
  RouteShellSceneInputLane,
  RouteShellScenePayloadAuthority,
  RouteShellSceneSwitchAuthority,
  RouteShellSceneTransitionAuthority,
  RouteShellOverlayDisplayAuthority,
  RouteShellOverlayChromeModeAuthority,
} from './app-route-scene-foundation-runtime';

export type AppRouteSceneRuntime = {
  sceneTransitionAuthority: RouteShellSceneTransitionAuthority;
  sceneSwitchAuthority: RouteShellSceneSwitchAuthority;
  sceneActivityAuthority: RouteShellSceneActivityAuthority;
  scenePayloadAuthority: RouteShellScenePayloadAuthority;
  sceneInteractivityAuthority: RouteShellSceneInteractivityAuthority;
  routeOverlayNavigationAuthority: RouteShellOverlayNavigationAuthority;
  routeOverlayIdentityAuthority: RouteShellOverlayIdentityAuthority;
  routeOverlayRootAuthority: RouteShellOverlayRootAuthority;
  routeOverlayDisplayAuthority: RouteShellOverlayDisplayAuthority;
  routeOverlayPollsVisibilityAuthority: RouteShellOverlayPollsVisibilityAuthority;
  routeOverlayChromeModeAuthority: RouteShellOverlayChromeModeAuthority;
  routeOverlaySheetPolicyAuthority: RouteShellOverlaySheetPolicyAuthority;
  routeSheetHostSurfaceAuthority: RouteShellSheetHostSurfaceAuthority;
  routeSheetHostNavigationAuthority: RouteShellOverlayNavigationAuthority;
  routeSheetHostSheetPolicyAuthority: RouteShellOverlaySheetPolicyAuthority;
  routeOverlayVisibilityAuthority: RouteShellOverlayVisibilityAuthority;
  routeScenePolicyAuthority: RouteScenePolicyAuthority;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
  routeOverlayCommandAuthority: AppRouteOverlayCommandAuthority;
  routeOverlayCommandActions: AppRouteOverlayCommandActions;
  routeOverlayCommandController: AppRouteOverlayCommandControllerRuntime;
  routeGlobalRestaurantOverlayAuthority: AppRouteGlobalRestaurantRouteAuthority;
  routeGlobalRestaurantRouteActions: AppRouteGlobalRestaurantRouteActions;
  routeOverlayRouteCommandRuntime: AppOverlayRouteCommandRuntime;
  routeOverlayTransitionActions: RouteSceneSwitchTransitionActions;
  routeSheetSnapSessionAuthority: AppRouteSheetSnapSessionAuthority;
  routeSheetSnapSessionActions: AppRouteSheetSnapSessionActions;
  routeSheetSnapSessionRuntime: AppRouteSheetSnapSessionRuntime;
  routeSearchCommandActions: AppSearchRouteCommandActions;
  routeSceneSwitchRuntime: AppRouteSceneSwitchRuntime;
  routeSceneDisplayTargetRegistry: AppRouteSceneDisplayTargetRegistry;
  routeSceneMotionRuntime: AppRouteSceneMotionRuntime;
  routeResultsSheetVisibilityRuntime: AppRouteResultsSheetVisibilityRuntime;
  routePollsSceneRuntime: AppRoutePollsSceneRuntime;
  routeDynamicSceneInputAuthority: AppRouteDynamicSceneInputRuntimeAuthority;
  routeDynamicSceneInputActions: AppRouteDynamicSceneInputRuntimeActions;
  routeStaticSceneDescriptorRuntime: AppRouteStaticSceneDescriptorRuntime;
  routeOverlaySessionAuthority: AppRouteOverlaySessionAuthority;
  routeOverlaySessionActions: AppRouteOverlaySessionActions;
  routeSceneLayoutAuthority: RouteVisualRuntime['routeSceneLayoutAuthority'];
  routeHostOverlayGeometryAuthority: RouteVisualRuntime['routeHostOverlayGeometryAuthority'];
  routeResultsSheetVisualAuthority: RouteVisualRuntime['routeResultsSheetVisualAuthority'];
  routeHostVisualRuntimeAuthority: RouteVisualRuntime['routeHostVisualRuntimeAuthority'];
  routeSheetVisualAuthority: RouteVisualRuntime['routeSheetVisualAuthority'];
  syncRouteHostOverlayGeometryRuntime: RouteVisualRuntime['syncRouteHostOverlayGeometryRuntime'];
  publishRouteResultsSheetVisualBinding: RouteVisualRuntime['publishRouteResultsSheetVisualBinding'];
  syncRouteHostVisualRuntime: RouteVisualRuntime['syncRouteHostVisualRuntime'];
  sceneFrameAuthority: AppRouteSceneStackLayerFrameAuthority;
  sceneStackSurfaceAuthority: AppRouteSceneStackSurfaceAuthority;
  sceneInputLane: RouteShellSceneInputLane;
  dispose: () => void;
};

export const createAppRouteSceneRuntime = (): AppRouteSceneRuntime => {
  const routeSceneSheetMotionTargetRegistry = createAppRouteSceneSheetMotionTargetRegistry();
  const routeSceneVisibilityPolicyRuntime = createRouteSceneVisibilityPolicyController();
  const routeSceneSwitchRuntime = createAppRouteSceneSwitchRuntime({
    sheetMotionTargetRegistry: routeSceneSheetMotionTargetRegistry,
    routeSceneVisibilityPolicyRuntime,
  });
  const routeSheetSnapSessionRuntime = createAppRouteSheetSnapSessionRuntime();
  const routeOverlayCommandController = createAppRouteOverlayCommandController({
    routeSheetSnapSessionActions: routeSheetSnapSessionRuntime.actions,
  });
  const routeSceneTransitionFanoutController =
    createRouteSceneTransitionFanoutController(routeSceneSwitchRuntime);
  const {
    sceneActivityAuthority,
    sceneInteractivityAuthority,
    scenePayloadAuthority,
    sceneSwitchAuthority,
    sceneTransitionAuthority,
  } = routeSceneTransitionFanoutController.authorities;
  const routeOverlayRouteCommandRuntime = createAppOverlayRouteCommandRuntime({
    routeSceneSwitchRuntime,
  });
  const routeSearchCommandActions = createAppSearchRouteCommandActions({
    routeSceneSwitchAuthority: sceneSwitchAuthority,
    routeSceneSwitchActions: routeSceneSwitchRuntime,
  });
  const routeSceneMotionRuntime = createAppRouteSceneMotionRuntime({
    sheetMotionTargetRegistry: routeSceneSheetMotionTargetRegistry,
    routeSceneSwitchRuntime,
  });
  const routeResultsSheetVisibilityRuntime = createAppRouteResultsSheetVisibilityRuntime({
    routeSceneMotionRuntime,
  });
  const routeSceneFoundationRuntime = createAppRouteSceneFoundationRuntime({
    sceneActivityAuthority,
    sceneInteractivityAuthority,
    scenePayloadAuthority,
    sceneSwitchAuthority,
    sceneTransitionAuthority,
    routeSceneSwitchRuntime,
    routeSceneVisibilityPolicyRuntime,
    routeOverlayCommandAuthority: routeOverlayCommandController.authority,
    routeSheetSnapSessionAuthority: routeSheetSnapSessionRuntime.authority,
  });
  const routeGlobalRestaurantRouteController = createAppRouteGlobalRestaurantRouteController({
    routeOverlayNavigationAuthority: routeSceneFoundationRuntime.routeSheetHostNavigationAuthority,
    routeOverlayRouteCommandRuntime,
  });
  const routePollsSceneRuntime = createAppRoutePollsSceneRuntime();
  const routeDynamicSceneInputRuntime = createAppRouteDynamicSceneInputRuntimeController();
  const routeSceneStackRuntime = createAppRouteSceneStackRuntime({
    sceneInputAuthority: routeSceneFoundationRuntime.sceneInputAuthority,
    routeSceneSwitchRuntime,
    routeOverlayDisplayAuthority: routeSceneFoundationRuntime.routeOverlayDisplayAuthority,
  });
  const routeVisualRuntime = createRouteVisualRuntime({
    routeOverlayVisibilityAuthority: routeSceneFoundationRuntime.routeOverlayVisibilityAuthority,
  });
  const routeSceneDisplayTargetRegistry = createAppRouteSceneDisplayTargetRegistry(
    routeSceneFoundationRuntime.routeOverlayDisplayAuthority
  );
  const routeStaticSceneDescriptorRuntime = createAppRouteStaticSceneDescriptorRuntime({
    sceneInputLane: routeSceneFoundationRuntime.sceneInputLane,
    routeSceneLayoutAuthority: routeVisualRuntime.routeSceneLayoutAuthority,
    routeOverlayNavigationAuthority: routeSceneFoundationRuntime.routeOverlayNavigationAuthority,
    sceneSwitchAuthority: routeSceneFoundationRuntime.sceneSwitchAuthority,
    routeOverlayCommandActions: routeOverlayCommandController.actions,
    routeSearchCommandActions,
    routeSheetSnapSessionActions: routeSheetSnapSessionRuntime.actions,
  });
  const routeOverlaySessionController = createAppRouteOverlaySessionStateController({
    routeOverlayIdentityAuthority: routeSceneFoundationRuntime.routeOverlayIdentityAuthority,
    routeOverlayRootAuthority: routeSceneFoundationRuntime.routeOverlayRootAuthority,
    routeScenePolicyAuthority: routeSceneFoundationRuntime.routeScenePolicyAuthority,
    routeSceneVisibilityPolicyRuntime,
    routeSceneSwitchActions: routeSceneSwitchRuntime,
    routeSearchCommandActions,
    routeSheetSnapSessionAuthority: routeSheetSnapSessionRuntime.authority,
    routeSheetSnapSessionActions: routeSheetSnapSessionRuntime.actions,
  });

  return {
    sceneTransitionAuthority: routeSceneFoundationRuntime.sceneTransitionAuthority,
    sceneSwitchAuthority: routeSceneFoundationRuntime.sceneSwitchAuthority,
    sceneActivityAuthority: routeSceneFoundationRuntime.sceneActivityAuthority,
    scenePayloadAuthority: routeSceneFoundationRuntime.scenePayloadAuthority,
    sceneInteractivityAuthority: routeSceneFoundationRuntime.sceneInteractivityAuthority,
    routeOverlayNavigationAuthority: routeSceneFoundationRuntime.routeOverlayNavigationAuthority,
    routeOverlayIdentityAuthority: routeSceneFoundationRuntime.routeOverlayIdentityAuthority,
    routeOverlayRootAuthority: routeSceneFoundationRuntime.routeOverlayRootAuthority,
    routeOverlayDisplayAuthority: routeSceneFoundationRuntime.routeOverlayDisplayAuthority,
    routeOverlayPollsVisibilityAuthority:
      routeSceneFoundationRuntime.routeOverlayPollsVisibilityAuthority,
    routeOverlayChromeModeAuthority: routeSceneFoundationRuntime.routeOverlayChromeModeAuthority,
    routeOverlaySheetPolicyAuthority: routeSceneFoundationRuntime.routeOverlaySheetPolicyAuthority,
    routeSheetHostSurfaceAuthority: routeSceneFoundationRuntime.routeSheetHostSurfaceAuthority,
    routeSheetHostNavigationAuthority:
      routeSceneFoundationRuntime.routeSheetHostNavigationAuthority,
    routeSheetHostSheetPolicyAuthority:
      routeSceneFoundationRuntime.routeSheetHostSheetPolicyAuthority,
    routeOverlayVisibilityAuthority: routeSceneFoundationRuntime.routeOverlayVisibilityAuthority,
    routeScenePolicyAuthority: routeSceneFoundationRuntime.routeScenePolicyAuthority,
    routeSceneVisibilityPolicyRuntime,
    routeOverlayCommandAuthority: routeOverlayCommandController.authority,
    routeOverlayCommandActions: routeOverlayCommandController.actions,
    routeOverlayCommandController,
    routeGlobalRestaurantOverlayAuthority: routeGlobalRestaurantRouteController.authority,
    routeGlobalRestaurantRouteActions: routeGlobalRestaurantRouteController.actions,
    routeOverlayRouteCommandRuntime,
    routeOverlayTransitionActions: routeSceneSwitchRuntime,
    routeSheetSnapSessionAuthority: routeSheetSnapSessionRuntime.authority,
    routeSheetSnapSessionActions: routeSheetSnapSessionRuntime.actions,
    routeSheetSnapSessionRuntime,
    routeSearchCommandActions,
    routeSceneSwitchRuntime,
    routeSceneDisplayTargetRegistry,
    routeSceneMotionRuntime,
    routeResultsSheetVisibilityRuntime,
    routePollsSceneRuntime,
    routeDynamicSceneInputAuthority: routeDynamicSceneInputRuntime.authority,
    routeDynamicSceneInputActions: routeDynamicSceneInputRuntime.actions,
    routeStaticSceneDescriptorRuntime,
    routeOverlaySessionAuthority: routeOverlaySessionController.authority,
    routeOverlaySessionActions: routeOverlaySessionController.actions,
    routeSceneLayoutAuthority: routeVisualRuntime.routeSceneLayoutAuthority,
    routeHostOverlayGeometryAuthority: routeVisualRuntime.routeHostOverlayGeometryAuthority,
    routeResultsSheetVisualAuthority: routeVisualRuntime.routeResultsSheetVisualAuthority,
    routeHostVisualRuntimeAuthority: routeVisualRuntime.routeHostVisualRuntimeAuthority,
    routeSheetVisualAuthority: routeVisualRuntime.routeSheetVisualAuthority,
    syncRouteHostOverlayGeometryRuntime: routeVisualRuntime.syncRouteHostOverlayGeometryRuntime,
    publishRouteResultsSheetVisualBinding: routeVisualRuntime.publishRouteResultsSheetVisualBinding,
    syncRouteHostVisualRuntime: routeVisualRuntime.syncRouteHostVisualRuntime,
    sceneFrameAuthority: routeSceneStackRuntime.sceneFrameAuthority,
    sceneStackSurfaceAuthority: routeSceneStackRuntime.sceneStackSurfaceAuthority,
    sceneInputLane: routeSceneFoundationRuntime.sceneInputLane,
    dispose: () => {
      routeResultsSheetVisibilityRuntime.dispose();
      routeSceneDisplayTargetRegistry.dispose();
      routeSceneMotionRuntime.dispose();
      routeSceneTransitionFanoutController.dispose();
      routePollsSceneRuntime.dispose();
      routeDynamicSceneInputRuntime.dispose();
      routeStaticSceneDescriptorRuntime.dispose();
      routeGlobalRestaurantRouteController.dispose();
      routeOverlayCommandController.dispose();
      routeSheetSnapSessionRuntime.dispose();
      routeSceneSwitchRuntime.dispose();
      routeSceneSheetMotionTargetRegistry.dispose();
      routeOverlaySessionController.dispose();
      routeSceneVisibilityPolicyRuntime.dispose();
      routeVisualRuntime.dispose();
      routeSceneStackRuntime.dispose();
      routeSceneFoundationRuntime.dispose();
    },
  };
};
