import type { RouteResultsSheetVisualBinding } from '../../../../navigation/runtime/route-results-sheet-visual-state-controller';

type Listener = () => void;

export type SearchOverlayLocalRestaurantRouteSheetSnapshot = {
  resultsSheetRuntimeOwner: NonNullable<RouteResultsSheetVisualBinding>;
} | null;

export type SearchOverlayLocalRestaurantRouteSheetAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchOverlayLocalRestaurantRouteSheetSnapshot;
};

const resolveLocalRestaurantRouteSheetSnapshot = (
  routeResultsSheetVisual: RouteResultsSheetVisualBinding
): SearchOverlayLocalRestaurantRouteSheetSnapshot =>
  routeResultsSheetVisual == null
    ? null
    : {
        resultsSheetRuntimeOwner: routeResultsSheetVisual,
      };

const areLocalRestaurantRouteSheetSnapshotsEqual = (
  left: SearchOverlayLocalRestaurantRouteSheetSnapshot,
  right: SearchOverlayLocalRestaurantRouteSheetSnapshot
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.resultsSheetRuntimeOwner === right.resultsSheetRuntimeOwner);

export class SearchOverlayLocalRestaurantRouteSheetStateController {
  private routeResultsSheetVisual: RouteResultsSheetVisualBinding;

  private snapshot: SearchOverlayLocalRestaurantRouteSheetSnapshot;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRouteResultsSheetVisual: () => void;

  public readonly outputAuthority: SearchOverlayLocalRestaurantRouteSheetAuthority;

  constructor({
    routeResultsSheetVisualAuthority,
  }: {
    routeResultsSheetVisualAuthority: {
      subscribe: (listener: Listener) => () => void;
      getSnapshot: () => RouteResultsSheetVisualBinding;
    };
  }) {
    this.routeResultsSheetVisual = routeResultsSheetVisualAuthority.getSnapshot();
    this.snapshot = resolveLocalRestaurantRouteSheetSnapshot(
      this.routeResultsSheetVisual
    );
    this.outputAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
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
    this.recompute();
  }

  private recompute(): void {
    const nextSnapshot = resolveLocalRestaurantRouteSheetSnapshot(
      this.routeResultsSheetVisual
    );

    if (areLocalRestaurantRouteSheetSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createSearchOverlayLocalRestaurantRouteSheetStateController = ({
  routeResultsSheetVisualAuthority,
}: ConstructorParameters<
  typeof SearchOverlayLocalRestaurantRouteSheetStateController
>[0]): SearchOverlayLocalRestaurantRouteSheetStateController =>
  new SearchOverlayLocalRestaurantRouteSheetStateController({
    routeResultsSheetVisualAuthority,
  });
