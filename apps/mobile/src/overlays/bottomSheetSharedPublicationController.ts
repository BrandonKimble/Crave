export type BottomSheetSharedPublicationSnapshot = {
  effectiveShowsVerticalScrollIndicator: boolean;
  scrollHeaderHeight: number;
  touchBlockingEnabled: boolean;
};

type BottomSheetSharedPublicationListener = () => void;

type BottomSheetSharedPublicationInputAuthority = {
  setEffectiveShowsVerticalScrollIndicator: (value: boolean) => void;
  setScrollHeaderHeight: (value: number) => void;
  resetScrollHeaderHeight: () => void;
  setTouchBlockingEnabled: (value: boolean) => void;
};

type BottomSheetSharedPublicationOutputAuthority = {
  subscribe: (listener: BottomSheetSharedPublicationListener) => () => void;
  getSnapshot: () => BottomSheetSharedPublicationSnapshot;
};

export type BottomSheetSharedTouchBlockingAuthority = {
  subscribe: (listener: BottomSheetSharedPublicationListener) => () => void;
  getSnapshot: () => boolean;
};

// F1496: not exported — the factory below (createBottomSheetSharedPublicationController)
// is the only sanctioned construction point and its return type is inferred from it; the
// class name itself had zero external importers (repo-wide grep confirmed).
class BottomSheetSharedPublicationController {
  private snapshot: BottomSheetSharedPublicationSnapshot;

  private readonly layoutListeners = new Set<BottomSheetSharedPublicationListener>();

  private readonly touchBlockingListeners = new Set<BottomSheetSharedPublicationListener>();

  public readonly inputAuthority: BottomSheetSharedPublicationInputAuthority;

  public readonly outputAuthority: BottomSheetSharedPublicationOutputAuthority;

  public readonly touchBlockingAuthority: BottomSheetSharedTouchBlockingAuthority;

  constructor(initialSnapshot: BottomSheetSharedPublicationSnapshot) {
    this.snapshot = initialSnapshot;
    this.inputAuthority = {
      setEffectiveShowsVerticalScrollIndicator:
        this.setEffectiveShowsVerticalScrollIndicator.bind(this),
      setScrollHeaderHeight: this.setScrollHeaderHeight.bind(this),
      resetScrollHeaderHeight: this.resetScrollHeaderHeight.bind(this),
      setTouchBlockingEnabled: this.setTouchBlockingEnabled.bind(this),
    };
    this.outputAuthority = {
      subscribe: this.subscribeLayout.bind(this),
      getSnapshot: this.getSnapshot.bind(this),
    };
    this.touchBlockingAuthority = {
      subscribe: this.subscribeTouchBlocking.bind(this),
      getSnapshot: this.getTouchBlockingSnapshot.bind(this),
    };
  }

  private setEffectiveShowsVerticalScrollIndicator(value: boolean): void {
    if (this.snapshot.effectiveShowsVerticalScrollIndicator === value) {
      return;
    }

    this.setLayoutSnapshot({
      ...this.snapshot,
      effectiveShowsVerticalScrollIndicator: value,
    });
  }

  private setScrollHeaderHeight(value: number): void {
    if (Math.abs(this.snapshot.scrollHeaderHeight - value) < 0.5) {
      return;
    }

    this.setLayoutSnapshot({
      ...this.snapshot,
      scrollHeaderHeight: value,
    });
  }

  private resetScrollHeaderHeight(): void {
    this.setScrollHeaderHeight(0);
  }

  private setTouchBlockingEnabled(value: boolean): void {
    if (this.snapshot.touchBlockingEnabled === value) {
      return;
    }

    this.snapshot = {
      ...this.snapshot,
      touchBlockingEnabled: value,
    };
    this.touchBlockingListeners.forEach((listener) => {
      listener();
    });
  }

  private setLayoutSnapshot(snapshot: BottomSheetSharedPublicationSnapshot): void {
    // No equality re-check here (F1478(a)): both callers (setEffectiveShowsVerticalScrollIndicator's
    // `=== value` guard, setScrollHeaderHeight's `< 0.5` delta guard) already early-return on an
    // unchanged value before reaching this point, so a snapshot re-comparison here could never
    // decide anything — it was a guard that could not show red. If a future caller needs a raw
    // no-pre-guard path, add the check back at that call site, not as dead weight here.
    this.snapshot = snapshot;
    this.layoutListeners.forEach((listener) => {
      listener();
    });
  }

  private subscribeLayout(listener: BottomSheetSharedPublicationListener): () => void {
    this.layoutListeners.add(listener);
    return () => {
      this.layoutListeners.delete(listener);
    };
  }

  private subscribeTouchBlocking(listener: BottomSheetSharedPublicationListener): () => void {
    this.touchBlockingListeners.add(listener);
    return () => {
      this.touchBlockingListeners.delete(listener);
    };
  }

  private getSnapshot(): BottomSheetSharedPublicationSnapshot {
    return this.snapshot;
  }

  private getTouchBlockingSnapshot(): boolean {
    return this.snapshot.touchBlockingEnabled;
  }

  public dispose(): void {
    this.layoutListeners.clear();
    this.touchBlockingListeners.clear();
  }
}

export const createBottomSheetSharedPublicationController = (
  initialSnapshot: BottomSheetSharedPublicationSnapshot
): BottomSheetSharedPublicationController =>
  new BottomSheetSharedPublicationController(initialSnapshot);
