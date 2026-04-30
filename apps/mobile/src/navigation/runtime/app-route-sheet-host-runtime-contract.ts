import type { SearchRoutePanelInteractionRef } from '../../overlays/searchOverlayRouteHostContract';
import type {
  AppRouteSheetHostRuntimeConfigAuthority,
  AppRouteSheetHostSurfaceBodyAuthority,
  AppRouteSheetHostSurfaceFrameAuthority,
  AppRouteSheetHostSurfaceAuthority,
} from './app-route-sheet-host-surface-runtime-contract';
import type { AppRouteSceneDisplayTargetRegistry } from './app-route-scene-display-target-registry';
import type { AppRouteSceneStackSurfaceAuthority } from './app-route-scene-stack-surface-contract';

export type AppRouteSheetHostRuntimeBase = {
  searchInteractionRef: SearchRoutePanelInteractionRef;
  routeSheetSurfaceAuthority: AppRouteSheetHostSurfaceAuthority;
  routeSheetSurfaceBodyAuthority: AppRouteSheetHostSurfaceBodyAuthority;
  routeSheetSurfaceFrameAuthority: AppRouteSheetHostSurfaceFrameAuthority;
  routeSheetRuntimeConfigAuthority: AppRouteSheetHostRuntimeConfigAuthority;
  sceneStackSurfaceAuthority: AppRouteSceneStackSurfaceAuthority;
  routeSceneDisplayTargetRegistry: AppRouteSceneDisplayTargetRegistry;
};

export type AppRouteSheetHostRuntime = AppRouteSheetHostRuntimeBase;

export type AppRouteSheetHostRuntimeOwner = Omit<
  AppRouteSheetHostRuntimeBase,
  'searchInteractionRef'
>;
