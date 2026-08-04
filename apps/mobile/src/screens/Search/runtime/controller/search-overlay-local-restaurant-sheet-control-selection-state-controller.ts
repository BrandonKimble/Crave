import {
  areRouteLocalRestaurantOverlayControlSelectionSnapshotsEqual,
  type RouteLocalRestaurantOverlayControlSelectionSnapshot,
} from '../shared/route-local-restaurant-overlay-control-selection-snapshot-contract';
import type {
  SearchOverlayLocalRestaurantInteractionHostAuthority,
  SearchOverlayLocalRestaurantPanelContentHostAuthority,
  SearchOverlayLocalRestaurantPolicyHostAuthority,
} from '../shared/search-root-host-authority-contract';

type Listener = () => void;

export type SearchOverlayLocalRestaurantSheetControlSelectionAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => RouteLocalRestaurantOverlayControlSelectionSnapshot;
};

type PanelContentSnapshot = ReturnType<
  SearchOverlayLocalRestaurantPanelContentHostAuthority['getSnapshot']
>;
type PolicySnapshot = ReturnType<SearchOverlayLocalRestaurantPolicyHostAuthority['getSnapshot']>;
type InteractionSnapshot = ReturnType<
  SearchOverlayLocalRestaurantInteractionHostAuthority['getSnapshot']
>;

/**
 * THE CONTROL-SELECTION AUTHORITY (D45/F958 Cluster A).
 *
 * Three single-source `Pick<>` controllers used to sit in front of this one — panel,
 * policy and interaction selection. Each was an honest subset projection, but each was
 * also fully SUBSUMED here: this controller's comparator already compares all seven
 * fields, so a source that re-mints with equal fields is deduped at this seam whether or
 * not an intermediate deduped it first. That equivalence is what the composite transcript
 * proves — the `re-minted, same fields` steps publish exactly as often as before.
 */
const createControlSelectionSnapshot = ({
  panelContentSnapshot,
  policySnapshot,
  onToggleFavorite,
  closeRestaurantProfile,
}: {
  panelContentSnapshot: PanelContentSnapshot;
  policySnapshot: PolicySnapshot;
  onToggleFavorite: RouteLocalRestaurantOverlayControlSelectionSnapshot['onToggleFavorite'];
  closeRestaurantProfile: RouteLocalRestaurantOverlayControlSelectionSnapshot['closeRestaurantProfile'];
}): RouteLocalRestaurantOverlayControlSelectionSnapshot => ({
  restaurantPanelSnapshot: panelContentSnapshot.restaurantPanelSnapshot,
  suggestionProgress: panelContentSnapshot.suggestionProgress,
  shouldSuppressRestaurantOverlay: policySnapshot.shouldSuppressRestaurantOverlay,
  shouldFreezeRestaurantPanelContent: policySnapshot.shouldFreezeRestaurantPanelContent,
  shouldEnableRestaurantOverlayInteraction: policySnapshot.shouldEnableRestaurantOverlayInteraction,
  onToggleFavorite,
  closeRestaurantProfile,
});

export class SearchOverlayLocalRestaurantSheetControlSelectionStateController {
  private panelContentSnapshot: PanelContentSnapshot;

  private policySnapshot: PolicySnapshot;

  private interactionSnapshot: InteractionSnapshot;

  private snapshot: RouteLocalRestaurantOverlayControlSelectionSnapshot;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribers: Array<() => void> = [];

  public readonly outputAuthority: SearchOverlayLocalRestaurantSheetControlSelectionAuthority;

  private readonly onToggleFavorite = (id: string, locationId?: string | null): void => {
    this.interactionSnapshot.onToggleFavorite(id, locationId);
  };

  private readonly closeRestaurantProfile = (): void => {
    this.interactionSnapshot.closeRestaurantProfile();
  };

  constructor({
    overlayLocalRestaurantPanelContentHostAuthority,
    overlayLocalRestaurantPolicyHostAuthority,
    overlayLocalRestaurantInteractionHostAuthority,
  }: {
    overlayLocalRestaurantPanelContentHostAuthority: SearchOverlayLocalRestaurantPanelContentHostAuthority;
    overlayLocalRestaurantPolicyHostAuthority: SearchOverlayLocalRestaurantPolicyHostAuthority;
    overlayLocalRestaurantInteractionHostAuthority: SearchOverlayLocalRestaurantInteractionHostAuthority;
  }) {
    this.panelContentSnapshot = overlayLocalRestaurantPanelContentHostAuthority.getSnapshot();
    this.policySnapshot = overlayLocalRestaurantPolicyHostAuthority.getSnapshot();
    this.interactionSnapshot = overlayLocalRestaurantInteractionHostAuthority.getSnapshot();
    this.snapshot = createControlSelectionSnapshot({
      panelContentSnapshot: this.panelContentSnapshot,
      policySnapshot: this.policySnapshot,
      onToggleFavorite: this.onToggleFavorite,
      closeRestaurantProfile: this.closeRestaurantProfile,
    });
    this.outputAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.unsubscribers.push(
      overlayLocalRestaurantPanelContentHostAuthority.subscribe(() => {
        this.setPanelContentSnapshot(overlayLocalRestaurantPanelContentHostAuthority.getSnapshot());
      }),
      overlayLocalRestaurantPolicyHostAuthority.subscribe(() => {
        this.setPolicySnapshot(overlayLocalRestaurantPolicyHostAuthority.getSnapshot());
      }),
      overlayLocalRestaurantInteractionHostAuthority.subscribe(() => {
        this.setInteractionSnapshot(overlayLocalRestaurantInteractionHostAuthority.getSnapshot());
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

  private setPanelContentSnapshot(panelContentSnapshot: PanelContentSnapshot): void {
    if (this.panelContentSnapshot === panelContentSnapshot) {
      return;
    }
    this.panelContentSnapshot = panelContentSnapshot;
    this.recompute();
  }

  private setPolicySnapshot(policySnapshot: PolicySnapshot): void {
    if (this.policySnapshot === policySnapshot) {
      return;
    }
    this.policySnapshot = policySnapshot;
    this.recompute();
  }

  /**
   * F1607: this path is a FRESHNESS WRITE, not a publication.
   *
   * The two interaction handlers reach consumers through the stable `onToggleFavorite` /
   * `closeRestaurantProfile` façades above, which read `this.interactionSnapshot` at call
   * time. So the published snapshot's fields are identical no matter how often the
   * interaction source re-mints — the recompute this used to trigger allocated a snapshot,
   * ran the seven-field comparator, and provably could never publish. Storing the snapshot
   * IS the whole job; the publish machinery on this path is gone.
   */
  private setInteractionSnapshot(interactionSnapshot: InteractionSnapshot): void {
    this.interactionSnapshot = interactionSnapshot;
  }

  private recompute(): void {
    const nextSnapshot = createControlSelectionSnapshot({
      panelContentSnapshot: this.panelContentSnapshot,
      policySnapshot: this.policySnapshot,
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
  overlayLocalRestaurantPanelContentHostAuthority,
  overlayLocalRestaurantPolicyHostAuthority,
  overlayLocalRestaurantInteractionHostAuthority,
}: ConstructorParameters<
  typeof SearchOverlayLocalRestaurantSheetControlSelectionStateController
>[0]): SearchOverlayLocalRestaurantSheetControlSelectionStateController =>
  new SearchOverlayLocalRestaurantSheetControlSelectionStateController({
    overlayLocalRestaurantPanelContentHostAuthority,
    overlayLocalRestaurantPolicyHostAuthority,
    overlayLocalRestaurantInteractionHostAuthority,
  });
