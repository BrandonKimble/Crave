import type { SearchOverlayLocalRestaurantSheetVisualSnapshot } from '../shared/search-overlay-local-restaurant-sheet-visual-snapshot-contract';
import type { SearchOverlayLocalRestaurantSheetPresenceAuthority } from './search-overlay-local-restaurant-sheet-presence-state-controller';

type Listener = () => void;

export type SearchOverlayLocalRestaurantSheetRenderVisualSnapshot = Pick<
  SearchOverlayLocalRestaurantSheetVisualSnapshot,
  'shouldRenderSearchOverlay' | 'onProfilerRender'
>;

export type SearchOverlayLocalRestaurantSheetRenderVisualAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchOverlayLocalRestaurantSheetRenderVisualSnapshot;
};

const areRenderVisualSnapshotsEqual = (
  left: SearchOverlayLocalRestaurantSheetRenderVisualSnapshot,
  right: SearchOverlayLocalRestaurantSheetRenderVisualSnapshot
): boolean =>
  left.shouldRenderSearchOverlay === right.shouldRenderSearchOverlay &&
  left.onProfilerRender === right.onProfilerRender;

const createRenderVisualSnapshot = (
  presenceSnapshot: ReturnType<SearchOverlayLocalRestaurantSheetPresenceAuthority['getSnapshot']>
): SearchOverlayLocalRestaurantSheetRenderVisualSnapshot => ({
  shouldRenderSearchOverlay: presenceSnapshot.shouldRenderSearchOverlay,
  onProfilerRender: presenceSnapshot.onProfilerRender,
});

export class SearchOverlayLocalRestaurantSheetRenderVisualStateController {
  private presenceSnapshot: ReturnType<
    SearchOverlayLocalRestaurantSheetPresenceAuthority['getSnapshot']
  >;

  private snapshot: SearchOverlayLocalRestaurantSheetRenderVisualSnapshot;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribePresence: () => void;

  public readonly outputAuthority: SearchOverlayLocalRestaurantSheetRenderVisualAuthority;

  constructor({
    localRestaurantSheetPresenceAuthority,
  }: {
    localRestaurantSheetPresenceAuthority: SearchOverlayLocalRestaurantSheetPresenceAuthority;
  }) {
    this.presenceSnapshot = localRestaurantSheetPresenceAuthority.getSnapshot();
    this.snapshot = createRenderVisualSnapshot(this.presenceSnapshot);
    this.outputAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.unsubscribePresence = localRestaurantSheetPresenceAuthority.subscribe(() => {
      this.setPresenceSnapshot(localRestaurantSheetPresenceAuthority.getSnapshot());
    });
  }

  public dispose(): void {
    this.unsubscribePresence();
    this.listeners.clear();
  }

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setPresenceSnapshot(
    presenceSnapshot: ReturnType<SearchOverlayLocalRestaurantSheetPresenceAuthority['getSnapshot']>
  ): void {
    if (this.presenceSnapshot === presenceSnapshot) {
      return;
    }
    this.presenceSnapshot = presenceSnapshot;
    this.recompute();
  }

  private recompute(): void {
    const nextSnapshot = createRenderVisualSnapshot(this.presenceSnapshot);

    if (areRenderVisualSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createSearchOverlayLocalRestaurantSheetRenderVisualStateController = ({
  localRestaurantSheetPresenceAuthority,
}: ConstructorParameters<
  typeof SearchOverlayLocalRestaurantSheetRenderVisualStateController
>[0]): SearchOverlayLocalRestaurantSheetRenderVisualStateController =>
  new SearchOverlayLocalRestaurantSheetRenderVisualStateController({
    localRestaurantSheetPresenceAuthority,
  });
