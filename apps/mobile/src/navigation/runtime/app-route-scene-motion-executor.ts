import type { OverlayKey, OverlaySheetSnapRequest } from '../../overlays/types';
import {
  PRESERVE_ROUTE_SCENE_SWITCH_CAMERA_INTENT,
  PRESERVE_ROUTE_SCENE_SWITCH_CHROME_TARGET,
  type RouteSceneSwitchCameraIntent,
  type RouteSceneSwitchChromeVisibilityTarget,
  type RouteSceneSwitchMotionPlane,
  type RouteSceneSwitchSheetMotionPlan,
  type RouteSceneSwitchTransitionContract,
} from './app-overlay-route-transition-contract';
import type {
  AppRouteSceneSheetMotionTarget,
  AppRouteSceneSheetMotionTargetRegistry,
} from './app-route-scene-sheet-motion-target-registry';
import type {
  AppRouteSceneCameraMotionTargetRegistry,
  AppRouteSceneChromeMotionTargetRegistry,
} from './app-route-scene-motion-target-registry';
import type {
  AppRouteSceneSwitchRuntime,
  RouteSceneSwitchMotionDispatchSnapshot,
} from './app-route-scene-switch-controller';
import { withSearchNavSwitchRuntimeAttribution } from '../../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';

type AppRouteSceneSheetMotionDispatchState = {
  sceneKey: OverlayKey;
  target: AppRouteSceneSheetMotionTarget;
  request: OverlaySheetSnapRequest | null;
};

export type AppRouteSceneCameraMotionTarget = {
  executeCameraIntent: (
    cameraIntent: RouteSceneSwitchCameraIntent,
    transitionContract: RouteSceneSwitchTransitionContract,
    complete: () => void
  ) => boolean;
};

export type AppRouteSceneChromeMotionTarget = {
  isChromeVisibilityTargetSettled: (
    chromeVisibilityTarget: RouteSceneSwitchChromeVisibilityTarget
  ) => boolean;
  executeChromeVisibilityTarget: (
    chromeVisibilityTarget: RouteSceneSwitchChromeVisibilityTarget,
    transitionContract: RouteSceneSwitchTransitionContract,
    complete: () => void
  ) => boolean;
};

type AppRouteScenePlaneDispatchState = {
  settleToken: number;
  plane: RouteSceneSwitchMotionPlane;
  transitionToken: number;
  target: AppRouteSceneCameraMotionTarget | AppRouteSceneChromeMotionTarget;
};

const areCameraIntentsEqual = (
  left: RouteSceneSwitchCameraIntent,
  right: RouteSceneSwitchCameraIntent
): boolean => left.kind === right.kind;

const areChromeTargetsEqual = (
  left: RouteSceneSwitchChromeVisibilityTarget,
  right: RouteSceneSwitchChromeVisibilityTarget
): boolean => left.searchChrome === right.searchChrome;

const isPreserveMotionContract = (
  transitionContract: RouteSceneSwitchTransitionContract
): boolean =>
  areCameraIntentsEqual(
    transitionContract.cameraIntent,
    PRESERVE_ROUTE_SCENE_SWITCH_CAMERA_INTENT
  ) &&
  areChromeTargetsEqual(
    transitionContract.chromeVisibilityTarget,
    PRESERVE_ROUTE_SCENE_SWITCH_CHROME_TARGET
  );

const areSnapRequestsEqual = (
  left: OverlaySheetSnapRequest | null,
  right: OverlaySheetSnapRequest | null
): boolean =>
  left?.snap === right?.snap &&
  (left?.token ?? null) === (right?.token ?? null) &&
  (left?.settleToken ?? null) === (right?.settleToken ?? null) &&
  (left?.mode ?? 'spring') === (right?.mode ?? 'spring');

const didDispatchPlane = (
  previous: AppRouteScenePlaneDispatchState | null,
  transitionContract: RouteSceneSwitchTransitionContract,
  plane: RouteSceneSwitchMotionPlane,
  target: AppRouteSceneCameraMotionTarget | AppRouteSceneChromeMotionTarget
): boolean =>
  previous?.settleToken === transitionContract.settleToken &&
  previous.transitionToken === transitionContract.transitionToken &&
  previous.plane === plane &&
  previous.target === target;

const resolveTargetSceneKey = (
  transitionState: RouteSceneSwitchMotionDispatchSnapshot
): OverlayKey | null =>
  transitionState.transitionContract?.targetSceneKey ?? transitionState.activeSceneKey;

const resolveSheetMotionSceneKey = (
  transitionState: RouteSceneSwitchMotionDispatchSnapshot
): OverlayKey | null =>
  transitionState.transitionContract?.sheetHostSceneKey ??
  transitionState.transitionContract?.sheetIntent?.sceneKey ??
  resolveTargetSceneKey(transitionState);

const resolveSheetMotionMode = (
  motion: RouteSceneSwitchSheetMotionPlan
): OverlaySheetSnapRequest['mode'] | undefined => {
  switch (motion.kind) {
    case 'snapTo':
    case 'promoteAtLeast':
    case 'hide':
      return motion.mode;
    case 'preserveLiveY':
    case 'none':
    default:
      return undefined;
  }
};

type AppRouteSceneMotionExecutorInput = {
  sheetMotionTargetRegistry: AppRouteSceneSheetMotionTargetRegistry;
  cameraMotionTargetRegistry: AppRouteSceneCameraMotionTargetRegistry;
  chromeMotionTargetRegistry: AppRouteSceneChromeMotionTargetRegistry;
  routeSceneSwitchRuntime: AppRouteSceneSwitchRuntime;
};

export class AppRouteSceneMotionExecutor {
  private sheetMotionCommandToken = 0;

  private lastSheetDispatchState: AppRouteSceneSheetMotionDispatchState | null = null;

  private lastCameraDispatchState: AppRouteScenePlaneDispatchState | null = null;

  private lastChromeDispatchState: AppRouteScenePlaneDispatchState | null = null;

  constructor(private readonly input: AppRouteSceneMotionExecutorInput) {}

  public dispose(): void {
    this.lastSheetDispatchState = null;
    this.lastCameraDispatchState = null;
    this.lastChromeDispatchState = null;
  }

  public completeFromSheetSettle(settleToken: number): void {
    this.completeMotionPlane(settleToken, 'sheet');
  }

  // Completes the overlap 'content' settle plane. Render-side CO-completer: the scene-stack
  // crossfade ramp's withTiming onFinish calls this (via runOnJS, threaded from
  // AppRouteSheetHostRuntimeProvider → BottomSheetSceneStackHost) with the contentTransitionToken
  // once the incoming page reveals, so the plane settles at ramp-end. Phase 2: the readiness
  // collector is the other co-completer (settles on real gate paint), and the controller-side
  // SCENE_READINESS_LIVENESS_MS timer is a never-hit watchdog. completeMotionPlane is token-guarded,
  // so a stale/duplicate call (e.g. a superseded ramp, the collector, or the watchdog) is a safe no-op.
  public completeFromContentSettle(settleToken: number): void {
    this.completeMotionPlane(settleToken, 'content');
  }

  public dispatchRouteSceneMotion(transitionState: RouteSceneSwitchMotionDispatchSnapshot): void {
    const transitionContract = transitionState.transitionContract;
    if (transitionContract) {
      if (!isPreserveMotionContract(transitionContract)) {
        if (transitionContract.motionPlanes.includes('camera')) {
          withSearchNavSwitchRuntimeAttribution(
            'sceneMotionExecutor',
            'dispatchCameraMotion',
            () => {
              this.dispatchCameraMotion(transitionContract);
            }
          );
        }
        if (transitionContract.motionPlanes.includes('chrome')) {
          withSearchNavSwitchRuntimeAttribution(
            'sceneMotionExecutor',
            'dispatchChromeMotion',
            () => {
              this.dispatchChromeMotion(transitionContract);
            }
          );
        }
      }
    } else {
      this.lastCameraDispatchState = null;
      this.lastChromeDispatchState = null;
    }

    if (transitionContract == null) {
      return;
    }

    const sheetSceneKey = resolveSheetMotionSceneKey(transitionState);
    if (!sheetSceneKey) {
      return;
    }

    const sheetTargetResolution =
      transitionContract == null
        ? null
        : withSearchNavSwitchRuntimeAttribution(
            'sceneMotionExecutor',
            `resolveTransitionSheetTarget:${sheetSceneKey}`,
            () =>
              this.input.sheetMotionTargetRegistry.resolveTransitionTarget(
                sheetSceneKey,
                transitionContract
              )
          );

    if (sheetTargetResolution?.kind === 'awaiting-target') {
      return;
    }

    const target =
      sheetTargetResolution?.kind === 'ready'
        ? sheetTargetResolution.target
        : withSearchNavSwitchRuntimeAttribution(
            'sceneMotionExecutor',
            `resolveSheetTarget:${sheetSceneKey}`,
            () =>
              this.input.sheetMotionTargetRegistry.resolveTarget(sheetSceneKey, transitionContract)
          );

    if (target == null) {
      if (transitionContract?.motionPlanes.includes('sheet')) {
        this.completeMotionPlane(transitionContract.settleToken, 'sheet');
      }
      return;
    }

    withSearchNavSwitchRuntimeAttribution(
      'sceneMotionExecutor',
      `requestTransitionSheetMotion:${sheetSceneKey}`,
      () => {
        const request = this.resolveTransitionSheetRequest(transitionState, sheetSceneKey, target);
        this.requestSheetMotion(
          target,
          request
        );
      }
    );
  }

  private requestSheetMotion(
    target: AppRouteSceneSheetMotionTarget,
    request: OverlaySheetSnapRequest | null
  ): void {
    if (
      this.lastSheetDispatchState?.sceneKey === target.sceneKey &&
      this.lastSheetDispatchState.target === target &&
      areSnapRequestsEqual(this.lastSheetDispatchState.request, request)
    ) {
      return;
    }
    this.lastSheetDispatchState = {
      sceneKey: target.sceneKey,
      target,
      request,
    };
    if (request == null) {
      target.motionCommandValue.value = null;
      return;
    }
    this.sheetMotionCommandToken += 1;
    target.motionCommandValue.value = {
      snapTo: request.snap,
      token: this.sheetMotionCommandToken,
      settleToken: request.settleToken ?? null,
      mode: request.mode,
    };
  }

  private completeMotionPlane(settleToken: number, plane: RouteSceneSwitchMotionPlane): void {
    this.input.routeSceneSwitchRuntime.completeRouteSceneSwitchMotionPlane(settleToken, plane);
  }

  private dispatchCameraMotion(transitionContract: RouteSceneSwitchTransitionContract): void {
    if (!transitionContract.motionPlanes.includes('camera')) {
      return;
    }
    if (
      areCameraIntentsEqual(
        transitionContract.cameraIntent,
        PRESERVE_ROUTE_SCENE_SWITCH_CAMERA_INTENT
      )
    ) {
      this.completeMotionPlane(transitionContract.settleToken, 'camera');
      return;
    }
    const cameraMotionTargetResolution =
      this.input.cameraMotionTargetRegistry.resolveTransitionTarget(transitionContract);
    if (cameraMotionTargetResolution.kind === 'awaiting-target') {
      return;
    }
    if (cameraMotionTargetResolution.kind === 'unavailable') {
      this.completeMotionPlane(transitionContract.settleToken, 'camera');
      return;
    }
    const cameraMotionTarget = cameraMotionTargetResolution.target;
    if (
      didDispatchPlane(
        this.lastCameraDispatchState,
        transitionContract,
        'camera',
        cameraMotionTarget
      )
    ) {
      return;
    }
    this.lastCameraDispatchState = {
      settleToken: transitionContract.settleToken,
      transitionToken: transitionContract.transitionToken,
      plane: 'camera',
      target: cameraMotionTarget,
    };
    const complete = () => this.completeMotionPlane(transitionContract.settleToken, 'camera');
    if (
      !cameraMotionTarget.executeCameraIntent(
        transitionContract.cameraIntent,
        transitionContract,
        complete
      )
    ) {
      complete();
    }
  }

  private dispatchChromeMotion(transitionContract: RouteSceneSwitchTransitionContract): void {
    if (!transitionContract.motionPlanes.includes('chrome')) {
      return;
    }
    if (
      areChromeTargetsEqual(
        transitionContract.chromeVisibilityTarget,
        PRESERVE_ROUTE_SCENE_SWITCH_CHROME_TARGET
      )
    ) {
      this.completeMotionPlane(transitionContract.settleToken, 'chrome');
      return;
    }
    const chromeMotionTargetResolution =
      this.input.chromeMotionTargetRegistry.resolveTransitionTarget(transitionContract);
    if (chromeMotionTargetResolution.kind === 'awaiting-target') {
      return;
    }
    if (chromeMotionTargetResolution.kind === 'unavailable') {
      this.completeMotionPlane(transitionContract.settleToken, 'chrome');
      return;
    }
    const chromeMotionTarget = chromeMotionTargetResolution.target;
    if (
      chromeMotionTarget.isChromeVisibilityTargetSettled(transitionContract.chromeVisibilityTarget)
    ) {
      this.completeMotionPlane(transitionContract.settleToken, 'chrome');
      return;
    }
    if (
      didDispatchPlane(
        this.lastChromeDispatchState,
        transitionContract,
        'chrome',
        chromeMotionTarget
      )
    ) {
      return;
    }
    this.lastChromeDispatchState = {
      settleToken: transitionContract.settleToken,
      transitionToken: transitionContract.transitionToken,
      plane: 'chrome',
      target: chromeMotionTarget,
    };
    const complete = () => this.completeMotionPlane(transitionContract.settleToken, 'chrome');
    if (
      !chromeMotionTarget.executeChromeVisibilityTarget(
        transitionContract.chromeVisibilityTarget,
        transitionContract,
        complete
      )
    ) {
      complete();
    }
  }

  private resolveTransitionSheetRequest(
    transitionState: RouteSceneSwitchMotionDispatchSnapshot,
    targetSceneKey: OverlayKey,
    target: AppRouteSceneSheetMotionTarget
  ): OverlaySheetSnapRequest | null {
    const transitionContract = transitionState.transitionContract;
    const isMatchingTransitionTarget =
      transitionState.isOverlaySwitchInFlight &&
      (transitionContract?.sheetHostSceneKey ??
        transitionContract?.sheetIntent?.sceneKey ??
        transitionContract?.targetSceneKey) != null &&
      this.input.sheetMotionTargetRegistry.targetOwnsScene(
        target,
        transitionContract?.sheetHostSceneKey ??
          transitionContract?.sheetIntent?.sceneKey ??
          transitionContract?.targetSceneKey ??
          targetSceneKey
      );

    if (isMatchingTransitionTarget && transitionContract?.sheetSnapTarget != null) {
      return {
        snap: transitionContract.sheetSnapTarget,
        token: transitionContract.transitionToken,
        settleToken: transitionContract.settleToken,
        mode: resolveSheetMotionMode(transitionContract.sheetTransitionPlan.motion),
      };
    }

    return null;
  }
}
