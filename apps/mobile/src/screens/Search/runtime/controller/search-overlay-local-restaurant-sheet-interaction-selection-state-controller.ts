import type { SearchOverlayLocalRestaurantInteractionHostAuthority } from '../shared/search-root-host-authority-contract';
import type { RouteLocalRestaurantOverlayControlSelectionSnapshot } from '../shared/route-local-restaurant-overlay-control-selection-snapshot-contract';

type Listener = () => void;

export type SearchOverlayLocalRestaurantSheetInteractionSelectionSnapshot = Pick<
  RouteLocalRestaurantOverlayControlSelectionSnapshot,
  'onToggleFavorite' | 'closeRestaurantProfile' | 'restaurantSheetSnapController'
>;

export type SearchOverlayLocalRestaurantSheetInteractionSelectionAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchOverlayLocalRestaurantSheetInteractionSelectionSnapshot;
};

const areInteractionSelectionSnapshotsEqual = (
  left: SearchOverlayLocalRestaurantSheetInteractionSelectionSnapshot,
  right: SearchOverlayLocalRestaurantSheetInteractionSelectionSnapshot
): boolean =>
  left.onToggleFavorite === right.onToggleFavorite &&
  left.closeRestaurantProfile === right.closeRestaurantProfile &&
  left.restaurantSheetSnapController === right.restaurantSheetSnapController;

const createInteractionSelectionSnapshot = (
  restaurantInteractionSnapshot: ReturnType<
    SearchOverlayLocalRestaurantInteractionHostAuthority['getSnapshot']
  >
): SearchOverlayLocalRestaurantSheetInteractionSelectionSnapshot => ({
  onToggleFavorite: restaurantInteractionSnapshot.onToggleFavorite,
  closeRestaurantProfile: restaurantInteractionSnapshot.closeRestaurantProfile,
  restaurantSheetSnapController:
    restaurantInteractionSnapshot.restaurantSheetSnapController,
});

export class SearchOverlayLocalRestaurantSheetInteractionSelectionStateController {
  private restaurantInteractionSnapshot: ReturnType<
    SearchOverlayLocalRestaurantInteractionHostAuthority['getSnapshot']
  >;

  private snapshot: SearchOverlayLocalRestaurantSheetInteractionSelectionSnapshot;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRestaurantInteraction: () => void;

  public readonly outputAuthority: SearchOverlayLocalRestaurantSheetInteractionSelectionAuthority;

  constructor({
    overlayLocalRestaurantInteractionHostAuthority,
  }: {
    overlayLocalRestaurantInteractionHostAuthority: SearchOverlayLocalRestaurantInteractionHostAuthority;
  }) {
    this.restaurantInteractionSnapshot =
      overlayLocalRestaurantInteractionHostAuthority.getSnapshot();
    this.snapshot = createInteractionSelectionSnapshot(
      this.restaurantInteractionSnapshot
    );
    this.outputAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.unsubscribeRestaurantInteraction =
      overlayLocalRestaurantInteractionHostAuthority.subscribe(() => {
        this.setRestaurantInteractionSnapshot(
          overlayLocalRestaurantInteractionHostAuthority.getSnapshot()
        );
      });
  }

  public dispose(): void {
    this.unsubscribeRestaurantInteraction();
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setRestaurantInteractionSnapshot(
    restaurantInteractionSnapshot: ReturnType<
      SearchOverlayLocalRestaurantInteractionHostAuthority['getSnapshot']
    >
  ): void {
    if (this.restaurantInteractionSnapshot === restaurantInteractionSnapshot) {
      return;
    }
    this.restaurantInteractionSnapshot = restaurantInteractionSnapshot;
    this.recompute();
  }

  private recompute(): void {
    const nextSnapshot = createInteractionSelectionSnapshot(
      this.restaurantInteractionSnapshot
    );

    if (areInteractionSelectionSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createSearchOverlayLocalRestaurantSheetInteractionSelectionStateController =
  ({
    overlayLocalRestaurantInteractionHostAuthority,
  }: ConstructorParameters<
    typeof SearchOverlayLocalRestaurantSheetInteractionSelectionStateController
  >[0]): SearchOverlayLocalRestaurantSheetInteractionSelectionStateController =>
    new SearchOverlayLocalRestaurantSheetInteractionSelectionStateController({
      overlayLocalRestaurantInteractionHostAuthority,
    });
