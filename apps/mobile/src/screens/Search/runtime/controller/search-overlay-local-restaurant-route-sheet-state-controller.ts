import type { RouteSharedSheetVisualBinding } from '../../../../navigation/runtime/route-shared-sheet-visual-state-controller';

type Listener = () => void;

export type SearchOverlayLocalRestaurantRouteSheetSnapshot = {
  sharedSheetRuntimeOwner: NonNullable<RouteSharedSheetVisualBinding>;
} | null;

export type SearchOverlayLocalRestaurantRouteSheetAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchOverlayLocalRestaurantRouteSheetSnapshot;
};

const resolveLocalRestaurantRouteSheetSnapshot = (
  routeSharedSheetVisual: RouteSharedSheetVisualBinding
): SearchOverlayLocalRestaurantRouteSheetSnapshot =>
  routeSharedSheetVisual == null
    ? null
    : {
        sharedSheetRuntimeOwner: routeSharedSheetVisual,
      };

const areLocalRestaurantRouteSheetSnapshotsEqual = (
  left: SearchOverlayLocalRestaurantRouteSheetSnapshot,
  right: SearchOverlayLocalRestaurantRouteSheetSnapshot
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.sharedSheetRuntimeOwner === right.sharedSheetRuntimeOwner);

export class SearchOverlayLocalRestaurantRouteSheetStateController {
  private routeSharedSheetVisual: RouteSharedSheetVisualBinding;

  private snapshot: SearchOverlayLocalRestaurantRouteSheetSnapshot;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRouteSharedSheetVisual: () => void;

  public readonly outputAuthority: SearchOverlayLocalRestaurantRouteSheetAuthority;

  constructor({
    routeSharedSheetVisualAuthority,
  }: {
    routeSharedSheetVisualAuthority: {
      subscribe: (listener: Listener) => () => void;
      getSnapshot: () => RouteSharedSheetVisualBinding;
    };
  }) {
    this.routeSharedSheetVisual = routeSharedSheetVisualAuthority.getSnapshot();
    this.snapshot = resolveLocalRestaurantRouteSheetSnapshot(
      this.routeSharedSheetVisual
    );
    this.outputAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
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
    this.recompute();
  }

  private recompute(): void {
    const nextSnapshot = resolveLocalRestaurantRouteSheetSnapshot(
      this.routeSharedSheetVisual
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
  routeSharedSheetVisualAuthority,
}: ConstructorParameters<
  typeof SearchOverlayLocalRestaurantRouteSheetStateController
>[0]): SearchOverlayLocalRestaurantRouteSheetStateController =>
  new SearchOverlayLocalRestaurantRouteSheetStateController({
    routeSharedSheetVisualAuthority,
  });
