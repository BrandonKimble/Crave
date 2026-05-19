import type { SearchRoutePanelInteractionRef } from '../../overlays/searchOverlayRouteHostContract';
import type {
  AppRouteSheetHostRuntimeConfigAuthority,
  AppRouteSheetHostMotionRuntimeAuthority,
  AppRouteSheetHostSurfaceBodyAuthority,
  AppRouteSheetHostSurfaceFrameAuthority,
  AppRouteSheetHostSurfaceAuthority,
} from './app-route-sheet-host-surface-runtime-contract';
import type { AppRouteSceneDisplayTargetRegistry } from './app-route-scene-display-target-registry';
import type { AppRouteSceneStackSurfaceAuthority } from './app-route-scene-stack-surface-contract';
import type { RouteHostVisualRuntimeAuthority } from './route-host-visual-runtime-state-controller';

export type AppRouteSheetHostRuntimeBase = {
  searchInteractionRef: SearchRoutePanelInteractionRef;
  routeSheetSurfaceAuthority: AppRouteSheetHostSurfaceAuthority;
  routeSheetSurfaceBodyAuthority: AppRouteSheetHostSurfaceBodyAuthority;
  routeSheetMotionRuntimeAuthority: AppRouteSheetHostMotionRuntimeAuthority;
  routeSheetSurfaceFrameAuthority: AppRouteSheetHostSurfaceFrameAuthority;
  routeSheetRuntimeConfigAuthority: AppRouteSheetHostRuntimeConfigAuthority;
  sceneStackSurfaceAuthority: AppRouteSceneStackSurfaceAuthority;
  routeSceneDisplayTargetRegistry: AppRouteSceneDisplayTargetRegistry;
  routeHostVisualRuntimeAuthority: RouteHostVisualRuntimeAuthority;
  replayPersistentPollSheetHostContract: (source: string) => void;
};

export type AppRouteSheetHostRuntime = AppRouteSheetHostRuntimeBase;

export type AppRouteSheetHostRuntimeOwner = Omit<
  AppRouteSheetHostRuntimeBase,
  'searchInteractionRef'
>;
