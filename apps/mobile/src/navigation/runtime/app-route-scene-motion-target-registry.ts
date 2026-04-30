import type {
  AppRouteSceneCameraMotionTarget,
  AppRouteSceneChromeMotionTarget,
} from './app-route-scene-motion-executor';
import type {
  RouteSceneSwitchMotionPlane,
  RouteSceneSwitchTransitionContract,
} from './app-overlay-route-transition-contract';

type Listener = () => void;

type AppRouteSceneMotionTargetResolution<TTarget> =
  | {
      kind: 'ready';
      target: TTarget;
    }
  | {
      kind: 'awaiting-target';
    }
  | {
      kind: 'unavailable';
    };

class AppRouteScenePlaneMotionTargetRegistry<TTarget> {
  private readonly targets: TTarget[] = [];

  private readonly listeners = new Set<Listener>();

  constructor(private readonly plane: RouteSceneSwitchMotionPlane) {}

  public dispose(): void {
    this.targets.length = 0;
    this.listeners.clear();
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public registerTarget(target: TTarget): () => void {
    this.targets.push(target);
    this.notify();
    return () => {
      const targetIndex = this.targets.indexOf(target);
      if (targetIndex < 0) {
        return;
      }
      this.targets.splice(targetIndex, 1);
      this.notify();
    };
  }

  public resolveTransitionTarget(
    transitionContract: RouteSceneSwitchTransitionContract
  ): AppRouteSceneMotionTargetResolution<TTarget> {
    if (!transitionContract.motionPlanes.includes(this.plane)) {
      return {
        kind: 'unavailable',
      };
    }
    const target = this.targets[0];
    if (target == null) {
      return {
        kind: 'awaiting-target',
      };
    }
    return {
      kind: 'ready',
      target,
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export class AppRouteSceneCameraMotionTargetRegistry extends AppRouteScenePlaneMotionTargetRegistry<AppRouteSceneCameraMotionTarget> {
  constructor() {
    super('camera');
  }
}

export class AppRouteSceneChromeMotionTargetRegistry extends AppRouteScenePlaneMotionTargetRegistry<AppRouteSceneChromeMotionTarget> {
  constructor() {
    super('chrome');
  }
}
