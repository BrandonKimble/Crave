import { createAppRouteNativeOverlayTargetAuthorities } from './app-route-native-overlay-target-authorities';
import type { RouteSceneSwitchAuthority } from './route-scene-switch-snapshot-contract';
import {
  createRouteSceneRegistryRuntime,
  type RouteShellSceneInputLane,
} from './route-scene-registry-runtime';
import type {
  AppRouteSceneActivityAuthority,
  AppRouteSceneInteractivityAuthority,
  AppRouteScenePayloadAuthority,
} from './app-route-scene-switch-authority';
import type { AppRouteSceneInputAuthority } from './app-route-scene-input-registry';
import type {
  RouteOverlayIdentitySnapshot,
  RouteOverlayNavigationSnapshot,
} from './route-overlay-navigation-snapshot-contract';
import type {
  RouteOverlayDisplaySnapshot,
  RouteOverlayChromeModeSnapshot,
  RouteOverlayPollsVisibilitySnapshot,
  RouteOverlayRootSnapshot,
} from './route-overlay-display-snapshot-contract';
import type { RouteOverlaySheetPolicySnapshot } from './route-overlay-sheet-policy-snapshot-contract';
import type { RouteOverlayVisibilitySnapshot } from './route-overlay-visibility-snapshot-contract';
import type { AppRouteSheetHostSurfaceSnapshot } from './app-route-sheet-host-surface-runtime-contract';
import type { RouteScenePolicyAuthority } from './route-scene-policy-authority-contract';
import type { RouteSceneTransitionSnapshot } from './route-scene-transition-snapshot-contract';
import type { RouteOverlayDisplaySharedValueTargets } from './route-overlay-display-shared-values';
import type { RouteOverlayChromeSnapSharedValueTargets } from './route-overlay-chrome-snap-targets';
import type { AppRouteSceneSwitchRuntime } from './app-route-scene-switch-controller';
import type { RouteSceneVisibilityPolicyRuntime } from './app-route-scene-visibility-policy-contract';
import type { AppRouteOverlayCommandAuthority } from './app-route-overlay-command-controller';
import type { AppRouteSheetSnapSessionAuthority } from './app-route-sheet-snap-session-runtime';

export type RouteShellSceneTransitionAuthority = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => RouteSceneTransitionSnapshot;
};

export type RouteShellSceneSwitchAuthority = RouteSceneSwitchAuthority;

export type RouteShellSceneActivityAuthority = AppRouteSceneActivityAuthority;

export type RouteShellScenePayloadAuthority = AppRouteScenePayloadAuthority;

export type RouteShellSceneInteractivityAuthority = AppRouteSceneInteractivityAuthority;

export type RouteShellOverlayNavigationAuthority = {
  getSnapshot: () => RouteOverlayNavigationSnapshot;
  registerTarget: <TSelected>(target: {
    selector: (snapshot: RouteOverlayNavigationSnapshot) => TSelected;
    syncNavigationSnapshot: (snapshot: RouteOverlayNavigationSnapshot, selected: TSelected) => void;
    isEqual?: (left: TSelected, right: TSelected) => boolean;
    attributionLabel: string;
  }) => () => void;
};

export type RouteShellOverlayIdentityAuthority = {
  getSnapshot: () => RouteOverlayIdentitySnapshot;
  registerTarget: (target: {
    syncIdentitySnapshot: (snapshot: RouteOverlayIdentitySnapshot) => void;
    attributionLabel: string;
  }) => () => void;
};

export type RouteShellOverlayRootAuthority = {
  getSnapshot: () => RouteOverlayRootSnapshot;
  registerTarget: (target: {
    syncRootSnapshot: (snapshot: RouteOverlayRootSnapshot) => void;
    attributionLabel: string;
  }) => () => void;
};

export type RouteShellOverlayDisplayAuthority = {
  getSnapshot: () => RouteOverlayDisplaySnapshot;
  registerSharedValues: (values: RouteOverlayDisplaySharedValueTargets) => () => void;
};

export type RouteShellOverlayPollsVisibilityAuthority = {
  getSnapshot: () => RouteOverlayPollsVisibilitySnapshot;
  registerTarget: (target: {
    syncPollsVisibilitySnapshot: (snapshot: RouteOverlayPollsVisibilitySnapshot) => void;
    attributionLabel: string;
  }) => () => void;
};

export type RouteShellOverlayChromeModeAuthority = {
  getSnapshot: () => RouteOverlayChromeModeSnapshot;
  registerSharedValues: (values: RouteOverlayChromeSnapSharedValueTargets) => () => void;
};

export type RouteShellOverlaySheetPolicyAuthority = {
  getSnapshot: () => RouteOverlaySheetPolicySnapshot;
  registerTarget: (target: {
    syncSheetPolicySnapshot: (snapshot: RouteOverlaySheetPolicySnapshot) => void;
    attributionLabel: string;
  }) => () => void;
};

export type RouteShellSheetHostSurfaceAuthority = {
  subscribe: (listener: () => void, attributionLabel?: string) => () => void;
  getSnapshot: () => AppRouteSheetHostSurfaceSnapshot;
};

export type RouteShellOverlayVisibilityAuthority = {
  subscribe: (listener: () => void, attributionLabel?: string) => () => void;
  getSnapshot: () => RouteOverlayVisibilitySnapshot;
};

export type AppRouteSceneFoundationRuntime = {
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
  sceneInputAuthority: AppRouteSceneInputAuthority;
  sceneInputLane: RouteShellSceneInputLane;
  dispose: () => void;
};

export type { RouteShellSceneInputLane } from './route-scene-registry-runtime';

export const createAppRouteSceneFoundationRuntime = ({
  sceneActivityAuthority,
  sceneInteractivityAuthority,
  scenePayloadAuthority,
  sceneSwitchAuthority,
  sceneTransitionAuthority,
  routeSceneSwitchRuntime,
  routeSceneVisibilityPolicyRuntime,
  routeOverlayCommandAuthority,
  routeSheetSnapSessionAuthority,
}: {
  sceneActivityAuthority: RouteShellSceneActivityAuthority;
  sceneInteractivityAuthority: RouteShellSceneInteractivityAuthority;
  scenePayloadAuthority: RouteShellScenePayloadAuthority;
  sceneSwitchAuthority: RouteShellSceneSwitchAuthority;
  sceneTransitionAuthority: RouteShellSceneTransitionAuthority;
  routeSceneSwitchRuntime: AppRouteSceneSwitchRuntime;
  routeSceneVisibilityPolicyRuntime: RouteSceneVisibilityPolicyRuntime;
  routeOverlayCommandAuthority: AppRouteOverlayCommandAuthority;
  routeSheetSnapSessionAuthority: AppRouteSheetSnapSessionAuthority;
}): AppRouteSceneFoundationRuntime => {
  const routeSceneRegistryRuntime = createRouteSceneRegistryRuntime();
  const nativeOverlayTargetAuthorities = createAppRouteNativeOverlayTargetAuthorities({
    routeScenePolicyAuthority: routeSceneRegistryRuntime.searchScenePolicyAuthority,
    routeSceneSwitchRuntime,
    routeOverlayCommandAuthority,
    routeSheetSnapSessionAuthority,
  });
  return {
    sceneTransitionAuthority,
    sceneSwitchAuthority,
    sceneActivityAuthority,
    scenePayloadAuthority,
    sceneInteractivityAuthority,
    routeOverlayNavigationAuthority: nativeOverlayTargetAuthorities.routeOverlayNavigationAuthority,
    routeOverlayIdentityAuthority: nativeOverlayTargetAuthorities.routeOverlayIdentityAuthority,
    routeOverlayRootAuthority: nativeOverlayTargetAuthorities.routeOverlayRootAuthority,
    routeOverlayDisplayAuthority: nativeOverlayTargetAuthorities.routeOverlayDisplayAuthority,
    routeOverlayPollsVisibilityAuthority:
      nativeOverlayTargetAuthorities.routeOverlayPollsVisibilityAuthority,
    routeOverlayChromeModeAuthority: nativeOverlayTargetAuthorities.routeOverlayChromeModeAuthority,
    routeOverlaySheetPolicyAuthority:
      nativeOverlayTargetAuthorities.routeSheetHostSheetPolicyAuthority,
    routeSheetHostSurfaceAuthority: nativeOverlayTargetAuthorities.routeSheetHostSurfaceAuthority,
    routeSheetHostNavigationAuthority:
      nativeOverlayTargetAuthorities.routeSheetHostNavigationAuthority,
    routeSheetHostSheetPolicyAuthority:
      nativeOverlayTargetAuthorities.routeSheetHostSheetPolicyAuthority,
    routeOverlayVisibilityAuthority: nativeOverlayTargetAuthorities.routeOverlayVisibilityAuthority,
    routeScenePolicyAuthority: routeSceneRegistryRuntime.searchScenePolicyAuthority,
    routeSceneVisibilityPolicyRuntime,
    sceneInputAuthority: routeSceneRegistryRuntime.sceneInputAuthority,
    sceneInputLane: routeSceneRegistryRuntime.sceneInputLane,
    dispose: () => {
      nativeOverlayTargetAuthorities.dispose();
      routeSceneRegistryRuntime.dispose();
    },
  };
};
