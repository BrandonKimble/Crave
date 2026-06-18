import type { SearchOverlayLocalRestaurantRouteVisualSnapshot } from '../shared/search-overlay-local-restaurant-sheet-visual-snapshot-contract';
import type {
  SearchOverlayLocalRestaurantRouteGeometryFrameAuthority,
  SearchOverlayLocalRestaurantRouteGeometryFrameSnapshot,
} from './search-overlay-local-restaurant-route-geometry-frame-state-controller';
import type {
  SearchOverlayLocalRestaurantRouteMotionFrameAuthority,
  SearchOverlayLocalRestaurantRouteMotionFrameSnapshot,
} from './search-overlay-local-restaurant-route-motion-frame-state-controller';
import type { SearchOverlayLocalRestaurantRouteFrameSnapshot } from './search-overlay-local-restaurant-route-frame-state-controller';
import type {
  SearchOverlayLocalRestaurantRouteSheetAuthority,
  SearchOverlayLocalRestaurantRouteSheetSnapshot,
} from './search-overlay-local-restaurant-route-sheet-state-controller';

type Listener = () => void;

const resolveLocalRestaurantRouteVisualSnapshot = ({
  routeFrameSnapshot,
  routeSheetSnapshot,
}: {
  routeFrameSnapshot: SearchOverlayLocalRestaurantRouteFrameSnapshot;
  routeSheetSnapshot: SearchOverlayLocalRestaurantRouteSheetSnapshot;
}): SearchOverlayLocalRestaurantRouteVisualSnapshot | null =>
  routeFrameSnapshot == null || routeSheetSnapshot == null
    ? null
    : {
        overlayGeometryRuntime: routeFrameSnapshot.overlayGeometryRuntime,
        sharedSheetRuntimeOwner: routeSheetSnapshot.sharedSheetRuntimeOwner,
        visualRuntime: routeFrameSnapshot.visualRuntime,
      };

const areLocalRestaurantRouteVisualSnapshotsEqual = (
  left: SearchOverlayLocalRestaurantRouteVisualSnapshot | null,
  right: SearchOverlayLocalRestaurantRouteVisualSnapshot | null
): boolean =>
  left === right ||
  (left != null &&
    right != null &&
    left.overlayGeometryRuntime === right.overlayGeometryRuntime &&
    left.sharedSheetRuntimeOwner === right.sharedSheetRuntimeOwner &&
    left.visualRuntime === right.visualRuntime);

export type SearchOverlayLocalRestaurantRouteVisualAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchOverlayLocalRestaurantRouteVisualSnapshot | null;
};

export class SearchOverlayLocalRestaurantRouteVisualStateController {
  private routeGeometryFrameSnapshot: SearchOverlayLocalRestaurantRouteGeometryFrameSnapshot;

  private routeMotionFrameSnapshot: SearchOverlayLocalRestaurantRouteMotionFrameSnapshot;

  private routeSheetSnapshot: SearchOverlayLocalRestaurantRouteSheetSnapshot;

  private snapshot: SearchOverlayLocalRestaurantRouteVisualSnapshot | null;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribers: Array<() => void> = [];

  public readonly outputAuthority: SearchOverlayLocalRestaurantRouteVisualAuthority;

  constructor({
    localRestaurantRouteGeometryFrameAuthority,
    localRestaurantRouteMotionFrameAuthority,
    localRestaurantRouteSheetAuthority,
  }: {
    localRestaurantRouteGeometryFrameAuthority: SearchOverlayLocalRestaurantRouteGeometryFrameAuthority;
    localRestaurantRouteMotionFrameAuthority: SearchOverlayLocalRestaurantRouteMotionFrameAuthority;
    localRestaurantRouteSheetAuthority: SearchOverlayLocalRestaurantRouteSheetAuthority;
  }) {
    this.routeGeometryFrameSnapshot = localRestaurantRouteGeometryFrameAuthority.getSnapshot();
    this.routeMotionFrameSnapshot = localRestaurantRouteMotionFrameAuthority.getSnapshot();
    this.routeSheetSnapshot = localRestaurantRouteSheetAuthority.getSnapshot();
    const routeFrameSnapshot =
      this.routeGeometryFrameSnapshot == null || this.routeMotionFrameSnapshot == null
        ? null
        : {
            overlayGeometryRuntime: this.routeGeometryFrameSnapshot.overlayGeometryRuntime,
            visualRuntime: this.routeMotionFrameSnapshot.visualRuntime,
          };
    this.snapshot = resolveLocalRestaurantRouteVisualSnapshot({
      routeFrameSnapshot,
      routeSheetSnapshot: this.routeSheetSnapshot,
    });
    this.outputAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.unsubscribers.push(
      localRestaurantRouteGeometryFrameAuthority.subscribe(() => {
        this.setRouteGeometryFrameSnapshot(
          localRestaurantRouteGeometryFrameAuthority.getSnapshot()
        );
      }),
      localRestaurantRouteMotionFrameAuthority.subscribe(() => {
        this.setRouteMotionFrameSnapshot(localRestaurantRouteMotionFrameAuthority.getSnapshot());
      }),
      localRestaurantRouteSheetAuthority.subscribe(() => {
        this.setRouteSheetSnapshot(localRestaurantRouteSheetAuthority.getSnapshot());
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

  private setRouteGeometryFrameSnapshot(
    routeGeometryFrameSnapshot: SearchOverlayLocalRestaurantRouteGeometryFrameSnapshot
  ): void {
    if (this.routeGeometryFrameSnapshot === routeGeometryFrameSnapshot) {
      return;
    }
    this.routeGeometryFrameSnapshot = routeGeometryFrameSnapshot;
    this.recompute();
  }

  private setRouteMotionFrameSnapshot(
    routeMotionFrameSnapshot: SearchOverlayLocalRestaurantRouteMotionFrameSnapshot
  ): void {
    if (this.routeMotionFrameSnapshot === routeMotionFrameSnapshot) {
      return;
    }
    this.routeMotionFrameSnapshot = routeMotionFrameSnapshot;
    this.recompute();
  }

  private setRouteSheetSnapshot(
    routeSheetSnapshot: SearchOverlayLocalRestaurantRouteSheetSnapshot
  ): void {
    if (this.routeSheetSnapshot === routeSheetSnapshot) {
      return;
    }
    this.routeSheetSnapshot = routeSheetSnapshot;
    this.recompute();
  }

  private recompute(): void {
    const routeFrameSnapshot =
      this.routeGeometryFrameSnapshot == null || this.routeMotionFrameSnapshot == null
        ? null
        : {
            overlayGeometryRuntime: this.routeGeometryFrameSnapshot.overlayGeometryRuntime,
            visualRuntime: this.routeMotionFrameSnapshot.visualRuntime,
          };
    const nextSnapshot = resolveLocalRestaurantRouteVisualSnapshot({
      routeFrameSnapshot,
      routeSheetSnapshot: this.routeSheetSnapshot,
    });

    if (areLocalRestaurantRouteVisualSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createSearchOverlayLocalRestaurantRouteVisualStateController = ({
  localRestaurantRouteGeometryFrameAuthority,
  localRestaurantRouteMotionFrameAuthority,
  localRestaurantRouteSheetAuthority,
}: ConstructorParameters<
  typeof SearchOverlayLocalRestaurantRouteVisualStateController
>[0]): SearchOverlayLocalRestaurantRouteVisualStateController =>
  new SearchOverlayLocalRestaurantRouteVisualStateController({
    localRestaurantRouteGeometryFrameAuthority,
    localRestaurantRouteMotionFrameAuthority,
    localRestaurantRouteSheetAuthority,
  });
