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

// F955(b) — TWO REGISTRIES, ONE RULE.
//
// This registry stored an ARRAY of targets and resolved `targets[0]`: a second registrant
// was stored, notified about, and never used, while unregistering the FIRST silently
// promoted the second mid-flight. The sheet registry next door
// (app-route-scene-sheet-motion-target-registry.ts) reverses its candidate list to prefer
// the NEWEST registrant — so the two registries disagreed about which registrant wins, and
// nothing said so.
//
// The rule is now the same one, stated: THE NEWEST REGISTRANT WINS. A second registrant
// exists only while a switch has two live hosts for a plane (the outgoing one is tearing
// down), and the incoming host is the one whose motion the user is about to see. Newest-wins
// also makes unregistration monotone — dropping the OUTGOING registrant cannot change who
// is driving, which is precisely the mid-flight promotion the old `targets[0]` could suffer.
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
    const target = this.targets[this.targets.length - 1];
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
