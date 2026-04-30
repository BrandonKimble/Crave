import type { SearchRouteSceneStackChromeVisualState } from '../../overlays/searchRouteSceneStackSheetContract';
import type {
  RouteSheetChromeGeometryAuthority,
  RouteSheetChromeGeometrySnapshot,
} from './route-sheet-chrome-geometry-state-controller';
import type {
  RouteSheetChromeMotionAuthority,
  RouteSheetChromeMotionSnapshot,
} from './route-sheet-chrome-motion-state-controller';

type Listener = () => void;

export type RouteSheetChromeVisualAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchRouteSceneStackChromeVisualState | null;
};

const areChromeVisualStatesEqual = (
  left: SearchRouteSceneStackChromeVisualState | null,
  right: SearchRouteSceneStackChromeVisualState | null
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.overlayHeaderActionProgress === right.overlayHeaderActionProgress &&
    left.navBarCutoutHeight === right.navBarCutoutHeight &&
    left.navBarCutoutProgress === right.navBarCutoutProgress &&
    left.bottomNavHiddenTranslateY === right.bottomNavHiddenTranslateY &&
    left.navBarCutoutIsHiding === right.navBarCutoutIsHiding);

const createChromeVisualState = ({
  routeSheetChromeGeometry,
  routeSheetChromeMotion,
}: {
  routeSheetChromeGeometry: RouteSheetChromeGeometrySnapshot;
  routeSheetChromeMotion: RouteSheetChromeMotionSnapshot;
}): SearchRouteSceneStackChromeVisualState | null =>
  routeSheetChromeGeometry == null || routeSheetChromeMotion == null
    ? null
    : {
        overlayHeaderActionProgress:
          routeSheetChromeMotion.overlayHeaderActionProgress,
        navBarCutoutHeight: routeSheetChromeGeometry.navBarCutoutHeight,
        navBarCutoutProgress: routeSheetChromeMotion.navBarCutoutProgress,
        bottomNavHiddenTranslateY:
          routeSheetChromeGeometry.bottomNavHiddenTranslateY,
        navBarCutoutIsHiding: routeSheetChromeMotion.navBarCutoutIsHiding,
      };

export class RouteSheetChromeVisualStateController {
  private routeSheetChromeGeometry: RouteSheetChromeGeometrySnapshot;

  private routeSheetChromeMotion: RouteSheetChromeMotionSnapshot;

  private snapshot: SearchRouteSceneStackChromeVisualState | null = null;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRouteSheetChromeGeometry: () => void;

  private readonly unsubscribeRouteSheetChromeMotion: () => void;

  public readonly routeSheetChromeVisualAuthority: RouteSheetChromeVisualAuthority;

  constructor({
    routeSheetChromeGeometryAuthority,
    routeSheetChromeMotionAuthority,
  }: {
    routeSheetChromeGeometryAuthority: RouteSheetChromeGeometryAuthority;
    routeSheetChromeMotionAuthority: RouteSheetChromeMotionAuthority;
  }) {
    this.routeSheetChromeGeometry = routeSheetChromeGeometryAuthority.getSnapshot();
    this.routeSheetChromeMotion = routeSheetChromeMotionAuthority.getSnapshot();
    this.routeSheetChromeVisualAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.recompute(false);
    this.unsubscribeRouteSheetChromeGeometry =
      routeSheetChromeGeometryAuthority.subscribe(() => {
        this.setRouteSheetChromeGeometry(
          routeSheetChromeGeometryAuthority.getSnapshot()
        );
      });
    this.unsubscribeRouteSheetChromeMotion =
      routeSheetChromeMotionAuthority.subscribe(() => {
        this.setRouteSheetChromeMotion(
          routeSheetChromeMotionAuthority.getSnapshot()
        );
      });
  }

  public dispose(): void {
    this.unsubscribeRouteSheetChromeMotion();
    this.unsubscribeRouteSheetChromeGeometry();
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setRouteSheetChromeGeometry(
    routeSheetChromeGeometry: RouteSheetChromeGeometrySnapshot
  ): void {
    if (this.routeSheetChromeGeometry === routeSheetChromeGeometry) {
      return;
    }

    this.routeSheetChromeGeometry = routeSheetChromeGeometry;
    this.recompute(true);
  }

  private setRouteSheetChromeMotion(
    routeSheetChromeMotion: RouteSheetChromeMotionSnapshot
  ): void {
    if (this.routeSheetChromeMotion === routeSheetChromeMotion) {
      return;
    }

    this.routeSheetChromeMotion = routeSheetChromeMotion;
    this.recompute(true);
  }

  private recompute(notify: boolean): void {
    const nextSnapshot = createChromeVisualState({
      routeSheetChromeGeometry: this.routeSheetChromeGeometry,
      routeSheetChromeMotion: this.routeSheetChromeMotion,
    });

    if (areChromeVisualStatesEqual(this.snapshot, nextSnapshot)) {
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

export const createRouteSheetChromeVisualStateController = ({
  routeSheetChromeGeometryAuthority,
  routeSheetChromeMotionAuthority,
}: ConstructorParameters<typeof RouteSheetChromeVisualStateController>[0]): RouteSheetChromeVisualStateController =>
  new RouteSheetChromeVisualStateController({
    routeSheetChromeGeometryAuthority,
    routeSheetChromeMotionAuthority,
  });
