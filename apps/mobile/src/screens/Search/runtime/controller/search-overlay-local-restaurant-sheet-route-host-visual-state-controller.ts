import type { SearchOverlayLocalRestaurantSheetVisualSnapshot } from '../shared/search-overlay-local-restaurant-sheet-visual-snapshot-contract';
import type { SearchOverlayLocalRestaurantRouteVisualAuthority } from './search-overlay-local-restaurant-route-visual-state-controller';

type Listener = () => void;

export type SearchOverlayLocalRestaurantSheetRouteHostVisualSnapshot = Pick<
  SearchOverlayLocalRestaurantSheetVisualSnapshot,
  'routeHostVisualSnapshot'
>;

export type SearchOverlayLocalRestaurantSheetRouteHostVisualAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchOverlayLocalRestaurantSheetRouteHostVisualSnapshot;
};

const createRouteHostVisualSnapshot = (
  routeVisualSnapshot: ReturnType<
    SearchOverlayLocalRestaurantRouteVisualAuthority['getSnapshot']
  >
): SearchOverlayLocalRestaurantSheetRouteHostVisualSnapshot => ({
  routeHostVisualSnapshot: routeVisualSnapshot,
});

const areRouteHostVisualSnapshotsEqual = (
  left: SearchOverlayLocalRestaurantSheetRouteHostVisualSnapshot,
  right: SearchOverlayLocalRestaurantSheetRouteHostVisualSnapshot
): boolean =>
  left.routeHostVisualSnapshot === right.routeHostVisualSnapshot ||
  (left.routeHostVisualSnapshot != null &&
    right.routeHostVisualSnapshot != null &&
    left.routeHostVisualSnapshot.overlayGeometryRuntime ===
      right.routeHostVisualSnapshot.overlayGeometryRuntime &&
    left.routeHostVisualSnapshot.resultsSheetRuntimeOwner ===
      right.routeHostVisualSnapshot.resultsSheetRuntimeOwner &&
    left.routeHostVisualSnapshot.visualRuntime ===
      right.routeHostVisualSnapshot.visualRuntime);

export class SearchOverlayLocalRestaurantSheetRouteHostVisualStateController {
  private routeVisualSnapshot: ReturnType<
    SearchOverlayLocalRestaurantRouteVisualAuthority['getSnapshot']
  >;

  private snapshot: SearchOverlayLocalRestaurantSheetRouteHostVisualSnapshot;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRouteVisual: () => void;

  public readonly outputAuthority: SearchOverlayLocalRestaurantSheetRouteHostVisualAuthority;

  constructor({
    localRestaurantRouteVisualAuthority,
  }: {
    localRestaurantRouteVisualAuthority: SearchOverlayLocalRestaurantRouteVisualAuthority;
  }) {
    this.routeVisualSnapshot = localRestaurantRouteVisualAuthority.getSnapshot();
    this.snapshot = createRouteHostVisualSnapshot(this.routeVisualSnapshot);
    this.outputAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.unsubscribeRouteVisual =
      localRestaurantRouteVisualAuthority.subscribe(() => {
        this.setRouteVisualSnapshot(
          localRestaurantRouteVisualAuthority.getSnapshot()
        );
      });
  }

  public dispose(): void {
    this.unsubscribeRouteVisual();
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setRouteVisualSnapshot(
    routeVisualSnapshot: ReturnType<
      SearchOverlayLocalRestaurantRouteVisualAuthority['getSnapshot']
    >
  ): void {
    if (this.routeVisualSnapshot === routeVisualSnapshot) {
      return;
    }
    this.routeVisualSnapshot = routeVisualSnapshot;
    this.recompute();
  }

  private recompute(): void {
    const nextSnapshot = createRouteHostVisualSnapshot(
      this.routeVisualSnapshot
    );

    if (areRouteHostVisualSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createSearchOverlayLocalRestaurantSheetRouteHostVisualStateController =
  ({
    localRestaurantRouteVisualAuthority,
  }: ConstructorParameters<
    typeof SearchOverlayLocalRestaurantSheetRouteHostVisualStateController
  >[0]): SearchOverlayLocalRestaurantSheetRouteHostVisualStateController =>
    new SearchOverlayLocalRestaurantSheetRouteHostVisualStateController({
      localRestaurantRouteVisualAuthority,
    });
