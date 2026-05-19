import type { OverlayKey, OverlaySheetSnapRequest } from '../../overlays/types';
import {
  AppRouteSceneMotionExecutor,
  type AppRouteSceneCameraMotionTarget,
  type AppRouteSceneChromeMotionTarget,
} from './app-route-scene-motion-executor';
import {
  AppRouteSceneCameraMotionTargetRegistry,
  AppRouteSceneChromeMotionTargetRegistry,
} from './app-route-scene-motion-target-registry';
import { withSearchNavSwitchRuntimeAttribution } from '../../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import type {
  AppRouteSceneSheetMotionTarget,
  AppRouteSceneSheetMotionTargetRegistry,
} from './app-route-scene-sheet-motion-target-registry';
import type { AppRouteSceneSwitchRuntime } from './app-route-scene-switch-controller';

export type {
  AppRouteSceneCameraMotionTarget,
  AppRouteSceneChromeMotionTarget,
} from './app-route-scene-motion-executor';

export type AppRouteSceneMotionRuntime = {
  registerSheetMotionTarget: (target: AppRouteSceneSheetMotionTarget) => () => void;
  registerCameraMotionTarget: (target: AppRouteSceneCameraMotionTarget) => () => void;
  registerChromeMotionTarget: (target: AppRouteSceneChromeMotionTarget) => () => void;
  requestLocalSheetMotion: (
    sceneKey: OverlayKey,
    request: OverlaySheetSnapRequest | null,
    options?: {
      localMotionKey?: string;
    }
  ) => void;
  requestBootstrapSheetMotion: (sceneKey: OverlayKey, request: OverlaySheetSnapRequest) => void;
  completeFromSheetSettle: (settleToken: number) => void;
  dispose: () => void;
};

export class AppRouteSceneMotionController implements AppRouteSceneMotionRuntime {
  private readonly cameraMotionTargetRegistry = new AppRouteSceneCameraMotionTargetRegistry();

  private readonly chromeMotionTargetRegistry = new AppRouteSceneChromeMotionTargetRegistry();

  private readonly executor: AppRouteSceneMotionExecutor;

  private readonly unsubscribeMotionDispatchTarget: () => void;

  private readonly unsubscribeSheetTargetRegistry: () => void;

  private readonly unsubscribeCameraTargetRegistry: () => void;

  private readonly unsubscribeChromeTargetRegistry: () => void;

  constructor(
    private readonly sheetMotionTargetRegistry: AppRouteSceneSheetMotionTargetRegistry,
    private readonly routeSceneSwitchRuntime: AppRouteSceneSwitchRuntime
  ) {
    this.executor = new AppRouteSceneMotionExecutor({
      sheetMotionTargetRegistry,
      cameraMotionTargetRegistry: this.cameraMotionTargetRegistry,
      chromeMotionTargetRegistry: this.chromeMotionTargetRegistry,
      routeSceneSwitchRuntime,
    });
    this.unsubscribeMotionDispatchTarget =
      this.routeSceneSwitchRuntime.setRouteSceneMotionDispatchTarget((transitionState) => {
        this.executor.dispatchRouteSceneMotion(transitionState);
      });
    this.unsubscribeSheetTargetRegistry = this.sheetMotionTargetRegistry.subscribe(() => {
      withSearchNavSwitchRuntimeAttribution('sceneMotion', 'dispatch:sheetTargetRegistry', () => {
        this.executor.dispatchRouteSceneMotion(this.routeSceneSwitchRuntime.getTransitionState());
        this.executor.replayPendingLocalSheetMotion();
      });
    });
    this.unsubscribeCameraTargetRegistry = this.cameraMotionTargetRegistry.subscribe(() => {
      withSearchNavSwitchRuntimeAttribution('sceneMotion', 'dispatch:cameraTargetRegistry', () => {
        this.dispatchCurrentTransition();
      });
    });
    this.unsubscribeChromeTargetRegistry = this.chromeMotionTargetRegistry.subscribe(() => {
      withSearchNavSwitchRuntimeAttribution('sceneMotion', 'dispatch:chromeTargetRegistry', () => {
        this.dispatchCurrentTransition();
      });
    });
    this.executor.dispatchRouteSceneMotion(this.routeSceneSwitchRuntime.getTransitionState());
  }

  public dispose(): void {
    this.unsubscribeMotionDispatchTarget();
    this.unsubscribeSheetTargetRegistry();
    this.unsubscribeCameraTargetRegistry();
    this.unsubscribeChromeTargetRegistry();
    this.cameraMotionTargetRegistry.dispose();
    this.chromeMotionTargetRegistry.dispose();
    this.executor.dispose();
  }

  public registerSheetMotionTarget(target: AppRouteSceneSheetMotionTarget): () => void {
    return this.sheetMotionTargetRegistry.registerTarget(target);
  }

  public registerCameraMotionTarget(target: AppRouteSceneCameraMotionTarget): () => void {
    return this.cameraMotionTargetRegistry.registerTarget(target);
  }

  public registerChromeMotionTarget(target: AppRouteSceneChromeMotionTarget): () => void {
    return this.chromeMotionTargetRegistry.registerTarget(target);
  }

  public requestLocalSheetMotion(
    sceneKey: OverlayKey,
    request: OverlaySheetSnapRequest | null,
    options?: {
      localMotionKey?: string;
    }
  ): void {
    withSearchNavSwitchRuntimeAttribution('sceneMotion', 'requestLocalSheetMotion', () => {
      this.executor.requestLocalSheetMotion(sceneKey, request, options);
    });
  }

  public requestBootstrapSheetMotion(sceneKey: OverlayKey, request: OverlaySheetSnapRequest): void {
    withSearchNavSwitchRuntimeAttribution('sceneMotion', 'requestBootstrapSheetMotion', () => {
      this.executor.requestBootstrapSheetMotion(sceneKey, request);
    });
  }

  public completeFromSheetSettle(settleToken: number): void {
    withSearchNavSwitchRuntimeAttribution('sceneMotion', 'completeFromSheetSettle', () => {
      this.executor.completeFromSheetSettle(settleToken);
    });
  }

  private dispatchCurrentTransition(): void {
    this.executor.dispatchRouteSceneMotion(this.routeSceneSwitchRuntime.getTransitionState());
  }
}

export const createAppRouteSceneMotionRuntime = ({
  sheetMotionTargetRegistry,
  routeSceneSwitchRuntime,
}: {
  sheetMotionTargetRegistry: AppRouteSceneSheetMotionTargetRegistry;
  routeSceneSwitchRuntime: AppRouteSceneSwitchRuntime;
}): AppRouteSceneMotionRuntime =>
  new AppRouteSceneMotionController(sheetMotionTargetRegistry, routeSceneSwitchRuntime);
