import type React from 'react';

import type { OverlaySheetSnap } from '../../overlays/types';
import type { SheetPosition } from '../../overlays/sheetUtils';
import { appRouteSharedSheetLastVisibleStateRef } from './app-route-shared-sheet-visible-state-runtime';

type Listener = () => void;

export type AppRouteSharedSheetPresentationSnapshot = {
  panelVisible: boolean;
  sheetState: SheetPosition;
  shouldRenderMountedSharedSheet: boolean;
};

export type AppRouteSharedSheetPresentationInput = {
  isSearchOverlay: boolean;
  shouldShowDockedPollsTarget: boolean;
  getPollsSheetSnap: () => OverlaySheetSnap;
  navBarTopForSnaps: number;
  initialSharedSheetPosition: SheetPosition;
  initialSharedSheetVisible: boolean;
  clearSheetCommand: () => void;
};

export type AppRouteSharedSheetPresentationRuntime = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => AppRouteSharedSheetPresentationSnapshot;
  shouldRenderMountedSharedSheetRef: React.MutableRefObject<boolean>;
  syncInput: (input: AppRouteSharedSheetPresentationInput) => void;
  markSharedSheetHidden: () => void;
  prepareSharedSheetForSearchPresentation: () => boolean;
  recordSharedSheetSnap: (nextSnap: SheetPosition | 'hidden') => void;
  dispose: () => void;
};

const createSnapshot = ({
  isSearchOverlay,
  panelVisible,
  sheetState,
}: {
  isSearchOverlay: boolean;
  panelVisible: boolean;
  sheetState: SheetPosition;
}): AppRouteSharedSheetPresentationSnapshot => ({
  panelVisible,
  sheetState,
  shouldRenderMountedSharedSheet: isSearchOverlay && (panelVisible || sheetState !== 'hidden'),
});

const areSnapshotsEqual = (
  left: AppRouteSharedSheetPresentationSnapshot,
  right: AppRouteSharedSheetPresentationSnapshot
): boolean =>
  left.panelVisible === right.panelVisible &&
  left.sheetState === right.sheetState &&
  left.shouldRenderMountedSharedSheet === right.shouldRenderMountedSharedSheet;

export class AppRouteSharedSheetPresentationController
  implements AppRouteSharedSheetPresentationRuntime
{
  private readonly listeners = new Set<Listener>();

  private snapshot: AppRouteSharedSheetPresentationSnapshot = createSnapshot({
    isSearchOverlay: false,
    panelVisible: false,
    sheetState: 'hidden',
  });

  private input: AppRouteSharedSheetPresentationInput | null = null;

  private hasAppliedInitialState = false;

  private lastNavBarTopForSnaps: number | null = null;

  public readonly shouldRenderMountedSharedSheetRef: React.MutableRefObject<boolean> = {
    current: this.snapshot.shouldRenderMountedSharedSheet,
  };

  public subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): AppRouteSharedSheetPresentationSnapshot => this.snapshot;

  public syncInput(input: AppRouteSharedSheetPresentationInput): void {
    const previousInput = this.input;
    this.input = input;

    if (!this.hasAppliedInitialState) {
      this.hasAppliedInitialState = true;
      this.commitSnapshot({
        panelVisible: input.initialSharedSheetVisible,
        sheetState: input.initialSharedSheetPosition,
      });
    } else {
      this.recomputeVisibilityForSearchOverlay(input.isSearchOverlay);
    }

    this.syncCollapsedGeometry(previousInput?.navBarTopForSnaps ?? null);
  }

  public markSharedSheetHidden = (): void => {
    this.commitSnapshot({
      panelVisible: false,
      sheetState: 'hidden',
    });
    this.input?.clearSheetCommand();
  };

  public prepareSharedSheetForSearchPresentation = (): boolean => {
    const input = this.input;
    if (!input?.shouldShowDockedPollsTarget) {
      return false;
    }
    const pollsSheetSnap = input.getPollsSheetSnap();
    const nextLogicalSnap: Exclude<OverlaySheetSnap, 'hidden'> =
      pollsSheetSnap !== 'hidden' ? pollsSheetSnap : 'collapsed';
    this.commitSnapshot({
      panelVisible: true,
      sheetState: nextLogicalSnap,
    });
    input.clearSheetCommand();
    return true;
  };

  public recordSharedSheetSnap = (nextSnap: SheetPosition | 'hidden'): void => {
    const nextState: SheetPosition = nextSnap === 'hidden' ? 'hidden' : nextSnap;
    this.commitSnapshot({
      panelVisible: nextSnap !== 'hidden',
      sheetState: nextState,
    });
  };

  public dispose(): void {
    this.listeners.clear();
    this.input = null;
  }

  private recomputeVisibilityForSearchOverlay(isSearchOverlay: boolean): void {
    this.commitSnapshot({
      panelVisible: this.snapshot.panelVisible,
      sheetState: this.snapshot.sheetState,
      isSearchOverlay,
    });
  }

  private syncCollapsedGeometry(previousNavBarTopForSnaps: number | null): void {
    const input = this.input;
    if (!input) {
      return;
    }
    const previous = previousNavBarTopForSnaps ?? this.lastNavBarTopForSnaps;
    this.lastNavBarTopForSnaps = input.navBarTopForSnaps;
    if (previous == null) {
      return;
    }
    if (previous === input.navBarTopForSnaps) {
      return;
    }
    if (this.snapshot.sheetState !== 'collapsed') {
      return;
    }
    if (!Number.isFinite(input.navBarTopForSnaps)) {
      return;
    }
    if (Number.isFinite(previous) && Math.abs(input.navBarTopForSnaps - previous) < 1) {
      return;
    }
    this.commitSnapshot({
      panelVisible: true,
      sheetState: 'collapsed',
    });
    input.clearSheetCommand();
  }

  private commitSnapshot({
    panelVisible,
    sheetState,
    isSearchOverlay = this.input?.isSearchOverlay ?? false,
  }: {
    panelVisible: boolean;
    sheetState: SheetPosition;
    isSearchOverlay?: boolean;
  }): void {
    const nextSnapshot = createSnapshot({
      isSearchOverlay,
      panelVisible,
      sheetState,
    });
    if (nextSnapshot.sheetState !== 'hidden') {
      appRouteSharedSheetLastVisibleStateRef.current = nextSnapshot.sheetState;
    }
    this.shouldRenderMountedSharedSheetRef.current = nextSnapshot.shouldRenderMountedSharedSheet;
    if (areSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }
    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createAppRouteSharedSheetPresentationRuntime =
  (): AppRouteSharedSheetPresentationRuntime => new AppRouteSharedSheetPresentationController();
