import type { SearchOverlayLocalRestaurantSheetHostSnapshot } from '../shared/search-overlay-local-restaurant-sheet-host-snapshot-contract';
import type {
  SearchOverlayLocalRestaurantSessionHostAuthority,
  SearchOverlayLocalRestaurantSheetHostAuthority,
} from '../shared/search-root-host-authority-contract';
import type { SearchOverlayLocalRestaurantSheetControlSelectionAuthority } from './search-overlay-local-restaurant-sheet-control-selection-state-controller';
import type { SearchOverlayLocalRestaurantSheetVisualAuthority } from './search-overlay-local-restaurant-sheet-visual-state-controller';

type Listener = () => void;

export class SearchOverlayLocalRestaurantSheetHostController {
  private restaurantSessionSnapshot: ReturnType<
    SearchOverlayLocalRestaurantSessionHostAuthority['getSnapshot']
  >;

  private controlSelectionSnapshot: ReturnType<
    SearchOverlayLocalRestaurantSheetControlSelectionAuthority['getSnapshot']
  >;

  private visualHostSnapshot: ReturnType<
    SearchOverlayLocalRestaurantSheetVisualAuthority['getSnapshot']
  >;

  private snapshot: SearchOverlayLocalRestaurantSheetHostSnapshot;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribers: Array<() => void> = [];

  public readonly outputAuthority: SearchOverlayLocalRestaurantSheetHostAuthority;

  constructor({
    overlayLocalRestaurantSessionHostAuthority,
    localRestaurantSheetControlSelectionAuthority,
    localRestaurantSheetVisualHostAuthority,
  }: {
    overlayLocalRestaurantSessionHostAuthority: SearchOverlayLocalRestaurantSessionHostAuthority;
    localRestaurantSheetControlSelectionAuthority: SearchOverlayLocalRestaurantSheetControlSelectionAuthority;
    localRestaurantSheetVisualHostAuthority: SearchOverlayLocalRestaurantSheetVisualAuthority;
  }) {
    this.restaurantSessionSnapshot = overlayLocalRestaurantSessionHostAuthority.getSnapshot();
    this.controlSelectionSnapshot = localRestaurantSheetControlSelectionAuthority.getSnapshot();
    this.visualHostSnapshot = localRestaurantSheetVisualHostAuthority.getSnapshot();
    this.snapshot = this.resolveSnapshot();
    this.outputAuthority = {
      subscribe: this.subscribe.bind(this),
      getSnapshot: this.getSnapshot.bind(this),
    };

    this.unsubscribers.push(
      overlayLocalRestaurantSessionHostAuthority.subscribe(() => {
        this.setRestaurantSessionSnapshot(overlayLocalRestaurantSessionHostAuthority.getSnapshot());
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
      restaurantSessionSnapshot: this.restaurantSessionSnapshot,
      restaurantControlSelectionSnapshot: this.controlSelectionSnapshot,
      shouldRenderSearchOverlay: this.visualHostSnapshot.shouldRenderSearchOverlay,
      routeHostVisualSnapshot: this.visualHostSnapshot.routeHostVisualSnapshot,
      onProfilerRender: this.visualHostSnapshot.onProfilerRender,
    };
  }

  /**
   * F1606: this was the fourth hand-written comparator in the relay, and its
   * control-selection arm called the seven-field deep compare that its OWN PRODUCER had
   * just run — the ControlSelection authority only ever swaps that object when one of the
   * seven fields actually changed, so re-deriving the answer here could not change it.
   * Identity on all five slots is the derivation, not an approximation of it. The composite
   * transcript's publication counts are what hold it: weaken any slot to a constant and a
   * step's `publications` moves.
   */
  private matchesSnapshot(
    currentSnapshot: SearchOverlayLocalRestaurantSheetHostSnapshot,
    nextSnapshot: SearchOverlayLocalRestaurantSheetHostSnapshot
  ): boolean {
    return (
      currentSnapshot.restaurantSessionSnapshot === nextSnapshot.restaurantSessionSnapshot &&
      currentSnapshot.restaurantControlSelectionSnapshot ===
        nextSnapshot.restaurantControlSelectionSnapshot &&
      currentSnapshot.shouldRenderSearchOverlay === nextSnapshot.shouldRenderSearchOverlay &&
      currentSnapshot.routeHostVisualSnapshot === nextSnapshot.routeHostVisualSnapshot &&
      currentSnapshot.onProfilerRender === nextSnapshot.onProfilerRender
    );
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
    visualHostSnapshot: ReturnType<SearchOverlayLocalRestaurantSheetVisualAuthority['getSnapshot']>
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
  overlayLocalRestaurantSessionHostAuthority,
  localRestaurantSheetControlSelectionAuthority,
  localRestaurantSheetVisualHostAuthority,
}: ConstructorParameters<
  typeof SearchOverlayLocalRestaurantSheetHostController
>[0]): SearchOverlayLocalRestaurantSheetHostController =>
  new SearchOverlayLocalRestaurantSheetHostController({
    overlayLocalRestaurantSessionHostAuthority,
    localRestaurantSheetControlSelectionAuthority,
    localRestaurantSheetVisualHostAuthority,
  });
