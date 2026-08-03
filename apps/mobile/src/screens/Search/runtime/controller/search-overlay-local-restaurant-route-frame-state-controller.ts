import type { RouteHostOverlayGeometryBinding } from '../../../../navigation/runtime/route-host-overlay-geometry-state-controller';
import type { RouteHostVisualRuntime } from '../../../../navigation/runtime/route-host-visual-runtime-state-controller';
import { createNullableShapeEquality, sameFieldRef } from '../../../../overlays/shape-equality';

type Listener = () => void;

export type SearchOverlayLocalRestaurantRouteFrameSnapshot = {
  overlayGeometryRuntime: NonNullable<RouteHostOverlayGeometryBinding>;
  visualRuntime: NonNullable<RouteHostVisualRuntime>;
} | null;

export type SearchOverlayLocalRestaurantRouteFrameAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchOverlayLocalRestaurantRouteFrameSnapshot;
};

const resolveLocalRestaurantRouteFrameSnapshot = ({
  routeHostOverlayGeometry,
  routeHostVisualRuntime,
}: {
  routeHostOverlayGeometry: RouteHostOverlayGeometryBinding;
  routeHostVisualRuntime: RouteHostVisualRuntime;
}): SearchOverlayLocalRestaurantRouteFrameSnapshot =>
  routeHostOverlayGeometry == null || routeHostVisualRuntime == null
    ? null
    : {
        overlayGeometryRuntime: routeHostOverlayGeometry,
        visualRuntime: routeHostVisualRuntime,
      };

/** F1052f: `resolveLocalRestaurantRouteFrameSnapshot` ALLOCATES on every recompute, so the
 *  old `this.snapshot === nextSnapshot` dedupe could only ever be true when BOTH sides were
 *  null — any notification from either upstream authority re-emitted to every listener even
 *  with byte-identical inputs. The three siblings in this directory (geometry-frame,
 *  motion-frame, sheet) all compare FIELD-WISE; this one was the odd file out.
 *
 *  DERIVED, not hand-written (the fourth hand-written sibling is the disease): the
 *  `FieldComparators<T>` map must name EVERY field of the snapshot, so adding a field to
 *  `SearchOverlayLocalRestaurantRouteFrameSnapshot` without adding its comparator is a
 *  COMPILE ERROR naming the field — never a silently un-compared field.
 *  RED recipe: add a field to the snapshot type; tsc fails with "Property '<field>' is
 *  missing in type ... but required in type 'FieldComparators<...>'". */
const areLocalRestaurantRouteFrameSnapshotsEqual = createNullableShapeEquality<
  NonNullable<SearchOverlayLocalRestaurantRouteFrameSnapshot>
>({
  // Both fields are runtime BINDINGS re-minted by their owning authority on real change —
  // identity IS the "did this change" question for them (shape-equality's stated default).
  overlayGeometryRuntime: sameFieldRef,
  visualRuntime: sameFieldRef,
});

export class SearchOverlayLocalRestaurantRouteFrameStateController {
  private routeHostOverlayGeometry: RouteHostOverlayGeometryBinding;

  private routeHostVisualRuntime: RouteHostVisualRuntime;

  private snapshot: SearchOverlayLocalRestaurantRouteFrameSnapshot;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribers: Array<() => void> = [];

  public readonly outputAuthority: SearchOverlayLocalRestaurantRouteFrameAuthority;

  constructor({
    routeHostOverlayGeometryAuthority,
    routeHostVisualRuntimeAuthority,
  }: {
    routeHostOverlayGeometryAuthority: {
      subscribe: (listener: Listener) => () => void;
      getSnapshot: () => RouteHostOverlayGeometryBinding;
    };
    routeHostVisualRuntimeAuthority: {
      subscribe: (listener: Listener) => () => void;
      getSnapshot: () => RouteHostVisualRuntime;
    };
  }) {
    this.routeHostOverlayGeometry = routeHostOverlayGeometryAuthority.getSnapshot();
    this.routeHostVisualRuntime = routeHostVisualRuntimeAuthority.getSnapshot();
    this.snapshot = resolveLocalRestaurantRouteFrameSnapshot({
      routeHostOverlayGeometry: this.routeHostOverlayGeometry,
      routeHostVisualRuntime: this.routeHostVisualRuntime,
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

  private recompute(): void {
    const nextSnapshot = resolveLocalRestaurantRouteFrameSnapshot({
      routeHostOverlayGeometry: this.routeHostOverlayGeometry,
      routeHostVisualRuntime: this.routeHostVisualRuntime,
    });

    if (areLocalRestaurantRouteFrameSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createSearchOverlayLocalRestaurantRouteFrameStateController = ({
  routeHostOverlayGeometryAuthority,
  routeHostVisualRuntimeAuthority,
}: ConstructorParameters<
  typeof SearchOverlayLocalRestaurantRouteFrameStateController
>[0]): SearchOverlayLocalRestaurantRouteFrameStateController =>
  new SearchOverlayLocalRestaurantRouteFrameStateController({
    routeHostOverlayGeometryAuthority,
    routeHostVisualRuntimeAuthority,
  });
