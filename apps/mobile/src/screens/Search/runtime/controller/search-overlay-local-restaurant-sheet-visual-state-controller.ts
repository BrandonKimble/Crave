import type { SearchOverlayLocalRestaurantSheetVisualSnapshot } from '../shared/search-overlay-local-restaurant-sheet-visual-snapshot-contract';
import type {
  SearchOverlayLocalRestaurantSheetRenderVisualAuthority,
  SearchOverlayLocalRestaurantSheetRenderVisualSnapshot,
} from './search-overlay-local-restaurant-sheet-render-visual-state-controller';
import type {
  SearchOverlayLocalRestaurantSheetRouteHostVisualAuthority,
  SearchOverlayLocalRestaurantSheetRouteHostVisualSnapshot,
} from './search-overlay-local-restaurant-sheet-route-host-visual-state-controller';

type Listener = () => void;

const areSearchOverlayLocalRestaurantSheetVisualSnapshotsEqual = (
  left: SearchOverlayLocalRestaurantSheetVisualSnapshot,
  right: SearchOverlayLocalRestaurantSheetVisualSnapshot
): boolean =>
  left.shouldRenderSearchOverlay === right.shouldRenderSearchOverlay &&
  left.routeHostVisualSnapshot === right.routeHostVisualSnapshot &&
  left.onProfilerRender === right.onProfilerRender;

const createSearchOverlayLocalRestaurantSheetVisualSnapshot = ({
  renderVisualSnapshot,
  routeHostVisualSnapshot,
}: {
  renderVisualSnapshot: SearchOverlayLocalRestaurantSheetRenderVisualSnapshot;
  routeHostVisualSnapshot: SearchOverlayLocalRestaurantSheetRouteHostVisualSnapshot;
}): SearchOverlayLocalRestaurantSheetVisualSnapshot => ({
  shouldRenderSearchOverlay: renderVisualSnapshot.shouldRenderSearchOverlay,
  routeHostVisualSnapshot: routeHostVisualSnapshot.routeHostVisualSnapshot,
  onProfilerRender: renderVisualSnapshot.onProfilerRender,
});

export type SearchOverlayLocalRestaurantSheetVisualAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchOverlayLocalRestaurantSheetVisualSnapshot;
};

export class SearchOverlayLocalRestaurantSheetVisualStateController {
  private renderVisualSnapshot: SearchOverlayLocalRestaurantSheetRenderVisualSnapshot;

  private routeHostVisualSnapshot: SearchOverlayLocalRestaurantSheetRouteHostVisualSnapshot;

  private snapshot: SearchOverlayLocalRestaurantSheetVisualSnapshot;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribers: Array<() => void> = [];

  public readonly outputAuthority: SearchOverlayLocalRestaurantSheetVisualAuthority;

  constructor({
    localRestaurantSheetRenderVisualAuthority,
    localRestaurantSheetRouteHostVisualAuthority,
  }: {
    localRestaurantSheetRenderVisualAuthority: SearchOverlayLocalRestaurantSheetRenderVisualAuthority;
    localRestaurantSheetRouteHostVisualAuthority: SearchOverlayLocalRestaurantSheetRouteHostVisualAuthority;
  }) {
    this.renderVisualSnapshot = localRestaurantSheetRenderVisualAuthority.getSnapshot();
    this.routeHostVisualSnapshot =
      localRestaurantSheetRouteHostVisualAuthority.getSnapshot();
    this.snapshot = createSearchOverlayLocalRestaurantSheetVisualSnapshot({
      renderVisualSnapshot: this.renderVisualSnapshot,
      routeHostVisualSnapshot: this.routeHostVisualSnapshot,
    });
    this.outputAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.unsubscribers.push(
      localRestaurantSheetRenderVisualAuthority.subscribe(() => {
        this.setRenderVisualSnapshot(
          localRestaurantSheetRenderVisualAuthority.getSnapshot()
        );
      }),
      localRestaurantSheetRouteHostVisualAuthority.subscribe(() => {
        this.setRouteHostVisualSnapshot(
          localRestaurantSheetRouteHostVisualAuthority.getSnapshot()
        );
      })
    );
  }

  public dispose(): void {
    this.unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.unsubscribers.length = 0;
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setRenderVisualSnapshot(
    renderVisualSnapshot: SearchOverlayLocalRestaurantSheetRenderVisualSnapshot
  ): void {
    if (this.renderVisualSnapshot === renderVisualSnapshot) {
      return;
    }
    this.renderVisualSnapshot = renderVisualSnapshot;
    this.recompute();
  }

  private setRouteHostVisualSnapshot(
    routeHostVisualSnapshot: SearchOverlayLocalRestaurantSheetRouteHostVisualSnapshot
  ): void {
    if (this.routeHostVisualSnapshot === routeHostVisualSnapshot) {
      return;
    }
    this.routeHostVisualSnapshot = routeHostVisualSnapshot;
    this.recompute();
  }

  private recompute(): void {
    const nextSnapshot = createSearchOverlayLocalRestaurantSheetVisualSnapshot({
      renderVisualSnapshot: this.renderVisualSnapshot,
      routeHostVisualSnapshot: this.routeHostVisualSnapshot,
    });

    if (
      areSearchOverlayLocalRestaurantSheetVisualSnapshotsEqual(
        this.snapshot,
        nextSnapshot
      )
    ) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createSearchOverlayLocalRestaurantSheetVisualStateController = ({
  localRestaurantSheetRenderVisualAuthority,
  localRestaurantSheetRouteHostVisualAuthority,
}: ConstructorParameters<typeof SearchOverlayLocalRestaurantSheetVisualStateController>[0]): SearchOverlayLocalRestaurantSheetVisualStateController =>
  new SearchOverlayLocalRestaurantSheetVisualStateController({
    localRestaurantSheetRenderVisualAuthority,
    localRestaurantSheetRouteHostVisualAuthority,
  });
