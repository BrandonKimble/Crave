import type { RouteHostVisualRuntime } from './route-host-visual-runtime-state-controller';

type Listener = () => void;

export type RouteSheetChromeMotionSnapshot = Pick<
  NonNullable<RouteHostVisualRuntime>,
  | 'searchSurfacePageBundleProgress'
  | 'navBarCutoutProgress'
  | 'navBarCutoutHidingProgress'
  | 'navBarCutoutIsHiding'
  | 'navTranslateY'
  | 'navSilhouetteSheetExclusionModeValue'
> | null;

export type RouteSheetChromeMotionAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => RouteSheetChromeMotionSnapshot;
};

const areChromeMotionSnapshotsEqual = (
  left: RouteSheetChromeMotionSnapshot,
  right: RouteSheetChromeMotionSnapshot
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.searchSurfacePageBundleProgress === right.searchSurfacePageBundleProgress &&
    left.navBarCutoutProgress === right.navBarCutoutProgress &&
    left.navBarCutoutHidingProgress === right.navBarCutoutHidingProgress &&
    left.navBarCutoutIsHiding === right.navBarCutoutIsHiding &&
    left.navTranslateY === right.navTranslateY &&
    left.navSilhouetteSheetExclusionModeValue === right.navSilhouetteSheetExclusionModeValue);

const resolveChromeMotionSnapshot = (
  routeHostVisualRuntime: RouteHostVisualRuntime
): RouteSheetChromeMotionSnapshot =>
  routeHostVisualRuntime == null
    ? null
    : {
        searchSurfacePageBundleProgress: routeHostVisualRuntime.searchSurfacePageBundleProgress,
        navBarCutoutProgress: routeHostVisualRuntime.navBarCutoutProgress,
        navBarCutoutHidingProgress: routeHostVisualRuntime.navBarCutoutHidingProgress,
        navBarCutoutIsHiding: routeHostVisualRuntime.navBarCutoutIsHiding,
        navTranslateY: routeHostVisualRuntime.navTranslateY,
        navSilhouetteSheetExclusionModeValue:
          routeHostVisualRuntime.navSilhouetteSheetExclusionModeValue,
      };

export class RouteSheetChromeMotionStateController {
  private routeHostVisualRuntime: RouteHostVisualRuntime;

  private snapshot: RouteSheetChromeMotionSnapshot = null;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRouteHostVisualRuntime: () => void;

  public readonly routeSheetChromeMotionAuthority: RouteSheetChromeMotionAuthority;

  constructor({
    routeHostVisualRuntimeAuthority,
  }: {
    routeHostVisualRuntimeAuthority: {
      subscribe: (listener: Listener) => () => void;
      getSnapshot: () => RouteHostVisualRuntime;
    };
  }) {
    this.routeHostVisualRuntime = routeHostVisualRuntimeAuthority.getSnapshot();
    this.routeSheetChromeMotionAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.recompute(false);
    this.unsubscribeRouteHostVisualRuntime = routeHostVisualRuntimeAuthority.subscribe(() => {
      this.setRouteHostVisualRuntime(routeHostVisualRuntimeAuthority.getSnapshot());
    });
  }

  public dispose(): void {
    this.unsubscribeRouteHostVisualRuntime();
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setRouteHostVisualRuntime(routeHostVisualRuntime: RouteHostVisualRuntime): void {
    if (this.routeHostVisualRuntime === routeHostVisualRuntime) {
      return;
    }

    this.routeHostVisualRuntime = routeHostVisualRuntime;
    this.recompute(true);
  }

  private recompute(notify: boolean): void {
    const nextSnapshot = resolveChromeMotionSnapshot(this.routeHostVisualRuntime);

    if (areChromeMotionSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;

    if (!notify) {
      return;
    }

    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createRouteSheetChromeMotionStateController = ({
  routeHostVisualRuntimeAuthority,
}: ConstructorParameters<
  typeof RouteSheetChromeMotionStateController
>[0]): RouteSheetChromeMotionStateController =>
  new RouteSheetChromeMotionStateController({
    routeHostVisualRuntimeAuthority,
  });
