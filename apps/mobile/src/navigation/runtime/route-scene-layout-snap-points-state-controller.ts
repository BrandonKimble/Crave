import type { SearchRouteSceneLayoutState } from '../../overlays/searchRouteSceneLayoutContract';
import type { RouteResultsSheetVisualBinding } from './route-results-sheet-visual-state-controller';

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
  routeResultsSheetVisual: RouteResultsSheetVisualBinding
): RouteSceneLayoutSnapPointsSnapshot =>
  routeResultsSheetVisual == null ? null : routeResultsSheetVisual.snapPoints;

export class RouteSceneLayoutSnapPointsStateController {
  private routeResultsSheetVisual: RouteResultsSheetVisualBinding;

  private snapshot: RouteSceneLayoutSnapPointsSnapshot = null;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRouteResultsSheetVisual: () => void;

  public readonly routeSceneLayoutSnapPointsAuthority: RouteSceneLayoutSnapPointsAuthority;

  constructor({
    routeResultsSheetVisualAuthority,
  }: {
    routeResultsSheetVisualAuthority: {
      subscribe: (listener: Listener) => () => void;
      getSnapshot: () => RouteResultsSheetVisualBinding;
    };
  }) {
    this.routeResultsSheetVisual = routeResultsSheetVisualAuthority.getSnapshot();
    this.routeSceneLayoutSnapPointsAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.recompute(false);
    this.unsubscribeRouteResultsSheetVisual =
      routeResultsSheetVisualAuthority.subscribe(() => {
        this.setRouteResultsSheetVisual(
          routeResultsSheetVisualAuthority.getSnapshot()
        );
      });
  }

  public dispose(): void {
    this.unsubscribeRouteResultsSheetVisual();
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setRouteResultsSheetVisual(
    routeResultsSheetVisual: RouteResultsSheetVisualBinding
  ): void {
    if (this.routeResultsSheetVisual === routeResultsSheetVisual) {
      return;
    }

    this.routeResultsSheetVisual = routeResultsSheetVisual;
    this.recompute(true);
  }

  private recompute(notify: boolean): void {
    const nextSnapshot = resolveRouteSceneLayoutSnapPointsSnapshot(
      this.routeResultsSheetVisual
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
  routeResultsSheetVisualAuthority,
}: ConstructorParameters<typeof RouteSceneLayoutSnapPointsStateController>[0]): RouteSceneLayoutSnapPointsStateController =>
  new RouteSceneLayoutSnapPointsStateController({
    routeResultsSheetVisualAuthority,
  });
