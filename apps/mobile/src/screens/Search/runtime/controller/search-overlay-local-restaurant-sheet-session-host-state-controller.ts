import type { SearchOverlayLocalRestaurantSheetHostSnapshot } from '../shared/search-overlay-local-restaurant-sheet-host-snapshot-contract';
import type { SearchOverlayLocalRestaurantSessionHostAuthority } from '../shared/search-root-host-authority-contract';

type Listener = () => void;

export type SearchOverlayLocalRestaurantSheetSessionHostSnapshot = Pick<
  SearchOverlayLocalRestaurantSheetHostSnapshot,
  'restaurantSessionSnapshot'
>;

export type SearchOverlayLocalRestaurantSheetSessionHostAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchOverlayLocalRestaurantSheetSessionHostSnapshot;
};

const createSessionHostSnapshot = (
  restaurantSessionSnapshot: ReturnType<
    SearchOverlayLocalRestaurantSessionHostAuthority['getSnapshot']
  >
): SearchOverlayLocalRestaurantSheetSessionHostSnapshot => ({
  restaurantSessionSnapshot,
});

export class SearchOverlayLocalRestaurantSheetSessionHostStateController {
  private restaurantSessionSnapshot: ReturnType<
    SearchOverlayLocalRestaurantSessionHostAuthority['getSnapshot']
  >;

  private snapshot: SearchOverlayLocalRestaurantSheetSessionHostSnapshot;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRestaurantSession: () => void;

  public readonly outputAuthority: SearchOverlayLocalRestaurantSheetSessionHostAuthority;

  constructor({
    overlayLocalRestaurantSessionHostAuthority,
  }: {
    overlayLocalRestaurantSessionHostAuthority: SearchOverlayLocalRestaurantSessionHostAuthority;
  }) {
    this.restaurantSessionSnapshot =
      overlayLocalRestaurantSessionHostAuthority.getSnapshot();
    this.snapshot = createSessionHostSnapshot(this.restaurantSessionSnapshot);
    this.outputAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.unsubscribeRestaurantSession =
      overlayLocalRestaurantSessionHostAuthority.subscribe(() => {
        this.setRestaurantSessionSnapshot(
          overlayLocalRestaurantSessionHostAuthority.getSnapshot()
        );
      });
  }

  public dispose(): void {
    this.unsubscribeRestaurantSession();
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setRestaurantSessionSnapshot(
    restaurantSessionSnapshot: ReturnType<
      SearchOverlayLocalRestaurantSessionHostAuthority['getSnapshot']
    >
  ): void {
    if (this.restaurantSessionSnapshot === restaurantSessionSnapshot) {
      return;
    }
    this.restaurantSessionSnapshot = restaurantSessionSnapshot;
    this.recompute();
  }

  private recompute(): void {
    const nextSnapshot = createSessionHostSnapshot(
      this.restaurantSessionSnapshot
    );

    if (
      this.snapshot.restaurantSessionSnapshot ===
      nextSnapshot.restaurantSessionSnapshot
    ) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createSearchOverlayLocalRestaurantSheetSessionHostStateController =
  ({
    overlayLocalRestaurantSessionHostAuthority,
  }: ConstructorParameters<
    typeof SearchOverlayLocalRestaurantSheetSessionHostStateController
  >[0]): SearchOverlayLocalRestaurantSheetSessionHostStateController =>
    new SearchOverlayLocalRestaurantSheetSessionHostStateController({
      overlayLocalRestaurantSessionHostAuthority,
    });
