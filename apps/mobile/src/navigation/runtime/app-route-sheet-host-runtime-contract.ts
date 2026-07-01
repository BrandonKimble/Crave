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
  // Render-side co-completer for the overlap 'content' settle plane: the scene-stack
  // crossfade ramp (BottomSheetSceneStackHost) calls this with the contentTransitionToken
  // (= the transition's settleToken) at ramp-end so the 'content' plane settles when the
  // incoming page is actually revealed. Phase 2: the readiness collector is the other
  // co-completer and the controller SCENE_READINESS_LIVENESS_MS timer is a never-hit watchdog.
  // Token-guarded in the controller, so a stale/duplicate call is safe.
  onContentSettleComplete: (token: number) => void;
};

export type AppRouteSheetHostRuntime = AppRouteSheetHostRuntimeBase;

export type AppRouteSheetHostRuntimeOwner = Omit<
  AppRouteSheetHostRuntimeBase,
  'searchInteractionRef'
>;
