import type { SearchOverlayLocalRestaurantSheetHostSnapshot } from '../shared/search-overlay-local-restaurant-sheet-host-snapshot-contract';
import type { SearchOverlayLocalRestaurantSheetHostAuthority } from '../shared/search-root-host-authority-contract';
import { areRouteLocalRestaurantOverlayControlSelectionSnapshotsEqual } from '../shared/route-local-restaurant-overlay-control-selection-snapshot-contract';
import type { SearchOverlayLocalRestaurantSheetControlSelectionAuthority } from './search-overlay-local-restaurant-sheet-control-selection-state-controller';
import type { SearchOverlayLocalRestaurantSheetSessionHostAuthority } from './search-overlay-local-restaurant-sheet-session-host-state-controller';
import type { SearchOverlayLocalRestaurantSheetVisualHostAuthority } from './search-overlay-local-restaurant-sheet-visual-host-state-controller';

type Listener = () => void;

export class SearchOverlayLocalRestaurantSheetHostController {
  private sessionHostSnapshot: ReturnType<
    SearchOverlayLocalRestaurantSheetSessionHostAuthority['getSnapshot']
  >;

  private controlSelectionSnapshot: ReturnType<
    SearchOverlayLocalRestaurantSheetControlSelectionAuthority['getSnapshot']
  >;

  private visualHostSnapshot: ReturnType<
    SearchOverlayLocalRestaurantSheetVisualHostAuthority['getSnapshot']
  >;

  private snapshot: SearchOverlayLocalRestaurantSheetHostSnapshot;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribers: Array<() => void> = [];

  public readonly outputAuthority: SearchOverlayLocalRestaurantSheetHostAuthority;

  constructor({
    localRestaurantSheetSessionHostAuthority,
    localRestaurantSheetControlSelectionAuthority,
    localRestaurantSheetVisualHostAuthority,
  }: {
    localRestaurantSheetSessionHostAuthority: SearchOverlayLocalRestaurantSheetSessionHostAuthority;
    localRestaurantSheetControlSelectionAuthority: SearchOverlayLocalRestaurantSheetControlSelectionAuthority;
    localRestaurantSheetVisualHostAuthority: SearchOverlayLocalRestaurantSheetVisualHostAuthority;
  }) {
    this.sessionHostSnapshot = localRestaurantSheetSessionHostAuthority.getSnapshot();
    this.controlSelectionSnapshot = localRestaurantSheetControlSelectionAuthority.getSnapshot();
    this.visualHostSnapshot = localRestaurantSheetVisualHostAuthority.getSnapshot();
    this.snapshot = this.resolveSnapshot();
    this.outputAuthority = {
      subscribe: this.subscribe.bind(this),
      getSnapshot: this.getSnapshot.bind(this),
    };

    this.unsubscribers.push(
      localRestaurantSheetSessionHostAuthority.subscribe(() => {
        this.setSessionHostSnapshot(localRestaurantSheetSessionHostAuthority.getSnapshot());
      }),
      localRestaurantSheetControlSelectionAuthority.subscribe(() => {
        this.setControlSelectionSnapshot(
          localRestaurantSheetControlSelectionAuthority.getSnapshot()
        );
      }),
      localRestaurantSheetVisualHostAuthority.subscribe(() => {
        this.setVisualHostSnapshot(localRestaurantSheetVisualHostAuthority.getSnapshot());
      })
    );
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private getSnapshot(): SearchOverlayLocalRestaurantSheetHostSnapshot {
    return this.snapshot;
  }

  private resolveSnapshot(): SearchOverlayLocalRestaurantSheetHostSnapshot {
    return {
      restaurantSessionSnapshot: this.sessionHostSnapshot.restaurantSessionSnapshot,
      restaurantControlSelectionSnapshot: this.controlSelectionSnapshot,
      shouldRenderSearchOverlay: this.visualHostSnapshot.shouldRenderSearchOverlay,
      routeHostVisualSnapshot: this.visualHostSnapshot.routeHostVisualSnapshot,
      onProfilerRender: this.visualHostSnapshot.onProfilerRender,
    };
  }

  private matchesSnapshot(
    currentSnapshot: SearchOverlayLocalRestaurantSheetHostSnapshot,
    nextSnapshot: SearchOverlayLocalRestaurantSheetHostSnapshot
  ): boolean {
    return (
      currentSnapshot.restaurantSessionSnapshot === nextSnapshot.restaurantSessionSnapshot &&
      areRouteLocalRestaurantOverlayControlSelectionSnapshotsEqual(
        currentSnapshot.restaurantControlSelectionSnapshot,
        nextSnapshot.restaurantControlSelectionSnapshot
      ) &&
      currentSnapshot.shouldRenderSearchOverlay === nextSnapshot.shouldRenderSearchOverlay &&
      currentSnapshot.routeHostVisualSnapshot === nextSnapshot.routeHostVisualSnapshot &&
      currentSnapshot.onProfilerRender === nextSnapshot.onProfilerRender
    );
  }

  private setSessionHostSnapshot(
    sessionHostSnapshot: ReturnType<
      SearchOverlayLocalRestaurantSheetSessionHostAuthority['getSnapshot']
    >
  ): void {
    if (this.sessionHostSnapshot === sessionHostSnapshot) {
      return;
    }
    this.sessionHostSnapshot = sessionHostSnapshot;
    this.recompute();
  }

  private setControlSelectionSnapshot(
    controlSelectionSnapshot: ReturnType<
      SearchOverlayLocalRestaurantSheetControlSelectionAuthority['getSnapshot']
    >
  ): void {
    if (this.controlSelectionSnapshot === controlSelectionSnapshot) {
      return;
    }
    this.controlSelectionSnapshot = controlSelectionSnapshot;
    this.recompute();
  }

  private setVisualHostSnapshot(
    visualHostSnapshot: ReturnType<
      SearchOverlayLocalRestaurantSheetVisualHostAuthority['getSnapshot']
    >
  ): void {
    if (this.visualHostSnapshot === visualHostSnapshot) {
      return;
    }
    this.visualHostSnapshot = visualHostSnapshot;
    this.recompute();
  }

  private recompute(): void {
    const nextSnapshot = this.resolveSnapshot();
    if (this.matchesSnapshot(this.snapshot, nextSnapshot)) {
      return;
    }
    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  public dispose(): void {
    this.unsubscribers.forEach((unsubscribe) => {
      unsubscribe();
    });
    this.unsubscribers.length = 0;
    this.listeners.clear();
  }
}

export const createSearchOverlayLocalRestaurantSheetHostController = ({
  localRestaurantSheetSessionHostAuthority,
  localRestaurantSheetControlSelectionAuthority,
  localRestaurantSheetVisualHostAuthority,
}: ConstructorParameters<
  typeof SearchOverlayLocalRestaurantSheetHostController
>[0]): SearchOverlayLocalRestaurantSheetHostController =>
  new SearchOverlayLocalRestaurantSheetHostController({
    localRestaurantSheetSessionHostAuthority,
    localRestaurantSheetControlSelectionAuthority,
    localRestaurantSheetVisualHostAuthority,
  });
