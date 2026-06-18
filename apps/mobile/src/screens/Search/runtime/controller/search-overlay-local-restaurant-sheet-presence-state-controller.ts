import type React from 'react';

import type {
  SearchOverlayLocalRestaurantSheetProfilerGateAuthority,
  SearchOverlayLocalRestaurantSheetProfilerGateSnapshot,
} from '../shared/search-overlay-local-restaurant-sheet-profiler-gate-snapshot-contract';
import type {
  SearchOverlayLocalRestaurantSheetRenderVisibilityAuthority,
  SearchOverlayLocalRestaurantSheetRenderVisibilitySnapshot,
} from './search-overlay-local-restaurant-sheet-render-visibility-state-controller';

type Listener = () => void;

export type SearchOverlayLocalRestaurantSheetPresenceSnapshot = {
  shouldRenderSearchOverlay: boolean;
  onProfilerRender: React.ProfilerOnRenderCallback | null;
};

export type SearchOverlayLocalRestaurantSheetPresenceAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => SearchOverlayLocalRestaurantSheetPresenceSnapshot;
};

const createPresenceSnapshot = ({
  renderVisibilitySnapshot,
  profilerGateSnapshot,
}: {
  renderVisibilitySnapshot: SearchOverlayLocalRestaurantSheetRenderVisibilitySnapshot;
  profilerGateSnapshot: SearchOverlayLocalRestaurantSheetProfilerGateSnapshot;
}): SearchOverlayLocalRestaurantSheetPresenceSnapshot => ({
  shouldRenderSearchOverlay: renderVisibilitySnapshot.shouldRenderSearchOverlay,
  onProfilerRender: profilerGateSnapshot.onProfilerRender,
});

export class SearchOverlayLocalRestaurantSheetPresenceStateController {
  private renderVisibilitySnapshot: SearchOverlayLocalRestaurantSheetRenderVisibilitySnapshot;

  private profilerGateSnapshot: SearchOverlayLocalRestaurantSheetProfilerGateSnapshot;

  private snapshot: SearchOverlayLocalRestaurantSheetPresenceSnapshot;

  private readonly listeners = new Set<Listener>();

  private readonly unsubscribers: Array<() => void> = [];

  public readonly outputAuthority: SearchOverlayLocalRestaurantSheetPresenceAuthority;

  constructor({
    localRestaurantSheetRenderVisibilityAuthority,
    localRestaurantSheetProfilerGateAuthority,
  }: {
    localRestaurantSheetRenderVisibilityAuthority: SearchOverlayLocalRestaurantSheetRenderVisibilityAuthority;
    localRestaurantSheetProfilerGateAuthority: SearchOverlayLocalRestaurantSheetProfilerGateAuthority;
  }) {
    this.renderVisibilitySnapshot = localRestaurantSheetRenderVisibilityAuthority.getSnapshot();
    this.profilerGateSnapshot = localRestaurantSheetProfilerGateAuthority.getSnapshot();
    this.snapshot = createPresenceSnapshot({
      renderVisibilitySnapshot: this.renderVisibilitySnapshot,
      profilerGateSnapshot: this.profilerGateSnapshot,
    });
    this.outputAuthority = {
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.snapshot,
    };
    this.unsubscribers.push(
      localRestaurantSheetRenderVisibilityAuthority.subscribe(() => {
        this.setRenderVisibilitySnapshot(
          localRestaurantSheetRenderVisibilityAuthority.getSnapshot()
        );
      }),
      localRestaurantSheetProfilerGateAuthority.subscribe(() => {
        this.setProfilerGateSnapshot(localRestaurantSheetProfilerGateAuthority.getSnapshot());
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

  private setRenderVisibilitySnapshot(
    renderVisibilitySnapshot: SearchOverlayLocalRestaurantSheetRenderVisibilitySnapshot
  ): void {
    if (this.renderVisibilitySnapshot === renderVisibilitySnapshot) {
      return;
    }
    this.renderVisibilitySnapshot = renderVisibilitySnapshot;
    this.recompute();
  }

  private setProfilerGateSnapshot(
    profilerGateSnapshot: SearchOverlayLocalRestaurantSheetProfilerGateSnapshot
  ): void {
    if (this.profilerGateSnapshot === profilerGateSnapshot) {
      return;
    }
    this.profilerGateSnapshot = profilerGateSnapshot;
    this.recompute();
  }

  private recompute(): void {
    const nextSnapshot = createPresenceSnapshot({
      renderVisibilitySnapshot: this.renderVisibilitySnapshot,
      profilerGateSnapshot: this.profilerGateSnapshot,
    });

    if (
      this.snapshot.shouldRenderSearchOverlay === nextSnapshot.shouldRenderSearchOverlay &&
      this.snapshot.onProfilerRender === nextSnapshot.onProfilerRender
    ) {
      return;
    }

    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createSearchOverlayLocalRestaurantSheetPresenceStateController = ({
  localRestaurantSheetRenderVisibilityAuthority,
  localRestaurantSheetProfilerGateAuthority,
}: ConstructorParameters<
  typeof SearchOverlayLocalRestaurantSheetPresenceStateController
>[0]): SearchOverlayLocalRestaurantSheetPresenceStateController =>
  new SearchOverlayLocalRestaurantSheetPresenceStateController({
    localRestaurantSheetRenderVisibilityAuthority,
    localRestaurantSheetProfilerGateAuthority,
  });
