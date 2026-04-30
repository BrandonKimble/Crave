import type { SearchRouteSceneLayoutState } from '../../overlays/searchRouteSceneLayoutContract';
import type { RouteSceneLayoutSnapPointsAuthority } from './route-scene-layout-snap-points-state-controller';

type Listener = () => void;

export type RouteSceneLayoutSheetSnapshot = Pick<
  SearchRouteSceneLayoutState,
  'snapPoints'
> | null;

export type RouteSceneLayoutSheetAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => RouteSceneLayoutSheetSnapshot;
};

const areRouteSceneLayoutSheetsEqual = (
  left: RouteSceneLayoutSheetSnapshot,
  right: RouteSceneLayoutSheetSnapshot
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.snapPoints.expanded === right.snapPoints.expanded &&
    left.snapPoints.middle === right.snapPoints.middle &&
    left.snapPoints.collapsed === right.snapPoints.collapsed &&
    left.snapPoints.hidden === right.snapPoints.hidden);

const createRouteSceneLayoutSheetSnapshot = (
  routeSceneLayoutSnapPointsSnapshot: ReturnType<
    RouteSceneLayoutSnapPointsAuthority['getSnapshot']
  >
): RouteSceneLayoutSheetSnapshot =>
  routeSceneLayoutSnapPointsSnapshot == null
    ? null
    : {
        snapPoints: routeSceneLayoutSnapPointsSnapshot,
      };

export class RouteSceneLayoutSheetStateController {
  private routeSceneLayoutSnapPointsSnapshot: ReturnType<
    RouteSceneLayoutSnapPointsAuthority['getSnapshot']
  >;

  private snapshot: RouteSceneLayoutSheetSnapshot = null;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRouteSceneLayoutSnapPoints: () => void;

  public readonly routeSceneLayoutSheetAuthority: RouteSceneLayoutSheetAuthority;

  constructor({
    routeSceneLayoutSnapPointsAuthority,
  }: {
    routeSceneLayoutSnapPointsAuthority: RouteSceneLayoutSnapPointsAuthority;
  }) {
    this.routeSceneLayoutSnapPointsSnapshot =
      routeSceneLayoutSnapPointsAuthority.getSnapshot();
    this.routeSceneLayoutSheetAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.recompute(false);
    this.unsubscribeRouteSceneLayoutSnapPoints =
      routeSceneLayoutSnapPointsAuthority.subscribe(() => {
        this.setRouteSceneLayoutSnapPointsSnapshot(
          routeSceneLayoutSnapPointsAuthority.getSnapshot()
        );
      });
  }

  public dispose(): void {
    this.unsubscribeRouteSceneLayoutSnapPoints();
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setRouteSceneLayoutSnapPointsSnapshot(
    routeSceneLayoutSnapPointsSnapshot: ReturnType<
      RouteSceneLayoutSnapPointsAuthority['getSnapshot']
    >
  ): void {
    if (
      this.routeSceneLayoutSnapPointsSnapshot ===
      routeSceneLayoutSnapPointsSnapshot
    ) {
      return;
    }
    this.routeSceneLayoutSnapPointsSnapshot = routeSceneLayoutSnapPointsSnapshot;
    this.recompute(true);
  }

  private recompute(notify: boolean): void {
    const nextSnapshot = createRouteSceneLayoutSheetSnapshot(
      this.routeSceneLayoutSnapPointsSnapshot
    );

    if (areRouteSceneLayoutSheetsEqual(this.snapshot, nextSnapshot)) {
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

export const createRouteSceneLayoutSheetStateController = ({
  routeSceneLayoutSnapPointsAuthority,
}: ConstructorParameters<
  typeof RouteSceneLayoutSheetStateController
>[0]): RouteSceneLayoutSheetStateController =>
  new RouteSceneLayoutSheetStateController({
    routeSceneLayoutSnapPointsAuthority,
  });
