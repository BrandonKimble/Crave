import {
  areRouteLocalRestaurantOverlayControlSelectionSnapshotsEqual,
  type RouteLocalRestaurantOverlayControlSelectionSnapshot,
} from '../shared/route-local-restaurant-overlay-control-selection-snapshot-contract';
import type {
  SearchOverlayLocalRestaurantSheetInteractionSelectionAuthority,
  SearchOverlayLocalRestaurantSheetInteractionSelectionSnapshot,
} from './search-overlay-local-restaurant-sheet-interaction-selection-state-controller';
import type {
  SearchOverlayLocalRestaurantSheetPanelSelectionAuthority,
  SearchOverlayLocalRestaurantSheetPanelSelectionSnapshot,
} from './search-overlay-local-restaurant-sheet-panel-selection-state-controller';
import type {
  SearchOverlayLocalRestaurantSheetPolicySelectionAuthority,
  SearchOverlayLocalRestaurantSheetPolicySelectionSnapshot,
} from './search-overlay-local-restaurant-sheet-policy-selection-state-controller';

type Listener = () => void;

export type SearchOverlayLocalRestaurantSheetControlSelectionAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => RouteLocalRestaurantOverlayControlSelectionSnapshot;
};

const createControlSelectionSnapshot = ({
  panelSelectionSnapshot,
  policySelectionSnapshot,
  interactionSelectionSnapshot,
  onToggleFavorite,
  closeRestaurantProfile,
}: {
  panelSelectionSnapshot: SearchOverlayLocalRestaurantSheetPanelSelectionSnapshot;
  policySelectionSnapshot: SearchOverlayLocalRestaurantSheetPolicySelectionSnapshot;
  interactionSelectionSnapshot: SearchOverlayLocalRestaurantSheetInteractionSelectionSnapshot;
  onToggleFavorite: RouteLocalRestaurantOverlayControlSelectionSnapshot['onToggleFavorite'];
  closeRestaurantProfile: RouteLocalRestaurantOverlayControlSelectionSnapshot['closeRestaurantProfile'];
}): RouteLocalRestaurantOverlayControlSelectionSnapshot => ({
  restaurantPanelSnapshot: panelSelectionSnapshot.restaurantPanelSnapshot,
  suggestionProgress: panelSelectionSnapshot.suggestionProgress,
  shouldSuppressRestaurantOverlay: policySelectionSnapshot.shouldSuppressRestaurantOverlay,
  shouldFreezeRestaurantPanelContent: policySelectionSnapshot.shouldFreezeRestaurantPanelContent,
  shouldEnableRestaurantOverlayInteraction:
    policySelectionSnapshot.shouldEnableRestaurantOverlayInteraction,
  onToggleFavorite,
  closeRestaurantProfile,
});

export class SearchOverlayLocalRestaurantSheetControlSelectionStateController {
  private panelSelectionSnapshot: SearchOverlayLocalRestaurantSheetPanelSelectionSnapshot;

  private policySelectionSnapshot: SearchOverlayLocalRestaurantSheetPolicySelectionSnapshot;

  private interactionSelectionSnapshot: SearchOverlayLocalRestaurantSheetInteractionSelectionSnapshot;

  private snapshot: RouteLocalRestaurantOverlayControlSelectionSnapshot;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribers: Array<() => void> = [];

  public readonly outputAuthority: SearchOverlayLocalRestaurantSheetControlSelectionAuthority;

  private readonly onToggleFavorite = (id: string, locationId?: string | null): void => {
    this.interactionSelectionSnapshot.onToggleFavorite(id, locationId);
  };

  private readonly closeRestaurantProfile = (): void => {
    this.interactionSelectionSnapshot.closeRestaurantProfile();
  };

  constructor({
    localRestaurantSheetPanelSelectionAuthority,
    localRestaurantSheetPolicySelectionAuthority,
    localRestaurantSheetInteractionSelectionAuthority,
  }: {
    localRestaurantSheetPanelSelectionAuthority: SearchOverlayLocalRestaurantSheetPanelSelectionAuthority;
    localRestaurantSheetPolicySelectionAuthority: SearchOverlayLocalRestaurantSheetPolicySelectionAuthority;
    localRestaurantSheetInteractionSelectionAuthority: SearchOverlayLocalRestaurantSheetInteractionSelectionAuthority;
  }) {
    this.panelSelectionSnapshot = localRestaurantSheetPanelSelectionAuthority.getSnapshot();
    this.policySelectionSnapshot = localRestaurantSheetPolicySelectionAuthority.getSnapshot();
    this.interactionSelectionSnapshot =
      localRestaurantSheetInteractionSelectionAuthority.getSnapshot();
    this.snapshot = createControlSelectionSnapshot({
      panelSelectionSnapshot: this.panelSelectionSnapshot,
      policySelectionSnapshot: this.policySelectionSnapshot,
      interactionSelectionSnapshot: this.interactionSelectionSnapshot,
      onToggleFavorite: this.onToggleFavorite,
      closeRestaurantProfile: this.closeRestaurantProfile,
    });
    this.outputAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.unsubscribers.push(
      localRestaurantSheetPanelSelectionAuthority.subscribe(() => {
        this.setPanelSelectionSnapshot(localRestaurantSheetPanelSelectionAuthority.getSnapshot());
      }),
      localRestaurantSheetPolicySelectionAuthority.subscribe(() => {
        this.setPolicySelectionSnapshot(localRestaurantSheetPolicySelectionAuthority.getSnapshot());
      }),
      localRestaurantSheetInteractionSelectionAuthority.subscribe(() => {
        this.setInteractionSelectionSnapshot(
          localRestaurantSheetInteractionSelectionAuthority.getSnapshot()
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

  private setPanelSelectionSnapshot(
    panelSelectionSnapshot: SearchOverlayLocalRestaurantSheetPanelSelectionSnapshot
  ): void {
    if (this.panelSelectionSnapshot === panelSelectionSnapshot) {
      return;
    }
    this.panelSelectionSnapshot = panelSelectionSnapshot;
    this.recompute();
  }

  private setPolicySelectionSnapshot(
    policySelectionSnapshot: SearchOverlayLocalRestaurantSheetPolicySelectionSnapshot
  ): void {
    if (this.policySelectionSnapshot === policySelectionSnapshot) {
      return;
    }
    this.policySelectionSnapshot = policySelectionSnapshot;
    this.recompute();
  }

  private setInteractionSelectionSnapshot(
    interactionSelectionSnapshot: SearchOverlayLocalRestaurantSheetInteractionSelectionSnapshot
  ): void {
    if (this.interactionSelectionSnapshot === interactionSelectionSnapshot) {
      return;
    }
    this.interactionSelectionSnapshot = interactionSelectionSnapshot;
    this.recompute();
  }

  private recompute(): void {
    const nextSnapshot = createControlSelectionSnapshot({
      panelSelectionSnapshot: this.panelSelectionSnapshot,
      policySelectionSnapshot: this.policySelectionSnapshot,
      interactionSelectionSnapshot: this.interactionSelectionSnapshot,
      onToggleFavorite: this.onToggleFavorite,
      closeRestaurantProfile: this.closeRestaurantProfile,
    });

    if (areRouteLocalRestaurantOverlayControlSelectionSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createSearchOverlayLocalRestaurantSheetControlSelectionStateController = ({
  localRestaurantSheetPanelSelectionAuthority,
  localRestaurantSheetPolicySelectionAuthority,
  localRestaurantSheetInteractionSelectionAuthority,
}: ConstructorParameters<
  typeof SearchOverlayLocalRestaurantSheetControlSelectionStateController
>[0]): SearchOverlayLocalRestaurantSheetControlSelectionStateController =>
  new SearchOverlayLocalRestaurantSheetControlSelectionStateController({
    localRestaurantSheetPanelSelectionAuthority,
    localRestaurantSheetPolicySelectionAuthority,
    localRestaurantSheetInteractionSelectionAuthority,
  });
