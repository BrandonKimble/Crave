import type React from 'react';

import type { OverlaySheetSnap } from '../../overlays/types';
import type { SheetPosition } from '../../overlays/sheetUtils';
import { DOCKED_SCENE_RESURRECT_SNAP } from './app-route-sheet-snap-session-runtime';

type Listener = () => void;

export type AppRouteSharedSheetPresentationSnapshot = {
  panelVisible: boolean;
  sheetState: SheetPosition;
  shouldRenderMountedSharedSheet: boolean;
};

export type AppRouteSharedSheetPresentationInput = {
  isSearchOverlay: boolean;
  shouldShowDockedSceneTarget: boolean;
  /** F953: renamed from getPollsSheetSnap — this reads the HOME posture seat, whose
   *  carrier scene is DOCKED_SCENE_KEY, not the literal polls page. */
  getHomeSeatSheetSnap: () => OverlaySheetSnap;
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
    if (!input?.shouldShowDockedSceneTarget) {
      return false;
    }
    const homeSeatSheetSnap = input.getHomeSeatSheetSnap();
    const nextLogicalSnap: Exclude<OverlaySheetSnap, 'hidden'> =
      homeSeatSheetSnap !== 'hidden' ? homeSeatSheetSnap : DOCKED_SCENE_RESURRECT_SNAP;
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

  // F1379: the honest form the repo already uses for unrecorded-derivation magic
  // numbers (overlays/sheetUtils.ts) — named, but the derivation is not recorded.
  /** Below this delta, a `navBarTopForSnaps` change is treated as float jitter, not a
   *  real geometry change — skip the re-collapse commit. Derivation not recorded. */
  private static readonly NAV_BAR_TOP_SNAP_JITTER_EPSILON_PX = 1;

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
    if (
      Number.isFinite(previous) &&
      Math.abs(input.navBarTopForSnaps - previous) <
        AppRouteSharedSheetPresentationController.NAV_BAR_TOP_SNAP_JITTER_EPSILON_PX
    ) {
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
