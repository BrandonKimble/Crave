import type { SearchOverlayLocalRestaurantSheetHostSnapshot } from '../shared/search-overlay-local-restaurant-sheet-host-snapshot-contract';
import type { SearchOverlayLocalRestaurantSheetVisualAuthority } from './search-overlay-local-restaurant-sheet-visual-state-controller';

type Listener = () => void;

export type SearchOverlayLocalRestaurantSheetVisualHostSnapshot = Pick<
  SearchOverlayLocalRestaurantSheetHostSnapshot,
  'shouldRenderSearchOverlay' | 'routeHostVisualSnapshot' | 'onProfilerRender'
>;

export type SearchOverlayLocalRestaurantSheetVisualHostAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchOverlayLocalRestaurantSheetVisualHostSnapshot;
};

const areVisualHostSnapshotsEqual = (
  left: SearchOverlayLocalRestaurantSheetVisualHostSnapshot,
  right: SearchOverlayLocalRestaurantSheetVisualHostSnapshot
): boolean =>
  left.shouldRenderSearchOverlay === right.shouldRenderSearchOverlay &&
  left.routeHostVisualSnapshot === right.routeHostVisualSnapshot &&
  left.onProfilerRender === right.onProfilerRender;

const createVisualHostSnapshot = (
  visualSnapshot: ReturnType<SearchOverlayLocalRestaurantSheetVisualAuthority['getSnapshot']>
): SearchOverlayLocalRestaurantSheetVisualHostSnapshot => ({
  shouldRenderSearchOverlay: visualSnapshot.shouldRenderSearchOverlay,
  routeHostVisualSnapshot: visualSnapshot.routeHostVisualSnapshot,
  onProfilerRender: visualSnapshot.onProfilerRender,
});

export class SearchOverlayLocalRestaurantSheetVisualHostStateController {
  private visualSnapshot: ReturnType<
    SearchOverlayLocalRestaurantSheetVisualAuthority['getSnapshot']
  >;

  private snapshot: SearchOverlayLocalRestaurantSheetVisualHostSnapshot;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribeVisual: () => void;

  public readonly outputAuthority: SearchOverlayLocalRestaurantSheetVisualHostAuthority;

  constructor({
    overlayLocalRestaurantSheetVisualAuthority,
  }: {
    overlayLocalRestaurantSheetVisualAuthority: SearchOverlayLocalRestaurantSheetVisualAuthority;
  }) {
    this.visualSnapshot = overlayLocalRestaurantSheetVisualAuthority.getSnapshot();
    this.snapshot = createVisualHostSnapshot(this.visualSnapshot);
    this.outputAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.unsubscribeVisual = overlayLocalRestaurantSheetVisualAuthority.subscribe(() => {
      this.setVisualSnapshot(overlayLocalRestaurantSheetVisualAuthority.getSnapshot());
    });
  }

  public dispose(): void {
    this.unsubscribeVisual();
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setVisualSnapshot(
    visualSnapshot: ReturnType<SearchOverlayLocalRestaurantSheetVisualAuthority['getSnapshot']>
  ): void {
    if (this.visualSnapshot === visualSnapshot) {
      return;
    }
    this.visualSnapshot = visualSnapshot;
    this.recompute();
  }

  private recompute(): void {
    const nextSnapshot = createVisualHostSnapshot(this.visualSnapshot);

    if (areVisualHostSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createSearchOverlayLocalRestaurantSheetVisualHostStateController = ({
  overlayLocalRestaurantSheetVisualAuthority,
}: ConstructorParameters<
  typeof SearchOverlayLocalRestaurantSheetVisualHostStateController
>[0]): SearchOverlayLocalRestaurantSheetVisualHostStateController =>
  new SearchOverlayLocalRestaurantSheetVisualHostStateController({
    overlayLocalRestaurantSheetVisualAuthority,
  });
