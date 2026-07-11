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
  createAppRouteSharedSheetPresentationRuntime,
  type AppRouteSharedSheetPresentationRuntime,
} from './app-route-shared-sheet-presentation-controller';
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
  routeSharedSheetPresentationRuntime: AppRouteSharedSheetPresentationRuntime;
  routePollsSceneRuntime: AppRoutePollsSceneRuntime;
  routeDynamicSceneInputAuthority: AppRouteDynamicSceneInputRuntimeAuthority;
  routeDynamicSceneInputActions: AppRouteDynamicSceneInputRuntimeActions;
  routeStaticSceneDescriptorRuntime: AppRouteStaticSceneDescriptorRuntime;
  routeOverlaySessionAuthority: AppRouteOverlaySessionAuthority;
  routeOverlaySessionActions: AppRouteOverlaySessionActions;
  routeSceneLayoutAuthority: RouteVisualRuntime['routeSceneLayoutAuthority'];
  routeHostOverlayGeometryAuthority: RouteVisualRuntime['routeHostOverlayGeometryAuthority'];
  routeSharedSheetVisualAuthority: RouteVisualRuntime['routeSharedSheetVisualAuthority'];
  routeHostVisualRuntimeAuthority: RouteVisualRuntime['routeHostVisualRuntimeAuthority'];
  routeSheetVisualAuthority: RouteVisualRuntime['routeSheetVisualAuthority'];
  syncRouteHostOverlayGeometryRuntime: RouteVisualRuntime['syncRouteHostOverlayGeometryRuntime'];
  publishRouteSharedSheetVisualBinding: RouteVisualRuntime['publishRouteSharedSheetVisualBinding'];
  syncRouteHostVisualRuntime: RouteVisualRuntime['syncRouteHostVisualRuntime'];
  sceneFrameAuthority: AppRouteSceneStackLayerFrameAuthority;
  sceneStackSurfaceAuthority: AppRouteSceneStackSurfaceAuthority;
  sceneInputLane: RouteShellSceneInputLane;
  dispose: () => void;
};

export const createAppRouteSceneRuntime = (): AppRouteSceneRuntime => {
  const routeSceneSheetMotionTargetRegistry = createAppRouteSceneSheetMotionTargetRegistry();
  const routeSceneVisibilityPolicyRuntime = createRouteSceneVisibilityPolicyController();
  // Created BEFORE the switch runtime: the snap-session's per-scene detent ledger feeds the
  // descriptor table's 'rememberedDetent' rule (true per-page memory) through the controller.
  const routeSheetSnapSessionRuntime = createAppRouteSheetSnapSessionRuntime();
  const routeSceneSwitchRuntime = createAppRouteSceneSwitchRuntime({
    sheetMotionTargetRegistry: routeSceneSheetMotionTargetRegistry,
    routeSceneVisibilityPolicyRuntime,
    resolveSceneRememberedSnap: (sceneKey) =>
      routeSheetSnapSessionRuntime.actions.getRouteSceneSwitchSceneSnap(sceneKey),
  });
  const routeOverlayRouteCommandRuntime = createAppOverlayRouteCommandRuntime({
    routeSceneSwitchRuntime,
  });
  const routeOverlayCommandController = createAppRouteOverlayCommandController({
    routeOverlayRouteCommandRuntime,
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
  const routeSearchCommandActions = createAppSearchRouteCommandActions({
    routeSceneSwitchAuthority: sceneSwitchAuthority,
    routeSceneSwitchActions: routeSceneSwitchRuntime,
    routeSheetSnapSessionActions: routeSheetSnapSessionRuntime.actions,
  });
  const routeSharedSheetPresentationRuntime = createAppRouteSharedSheetPresentationRuntime();
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
  // Created AFTER the foundation runtime: the motion dispatcher resolves the semantic target
  // scene's published shell snap points from the scene-descriptor authority and stamps them
  // onto each sheet motion command (atomic shell+target commit — the shared runtime config
  // still holds the OUTGOING scene's shell at dispatch time).
  const routeSceneMotionRuntime = createAppRouteSceneMotionRuntime({
    sheetMotionTargetRegistry: routeSceneSheetMotionTargetRegistry,
    routeSceneSwitchRuntime,
    resolveSceneShellSnapPoints: (sceneKey) =>
      routeSceneFoundationRuntime.sceneInputAuthority.getSceneInputSnapshot(sceneKey)?.shellSpec
        ?.snapPoints ?? null,
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
  });
  const routeOverlaySessionController = createAppRouteOverlaySessionStateController({
    routeOverlayIdentityAuthority: routeSceneFoundationRuntime.routeOverlayIdentityAuthority,
    routeOverlayRootAuthority: routeSceneFoundationRuntime.routeOverlayRootAuthority,
    routeScenePolicyAuthority: routeSceneFoundationRuntime.routeScenePolicyAuthority,
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
    routeSharedSheetPresentationRuntime,
    routePollsSceneRuntime,
    routeDynamicSceneInputAuthority: routeDynamicSceneInputRuntime.authority,
    routeDynamicSceneInputActions: routeDynamicSceneInputRuntime.actions,
    routeStaticSceneDescriptorRuntime,
    routeOverlaySessionAuthority: routeOverlaySessionController.authority,
    routeOverlaySessionActions: routeOverlaySessionController.actions,
    routeSceneLayoutAuthority: routeVisualRuntime.routeSceneLayoutAuthority,
    routeHostOverlayGeometryAuthority: routeVisualRuntime.routeHostOverlayGeometryAuthority,
    routeSharedSheetVisualAuthority: routeVisualRuntime.routeSharedSheetVisualAuthority,
    routeHostVisualRuntimeAuthority: routeVisualRuntime.routeHostVisualRuntimeAuthority,
    routeSheetVisualAuthority: routeVisualRuntime.routeSheetVisualAuthority,
    syncRouteHostOverlayGeometryRuntime: routeVisualRuntime.syncRouteHostOverlayGeometryRuntime,
    publishRouteSharedSheetVisualBinding: routeVisualRuntime.publishRouteSharedSheetVisualBinding,
    syncRouteHostVisualRuntime: routeVisualRuntime.syncRouteHostVisualRuntime,
    sceneFrameAuthority: routeSceneStackRuntime.sceneFrameAuthority,
    sceneStackSurfaceAuthority: routeSceneStackRuntime.sceneStackSurfaceAuthority,
    sceneInputLane: routeSceneFoundationRuntime.sceneInputLane,
    dispose: () => {
      routeSharedSheetPresentationRuntime.dispose();
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
