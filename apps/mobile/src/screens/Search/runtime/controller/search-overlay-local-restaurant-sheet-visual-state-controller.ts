import type { SearchOverlayLocalRestaurantSheetProfilerGateAuthority } from '../shared/search-overlay-local-restaurant-sheet-profiler-gate-snapshot-contract';
import type { SearchOverlayLocalRestaurantSheetVisualSnapshot } from '../shared/search-overlay-local-restaurant-sheet-visual-snapshot-contract';
import type { RouteOverlayVisibilityAuthority } from '../shared/route-authority-contract';
import type { SearchOverlayLocalRestaurantRouteVisualAuthority } from './search-overlay-local-restaurant-route-visual-state-controller';

type Listener = () => void;

type RouteOverlayVisibilitySnapshot = ReturnType<RouteOverlayVisibilityAuthority['getSnapshot']>;
type ProfilerGateSnapshot = ReturnType<
  SearchOverlayLocalRestaurantSheetProfilerGateAuthority['getSnapshot']
>;
type RouteVisualSnapshot = ReturnType<
  SearchOverlayLocalRestaurantRouteVisualAuthority['getSnapshot']
>;

/**
 * THE SHEET-VISUAL / PRESENCE AUTHORITY (D45/F958 Cluster A).
 *
 * Four controllers used to stand between the three sources and this snapshot:
 * render-visibility (`{shouldRenderSearchOverlay}`), presence (that bool + the profiler
 * callback), render-visual (an IDENTITY projection of presence, F1603) and route-host-visual
 * (a single-field wrap this controller unwrapped on the next line, F1605). Every one of them
 * allocated an object and ran a comparator; none of them could change what reached React.
 *
 * The comparator below is the ONE guard in the lane, and it is load-bearing in both
 * directions — it is what makes a source re-mint carrying unchanged values publish nothing.
 * The composite spec measures that directly (`publishes NOTHING when the visibility source
 * re-mints an unchanged boolean`); weakening any of the three comparisons turns that metric
 * RED. Note it is a genuine merge, not a rename: the presence-lane dedupe it replaced was
 * NOT observable at the terminal, because this comparator already absorbed every redundant
 * publish it suppressed.
 */
const areSearchOverlayLocalRestaurantSheetVisualSnapshotsEqual = (
  left: SearchOverlayLocalRestaurantSheetVisualSnapshot,
  right: SearchOverlayLocalRestaurantSheetVisualSnapshot
): boolean =>
  left.shouldRenderSearchOverlay === right.shouldRenderSearchOverlay &&
  left.routeHostVisualSnapshot === right.routeHostVisualSnapshot &&
  left.onProfilerRender === right.onProfilerRender;

const createSearchOverlayLocalRestaurantSheetVisualSnapshot = ({
  routeOverlayVisibilitySnapshot,
  profilerGateSnapshot,
  routeVisualSnapshot,
}: {
  routeOverlayVisibilitySnapshot: RouteOverlayVisibilitySnapshot;
  profilerGateSnapshot: ProfilerGateSnapshot;
  routeVisualSnapshot: RouteVisualSnapshot;
}): SearchOverlayLocalRestaurantSheetVisualSnapshot => ({
  shouldRenderSearchOverlay: routeOverlayVisibilitySnapshot.shouldRenderSearchOverlay,
  routeHostVisualSnapshot: routeVisualSnapshot,
  onProfilerRender: profilerGateSnapshot.onProfilerRender,
});

export type SearchOverlayLocalRestaurantSheetVisualAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchOverlayLocalRestaurantSheetVisualSnapshot;
};

export class SearchOverlayLocalRestaurantSheetVisualStateController {
  private routeOverlayVisibilitySnapshot: RouteOverlayVisibilitySnapshot;

  private profilerGateSnapshot: ProfilerGateSnapshot;

  private routeVisualSnapshot: RouteVisualSnapshot;

  private snapshot: SearchOverlayLocalRestaurantSheetVisualSnapshot;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribers: Array<() => void> = [];

  public readonly outputAuthority: SearchOverlayLocalRestaurantSheetVisualAuthority;

  constructor({
    routeOverlayVisibilityAuthority,
    localRestaurantSheetProfilerGateAuthority,
    localRestaurantRouteVisualAuthority,
  }: {
    routeOverlayVisibilityAuthority: RouteOverlayVisibilityAuthority;
    localRestaurantSheetProfilerGateAuthority: SearchOverlayLocalRestaurantSheetProfilerGateAuthority;
    localRestaurantRouteVisualAuthority: SearchOverlayLocalRestaurantRouteVisualAuthority;
  }) {
    this.routeOverlayVisibilitySnapshot = routeOverlayVisibilityAuthority.getSnapshot();
    this.profilerGateSnapshot = localRestaurantSheetProfilerGateAuthority.getSnapshot();
    this.routeVisualSnapshot = localRestaurantRouteVisualAuthority.getSnapshot();
    this.snapshot = createSearchOverlayLocalRestaurantSheetVisualSnapshot({
      routeOverlayVisibilitySnapshot: this.routeOverlayVisibilitySnapshot,
      profilerGateSnapshot: this.profilerGateSnapshot,
      routeVisualSnapshot: this.routeVisualSnapshot,
    });
    this.outputAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.unsubscribers.push(
      routeOverlayVisibilityAuthority.subscribe(() => {
        this.setRouteOverlayVisibilitySnapshot(routeOverlayVisibilityAuthority.getSnapshot());
      }),
      localRestaurantSheetProfilerGateAuthority.subscribe(() => {
        this.setProfilerGateSnapshot(localRestaurantSheetProfilerGateAuthority.getSnapshot());
      }),
      localRestaurantRouteVisualAuthority.subscribe(() => {
        this.setRouteVisualSnapshot(localRestaurantRouteVisualAuthority.getSnapshot());
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

  private setRouteOverlayVisibilitySnapshot(
    routeOverlayVisibilitySnapshot: RouteOverlayVisibilitySnapshot
  ): void {
    if (this.routeOverlayVisibilitySnapshot === routeOverlayVisibilitySnapshot) {
      return;
    }
    this.routeOverlayVisibilitySnapshot = routeOverlayVisibilitySnapshot;
    this.recompute();
  }

  private setProfilerGateSnapshot(profilerGateSnapshot: ProfilerGateSnapshot): void {
    if (this.profilerGateSnapshot === profilerGateSnapshot) {
      return;
    }
    this.profilerGateSnapshot = profilerGateSnapshot;
    this.recompute();
  }

  private setRouteVisualSnapshot(routeVisualSnapshot: RouteVisualSnapshot): void {
    if (this.routeVisualSnapshot === routeVisualSnapshot) {
      return;
    }
    this.routeVisualSnapshot = routeVisualSnapshot;
    this.recompute();
  }

  private recompute(): void {
    const nextSnapshot = createSearchOverlayLocalRestaurantSheetVisualSnapshot({
      routeOverlayVisibilitySnapshot: this.routeOverlayVisibilitySnapshot,
      profilerGateSnapshot: this.profilerGateSnapshot,
      routeVisualSnapshot: this.routeVisualSnapshot,
    });

    if (areSearchOverlayLocalRestaurantSheetVisualSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createSearchOverlayLocalRestaurantSheetVisualStateController = ({
  routeOverlayVisibilityAuthority,
  localRestaurantSheetProfilerGateAuthority,
  localRestaurantRouteVisualAuthority,
}: ConstructorParameters<
  typeof SearchOverlayLocalRestaurantSheetVisualStateController
>[0]): SearchOverlayLocalRestaurantSheetVisualStateController =>
  new SearchOverlayLocalRestaurantSheetVisualStateController({
    routeOverlayVisibilityAuthority,
    localRestaurantSheetProfilerGateAuthority,
    localRestaurantRouteVisualAuthority,
  });
