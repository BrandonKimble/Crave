import type React from 'react';

import type { OverlaySheetSnap } from '../../overlays/types';
import type { SheetPosition } from '../../overlays/sheetUtils';
import type { AppRouteSceneMotionRuntime } from './app-route-scene-motion-controller';
import { appRouteResultsSheetLastVisibleStateRef } from './app-route-results-sheet-visible-state-runtime';

type Listener = () => void;

export type AppRouteResultsSheetVisibilitySnapshot = {
  panelVisible: boolean;
  sheetState: SheetPosition;
  shouldRenderResultsSheet: boolean;
};

export type AppRouteResultsSheetVisibilityInput = {
  isSearchOverlay: boolean;
  shouldShowDockedPollsTarget: boolean;
  getPollsSheetSnap: () => OverlaySheetSnap;
  isDockedPollsDismissed: boolean;
  hasUserSharedSnap: boolean;
  sharedSnap: Exclude<OverlaySheetSnap, 'hidden'>;
  navBarTopForSnaps: number;
  initialResultsSheetPosition: SheetPosition;
  initialResultsPanelVisible: boolean;
  clearSheetCommand: () => void;
  setSheetTranslateYTo: (position: SheetPosition) => void;
};

export type AppRouteResultsSheetVisibilityRuntime = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => AppRouteResultsSheetVisibilitySnapshot;
  shouldRenderResultsSheetRef: React.MutableRefObject<boolean>;
  syncInput: (input: AppRouteResultsSheetVisibilityInput) => void;
  animateSheetTo: (
    position: SheetPosition,
    velocity?: number,
    requestToken?: number | null
  ) => void;
  resetResultsSheetToHidden: () => void;
  prepareShortcutSheetTransition: () => boolean;
  handleSheetSnapChange: (nextSnap: SheetPosition | 'hidden') => void;
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
}): AppRouteResultsSheetVisibilitySnapshot => ({
  panelVisible,
  sheetState,
  shouldRenderResultsSheet: isSearchOverlay && (panelVisible || sheetState !== 'hidden'),
});

const areSnapshotsEqual = (
  left: AppRouteResultsSheetVisibilitySnapshot,
  right: AppRouteResultsSheetVisibilitySnapshot
): boolean =>
  left.panelVisible === right.panelVisible &&
  left.sheetState === right.sheetState &&
  left.shouldRenderResultsSheet === right.shouldRenderResultsSheet;

export class AppRouteResultsSheetVisibilityController
  implements AppRouteResultsSheetVisibilityRuntime
{
  private readonly listeners = new Set<Listener>();

  private snapshot: AppRouteResultsSheetVisibilitySnapshot = createSnapshot({
    isSearchOverlay: false,
    panelVisible: false,
    sheetState: 'hidden',
  });

  private input: AppRouteResultsSheetVisibilityInput | null = null;

  private hasAppliedInitialState = false;

  private lastNavBarTopForSnaps: number | null = null;

  public readonly shouldRenderResultsSheetRef: React.MutableRefObject<boolean> = {
    current: this.snapshot.shouldRenderResultsSheet,
  };

  constructor(private readonly routeSceneMotionRuntime: AppRouteSceneMotionRuntime) {}

  public subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): AppRouteResultsSheetVisibilitySnapshot => this.snapshot;

  public syncInput(input: AppRouteResultsSheetVisibilityInput): void {
    const previousInput = this.input;
    this.input = input;

    if (!this.hasAppliedInitialState) {
      this.hasAppliedInitialState = true;
      this.commitSnapshot({
        panelVisible: input.initialResultsPanelVisible,
        sheetState: input.initialResultsSheetPosition,
      });
      if (input.isSearchOverlay) {
        input.setSheetTranslateYTo(input.initialResultsSheetPosition);
      }
    } else {
      this.recomputeVisibilityForSearchOverlay(input.isSearchOverlay);
    }

    this.syncHiddenPosition();
    this.syncDockedPollsTarget();
    this.syncCollapsedGeometry(previousInput?.navBarTopForSnaps ?? null);
  }

  public animateSheetTo = (
    position: SheetPosition,
    _velocity = 0,
    requestToken: number | null = null
  ): void => {
    if (position !== 'hidden') {
      this.commitSnapshot({
        panelVisible: true,
        sheetState: this.snapshot.sheetState,
      });
    }
    this.routeSceneMotionRuntime.requestLocalSheetMotion('search', {
      snap: position,
      token: requestToken,
    });
  };

  public resetResultsSheetToHidden = (): void => {
    this.commitSnapshot({
      panelVisible: false,
      sheetState: 'hidden',
    });
    this.input?.clearSheetCommand();
    if (this.input?.isSearchOverlay) {
      this.input.setSheetTranslateYTo('hidden');
    }
  };

  public prepareShortcutSheetTransition = (): boolean => {
    const input = this.input;
    if (!input?.shouldShowDockedPollsTarget) {
      return false;
    }
    const pollsSheetSnap = input.getPollsSheetSnap();
    const transitionSnap: Exclude<OverlaySheetSnap, 'hidden'> =
      pollsSheetSnap !== 'hidden'
        ? pollsSheetSnap
        : input.isDockedPollsDismissed
        ? 'collapsed'
        : 'collapsed';
    this.showPanelInstant(transitionSnap);
    return true;
  };

  public handleSheetSnapChange = (nextSnap: SheetPosition | 'hidden'): void => {
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

  private showPanelInstant(position: SheetPosition = 'middle'): void {
    this.commitSnapshot({
      panelVisible: true,
      sheetState: position,
    });
    this.input?.clearSheetCommand();
    if (this.input?.isSearchOverlay) {
      this.input.setSheetTranslateYTo(position);
    }
  }

  private syncHiddenPosition(): void {
    const input = this.input;
    if (!input?.isSearchOverlay) {
      return;
    }
    if (input.shouldShowDockedPollsTarget) {
      return;
    }
    if (this.snapshot.panelVisible) {
      return;
    }
    input.setSheetTranslateYTo('hidden');
  }

  private syncDockedPollsTarget(): void {
    const input = this.input;
    if (!input?.isSearchOverlay) {
      return;
    }
    if (!input.shouldShowDockedPollsTarget) {
      return;
    }
    if (this.snapshot.sheetState !== 'hidden') {
      return;
    }
    this.prepareShortcutSheetTransition();
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
    this.showPanelInstant('collapsed');
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
      appRouteResultsSheetLastVisibleStateRef.current = nextSnapshot.sheetState;
    }
    this.shouldRenderResultsSheetRef.current = nextSnapshot.shouldRenderResultsSheet;
    if (areSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }
    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}

export const createAppRouteResultsSheetVisibilityRuntime = ({
  routeSceneMotionRuntime,
}: {
  routeSceneMotionRuntime: AppRouteSceneMotionRuntime;
}): AppRouteResultsSheetVisibilityRuntime =>
  new AppRouteResultsSheetVisibilityController(routeSceneMotionRuntime);
