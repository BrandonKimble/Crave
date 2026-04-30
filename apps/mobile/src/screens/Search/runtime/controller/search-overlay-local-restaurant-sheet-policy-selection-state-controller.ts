import type { SearchOverlayLocalRestaurantPolicyHostAuthority } from '../shared/search-root-host-authority-contract';
import type { RouteLocalRestaurantOverlayControlSelectionSnapshot } from '../shared/route-local-restaurant-overlay-control-selection-snapshot-contract';

type Listener = () => void;

export type SearchOverlayLocalRestaurantSheetPolicySelectionSnapshot = Pick<
  RouteLocalRestaurantOverlayControlSelectionSnapshot,
  | 'shouldSuppressRestaurantOverlay'
  | 'shouldFreezeRestaurantPanelContent'
  | 'shouldEnableRestaurantOverlayInteraction'
>;

export type SearchOverlayLocalRestaurantSheetPolicySelectionAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchOverlayLocalRestaurantSheetPolicySelectionSnapshot;
};

const arePolicySelectionSnapshotsEqual = (
  left: SearchOverlayLocalRestaurantSheetPolicySelectionSnapshot,
  right: SearchOverlayLocalRestaurantSheetPolicySelectionSnapshot
): boolean =>
  left.shouldSuppressRestaurantOverlay ===
    right.shouldSuppressRestaurantOverlay &&
  left.shouldFreezeRestaurantPanelContent ===
    right.shouldFreezeRestaurantPanelContent &&
  left.shouldEnableRestaurantOverlayInteraction ===
    right.shouldEnableRestaurantOverlayInteraction;

const createPolicySelectionSnapshot = (
  restaurantPolicySnapshot: ReturnType<
    SearchOverlayLocalRestaurantPolicyHostAuthority['getSnapshot']
  >
): SearchOverlayLocalRestaurantSheetPolicySelectionSnapshot => ({
  shouldSuppressRestaurantOverlay:
    restaurantPolicySnapshot.shouldSuppressRestaurantOverlay,
  shouldFreezeRestaurantPanelContent:
    restaurantPolicySnapshot.shouldFreezeRestaurantPanelContent,
  shouldEnableRestaurantOverlayInteraction:
    restaurantPolicySnapshot.shouldEnableRestaurantOverlayInteraction,
});

export class SearchOverlayLocalRestaurantSheetPolicySelectionStateController {
  private restaurantPolicySnapshot: ReturnType<
    SearchOverlayLocalRestaurantPolicyHostAuthority['getSnapshot']
  >;

  private snapshot: SearchOverlayLocalRestaurantSheetPolicySelectionSnapshot;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeRestaurantPolicy: () => void;

  public readonly outputAuthority: SearchOverlayLocalRestaurantSheetPolicySelectionAuthority;

  constructor({
    overlayLocalRestaurantPolicyHostAuthority,
  }: {
    overlayLocalRestaurantPolicyHostAuthority: SearchOverlayLocalRestaurantPolicyHostAuthority;
  }) {
    this.restaurantPolicySnapshot =
      overlayLocalRestaurantPolicyHostAuthority.getSnapshot();
    this.snapshot = createPolicySelectionSnapshot(this.restaurantPolicySnapshot);
    this.outputAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.unsubscribeRestaurantPolicy =
      overlayLocalRestaurantPolicyHostAuthority.subscribe(() => {
        this.setRestaurantPolicySnapshot(
          overlayLocalRestaurantPolicyHostAuthority.getSnapshot()
        );
      });
  }

  public dispose(): void {
    this.unsubscribeRestaurantPolicy();
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setRestaurantPolicySnapshot(
    restaurantPolicySnapshot: ReturnType<
      SearchOverlayLocalRestaurantPolicyHostAuthority['getSnapshot']
    >
  ): void {
    if (this.restaurantPolicySnapshot === restaurantPolicySnapshot) {
      return;
    }
    this.restaurantPolicySnapshot = restaurantPolicySnapshot;
    this.recompute();
  }

  private recompute(): void {
    const nextSnapshot = createPolicySelectionSnapshot(
      this.restaurantPolicySnapshot
    );

    if (arePolicySelectionSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createSearchOverlayLocalRestaurantSheetPolicySelectionStateController =
  ({
    overlayLocalRestaurantPolicyHostAuthority,
  }: ConstructorParameters<
    typeof SearchOverlayLocalRestaurantSheetPolicySelectionStateController
  >[0]): SearchOverlayLocalRestaurantSheetPolicySelectionStateController =>
    new SearchOverlayLocalRestaurantSheetPolicySelectionStateController({
      overlayLocalRestaurantPolicyHostAuthority,
    });
