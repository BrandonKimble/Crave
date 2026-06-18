import type { RouteOverlayVisibilityAuthority } from '../shared/route-authority-contract';

type Listener = () => void;

export type SearchOverlayLocalRestaurantSheetRenderVisibilitySnapshot = {
  shouldRenderSearchOverlay: boolean;
};

export type SearchOverlayLocalRestaurantSheetRenderVisibilityAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchOverlayLocalRestaurantSheetRenderVisibilitySnapshot;
};

const createRenderVisibilitySnapshot = (
  routeOverlayVisibilitySnapshot: ReturnType<RouteOverlayVisibilityAuthority['getSnapshot']>
): SearchOverlayLocalRestaurantSheetRenderVisibilitySnapshot => ({
  shouldRenderSearchOverlay: routeOverlayVisibilitySnapshot.shouldRenderSearchOverlay,
});

export class SearchOverlayLocalRestaurantSheetRenderVisibilityStateController {
  private routeOverlayVisibilitySnapshot: ReturnType<
    RouteOverlayVisibilityAuthority['getSnapshot']
  >;

  private snapshot: SearchOverlayLocalRestaurantSheetRenderVisibilitySnapshot;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRouteOverlayVisibility: () => void;

  public readonly outputAuthority: SearchOverlayLocalRestaurantSheetRenderVisibilityAuthority;

  constructor({
    routeOverlayVisibilityAuthority,
  }: {
    routeOverlayVisibilityAuthority: RouteOverlayVisibilityAuthority;
  }) {
    this.routeOverlayVisibilitySnapshot = routeOverlayVisibilityAuthority.getSnapshot();
    this.snapshot = createRenderVisibilitySnapshot(this.routeOverlayVisibilitySnapshot);
    this.outputAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.unsubscribeRouteOverlayVisibility = routeOverlayVisibilityAuthority.subscribe(() => {
      this.setRouteOverlayVisibilitySnapshot(routeOverlayVisibilityAuthority.getSnapshot());
    });
  }

  public dispose(): void {
    this.unsubscribeRouteOverlayVisibility();
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setRouteOverlayVisibilitySnapshot(
    routeOverlayVisibilitySnapshot: ReturnType<RouteOverlayVisibilityAuthority['getSnapshot']>
  ): void {
    if (this.routeOverlayVisibilitySnapshot === routeOverlayVisibilitySnapshot) {
      return;
    }
    this.routeOverlayVisibilitySnapshot = routeOverlayVisibilitySnapshot;
    this.recompute();
  }

  private recompute(): void {
    const nextSnapshot = createRenderVisibilitySnapshot(this.routeOverlayVisibilitySnapshot);

    if (this.snapshot.shouldRenderSearchOverlay === nextSnapshot.shouldRenderSearchOverlay) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createSearchOverlayLocalRestaurantSheetRenderVisibilityStateController = ({
  routeOverlayVisibilityAuthority,
}: ConstructorParameters<
  typeof SearchOverlayLocalRestaurantSheetRenderVisibilityStateController
>[0]): SearchOverlayLocalRestaurantSheetRenderVisibilityStateController =>
  new SearchOverlayLocalRestaurantSheetRenderVisibilityStateController({
    routeOverlayVisibilityAuthority,
  });
