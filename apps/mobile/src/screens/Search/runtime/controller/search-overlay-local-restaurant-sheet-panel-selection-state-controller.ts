import type { SearchOverlayLocalRestaurantPanelContentHostAuthority } from '../shared/search-root-host-authority-contract';
import type { RouteLocalRestaurantOverlayControlSelectionSnapshot } from '../shared/route-local-restaurant-overlay-control-selection-snapshot-contract';

type Listener = () => void;

export type SearchOverlayLocalRestaurantSheetPanelSelectionSnapshot = Pick<
  RouteLocalRestaurantOverlayControlSelectionSnapshot,
  'restaurantPanelSnapshot' | 'suggestionProgress'
>;

export type SearchOverlayLocalRestaurantSheetPanelSelectionAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchOverlayLocalRestaurantSheetPanelSelectionSnapshot;
};

const arePanelSelectionSnapshotsEqual = (
  left: SearchOverlayLocalRestaurantSheetPanelSelectionSnapshot,
  right: SearchOverlayLocalRestaurantSheetPanelSelectionSnapshot
): boolean =>
  left.restaurantPanelSnapshot === right.restaurantPanelSnapshot &&
  left.suggestionProgress === right.suggestionProgress;

const createPanelSelectionSnapshot = (
  restaurantPanelContentSnapshot: ReturnType<
    SearchOverlayLocalRestaurantPanelContentHostAuthority['getSnapshot']
  >
): SearchOverlayLocalRestaurantSheetPanelSelectionSnapshot => ({
  restaurantPanelSnapshot: restaurantPanelContentSnapshot.restaurantPanelSnapshot,
  suggestionProgress: restaurantPanelContentSnapshot.suggestionProgress,
});

export class SearchOverlayLocalRestaurantSheetPanelSelectionStateController {
  private restaurantPanelContentSnapshot: ReturnType<
    SearchOverlayLocalRestaurantPanelContentHostAuthority['getSnapshot']
  >;

  private snapshot: SearchOverlayLocalRestaurantSheetPanelSelectionSnapshot;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRestaurantPanelContent: () => void;

  public readonly outputAuthority: SearchOverlayLocalRestaurantSheetPanelSelectionAuthority;

  constructor({
    overlayLocalRestaurantPanelContentHostAuthority,
  }: {
    overlayLocalRestaurantPanelContentHostAuthority: SearchOverlayLocalRestaurantPanelContentHostAuthority;
  }) {
    this.restaurantPanelContentSnapshot =
      overlayLocalRestaurantPanelContentHostAuthority.getSnapshot();
    this.snapshot = createPanelSelectionSnapshot(
      this.restaurantPanelContentSnapshot
    );
    this.outputAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.unsubscribeRestaurantPanelContent =
      overlayLocalRestaurantPanelContentHostAuthority.subscribe(() => {
        this.setRestaurantPanelContentSnapshot(
          overlayLocalRestaurantPanelContentHostAuthority.getSnapshot()
        );
      });
  }

  public dispose(): void {
    this.unsubscribeRestaurantPanelContent();
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setRestaurantPanelContentSnapshot(
    restaurantPanelContentSnapshot: ReturnType<
      SearchOverlayLocalRestaurantPanelContentHostAuthority['getSnapshot']
    >
  ): void {
    if (this.restaurantPanelContentSnapshot === restaurantPanelContentSnapshot) {
      return;
    }
    this.restaurantPanelContentSnapshot = restaurantPanelContentSnapshot;
    this.recompute();
  }

  private recompute(): void {
    const nextSnapshot = createPanelSelectionSnapshot(
      this.restaurantPanelContentSnapshot
    );

    if (arePanelSelectionSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createSearchOverlayLocalRestaurantSheetPanelSelectionStateController =
  ({
    overlayLocalRestaurantPanelContentHostAuthority,
  }: ConstructorParameters<
    typeof SearchOverlayLocalRestaurantSheetPanelSelectionStateController
  >[0]): SearchOverlayLocalRestaurantSheetPanelSelectionStateController =>
    new SearchOverlayLocalRestaurantSheetPanelSelectionStateController({
      overlayLocalRestaurantPanelContentHostAuthority,
    });
