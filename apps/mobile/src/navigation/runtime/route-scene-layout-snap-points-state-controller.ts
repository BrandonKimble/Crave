import type { SearchRouteSceneLayoutState } from '../../overlays/searchRouteSceneLayoutContract';
import type { RouteSharedSheetVisualBinding } from './route-shared-sheet-visual-state-controller';

type Listener = () => void;

export type RouteSceneLayoutSnapPointsSnapshot =
  SearchRouteSceneLayoutState['snapPoints'] | null;

export type RouteSceneLayoutSnapPointsAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => RouteSceneLayoutSnapPointsSnapshot;
};

const areRouteSceneLayoutSnapPointsEqual = (
  left: RouteSceneLayoutSnapPointsSnapshot,
  right: RouteSceneLayoutSnapPointsSnapshot
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.expanded === right.expanded &&
    left.middle === right.middle &&
    left.collapsed === right.collapsed &&
    left.hidden === right.hidden);

const resolveRouteSceneLayoutSnapPointsSnapshot = (
  routeSharedSheetVisual: RouteSharedSheetVisualBinding
): RouteSceneLayoutSnapPointsSnapshot =>
  routeSharedSheetVisual == null ? null : routeSharedSheetVisual.snapPoints;

export class RouteSceneLayoutSnapPointsStateController {
  private routeSharedSheetVisual: RouteSharedSheetVisualBinding;

  private snapshot: RouteSceneLayoutSnapPointsSnapshot = null;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRouteSharedSheetVisual: () => void;

  public readonly routeSceneLayoutSnapPointsAuthority: RouteSceneLayoutSnapPointsAuthority;

  constructor({
    routeSharedSheetVisualAuthority,
  }: {
    routeSharedSheetVisualAuthority: {
      subscribe: (listener: Listener) => () => void;
      getSnapshot: () => RouteSharedSheetVisualBinding;
    };
  }) {
    this.routeSharedSheetVisual = routeSharedSheetVisualAuthority.getSnapshot();
    this.routeSceneLayoutSnapPointsAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.recompute(false);
    this.unsubscribeRouteSharedSheetVisual =
      routeSharedSheetVisualAuthority.subscribe(() => {
        this.setRouteSharedSheetVisual(
          routeSharedSheetVisualAuthority.getSnapshot()
        );
      });
  }

  public dispose(): void {
    this.unsubscribeRouteSharedSheetVisual();
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setRouteSharedSheetVisual(
    routeSharedSheetVisual: RouteSharedSheetVisualBinding
  ): void {
    if (this.routeSharedSheetVisual === routeSharedSheetVisual) {
      return;
    }

    this.routeSharedSheetVisual = routeSharedSheetVisual;
    this.recompute(true);
  }

  private recompute(notify: boolean): void {
    const nextSnapshot = resolveRouteSceneLayoutSnapPointsSnapshot(
      this.routeSharedSheetVisual
    );

    if (areRouteSceneLayoutSnapPointsEqual(this.snapshot, nextSnapshot)) {
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

export const createRouteSceneLayoutSnapPointsStateController = ({
  routeSharedSheetVisualAuthority,
}: ConstructorParameters<typeof RouteSceneLayoutSnapPointsStateController>[0]): RouteSceneLayoutSnapPointsStateController =>
  new RouteSceneLayoutSnapPointsStateController({
    routeSharedSheetVisualAuthority,
  });
