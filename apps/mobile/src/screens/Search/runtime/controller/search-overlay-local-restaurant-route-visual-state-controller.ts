import type { SearchOverlayLocalRestaurantRouteVisualSnapshot } from '../shared/search-overlay-local-restaurant-sheet-visual-snapshot-contract';
import type { RouteHostOverlayGeometryBinding } from '../../../../navigation/runtime/route-host-overlay-geometry-state-controller';
import type { RouteHostVisualRuntime } from '../../../../navigation/runtime/route-host-visual-runtime-state-controller';
import type { RouteSharedSheetVisualBinding } from '../../../../navigation/runtime/route-shared-sheet-visual-state-controller';

type Listener = () => void;

type BindingAuthority<T> = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => T;
};

/**
 * THE ROUTE-FRAME AUTHORITY (D45/F958 Cluster A).
 *
 * Three controllers used to sit between the route bindings and this one — geometry-frame,
 * motion-frame and route-sheet — each doing nothing but wrapping a nullable binding in a
 * single-field object (`x == null ? null : { field: x }`). Each carried a dedupe guard that
 * could never fire (F1604): the wrapper allocates a FRESH object on every recompute, and the
 * only way to reach the recompute was a binding identity change, which the guard then
 * compared by that same identity. Three allocations and three comparator runs per event,
 * all of them provably no-ops. A fourth allocation — the throwaway intermediate "frame"
 * object this file used to build inside both its constructor and `recompute` (F1601/F1608) —
 * died with them.
 *
 * What survives is the one honest thing in the lane: a three-input projection with a real
 * comparator that CAN show RED, kept below as the positive control.
 */
const resolveLocalRestaurantRouteVisualSnapshot = ({
  routeHostOverlayGeometry,
  routeHostVisualRuntime,
  routeSharedSheetVisual,
}: {
  routeHostOverlayGeometry: RouteHostOverlayGeometryBinding;
  routeHostVisualRuntime: RouteHostVisualRuntime;
  routeSharedSheetVisual: RouteSharedSheetVisualBinding;
}): SearchOverlayLocalRestaurantRouteVisualSnapshot | null =>
  routeHostOverlayGeometry == null ||
  routeHostVisualRuntime == null ||
  routeSharedSheetVisual == null
    ? null
    : {
        overlayGeometryRuntime: routeHostOverlayGeometry,
        sharedSheetRuntimeOwner: routeSharedSheetVisual,
        visualRuntime: routeHostVisualRuntime,
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
  private routeHostOverlayGeometry: RouteHostOverlayGeometryBinding;

  private routeHostVisualRuntime: RouteHostVisualRuntime;

  private routeSharedSheetVisual: RouteSharedSheetVisualBinding;

  private snapshot: SearchOverlayLocalRestaurantRouteVisualSnapshot | null;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribers: Array<() => void> = [];

  public readonly outputAuthority: SearchOverlayLocalRestaurantRouteVisualAuthority;

  constructor({
    routeHostOverlayGeometryAuthority,
    routeHostVisualRuntimeAuthority,
    routeSharedSheetVisualAuthority,
  }: {
    routeHostOverlayGeometryAuthority: BindingAuthority<RouteHostOverlayGeometryBinding>;
    routeHostVisualRuntimeAuthority: BindingAuthority<RouteHostVisualRuntime>;
    routeSharedSheetVisualAuthority: BindingAuthority<RouteSharedSheetVisualBinding>;
  }) {
    this.routeHostOverlayGeometry = routeHostOverlayGeometryAuthority.getSnapshot();
    this.routeHostVisualRuntime = routeHostVisualRuntimeAuthority.getSnapshot();
    this.routeSharedSheetVisual = routeSharedSheetVisualAuthority.getSnapshot();
    this.snapshot = resolveLocalRestaurantRouteVisualSnapshot({
      routeHostOverlayGeometry: this.routeHostOverlayGeometry,
      routeHostVisualRuntime: this.routeHostVisualRuntime,
      routeSharedSheetVisual: this.routeSharedSheetVisual,
    });
    this.outputAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.unsubscribers.push(
      routeHostOverlayGeometryAuthority.subscribe(() => {
        this.setRouteHostOverlayGeometry(routeHostOverlayGeometryAuthority.getSnapshot());
      }),
      routeHostVisualRuntimeAuthority.subscribe(() => {
        this.setRouteHostVisualRuntime(routeHostVisualRuntimeAuthority.getSnapshot());
      }),
      routeSharedSheetVisualAuthority.subscribe(() => {
        this.setRouteSharedSheetVisual(routeSharedSheetVisualAuthority.getSnapshot());
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

  private setRouteHostOverlayGeometry(
    routeHostOverlayGeometry: RouteHostOverlayGeometryBinding
  ): void {
    if (this.routeHostOverlayGeometry === routeHostOverlayGeometry) {
      return;
    }
    this.routeHostOverlayGeometry = routeHostOverlayGeometry;
    this.recompute();
  }

  private setRouteHostVisualRuntime(routeHostVisualRuntime: RouteHostVisualRuntime): void {
    if (this.routeHostVisualRuntime === routeHostVisualRuntime) {
      return;
    }
    this.routeHostVisualRuntime = routeHostVisualRuntime;
    this.recompute();
  }

  private setRouteSharedSheetVisual(routeSharedSheetVisual: RouteSharedSheetVisualBinding): void {
    if (this.routeSharedSheetVisual === routeSharedSheetVisual) {
      return;
    }
    this.routeSharedSheetVisual = routeSharedSheetVisual;
    this.recompute();
  }

  private recompute(): void {
    const nextSnapshot = resolveLocalRestaurantRouteVisualSnapshot({
      routeHostOverlayGeometry: this.routeHostOverlayGeometry,
      routeHostVisualRuntime: this.routeHostVisualRuntime,
      routeSharedSheetVisual: this.routeSharedSheetVisual,
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
  routeHostOverlayGeometryAuthority,
  routeHostVisualRuntimeAuthority,
  routeSharedSheetVisualAuthority,
}: ConstructorParameters<
  typeof SearchOverlayLocalRestaurantRouteVisualStateController
>[0]): SearchOverlayLocalRestaurantRouteVisualStateController =>
  new SearchOverlayLocalRestaurantRouteVisualStateController({
    routeHostOverlayGeometryAuthority,
    routeHostVisualRuntimeAuthority,
    routeSharedSheetVisualAuthority,
  });
