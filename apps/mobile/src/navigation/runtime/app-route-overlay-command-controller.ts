import type React from 'react';

import type { FavoriteListType } from '../../services/favorite-lists';
import type { OverlaySheetSnap } from '../../overlays/types';
import type { AppRouteSheetSnapSessionActions } from './app-route-sheet-snap-session-runtime';

type Listener = () => void;

export type AppRouteSaveSheetState = {
  visible: boolean;
  listType: FavoriteListType;
  target: { restaurantId?: string; connectionId?: string } | null;
};

export type AppRouteOverlayCommandSnapshot = {
  searchHeaderActionResetToken: number;
  saveSheetState: AppRouteSaveSheetState;
};

export type AppRouteOverlayCommandAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => AppRouteOverlayCommandSnapshot;
};

export type AppRouteOverlayCommandActions = {
  requestSearchHeaderActionFollowCollapse: () => void;
  setSaveSheetState: (next: React.SetStateAction<AppRouteSaveSheetState>) => void;
  restoreDockedPolls: (args?: { snap?: Exclude<OverlaySheetSnap, 'hidden'> }) => void;
  handleCloseResultsUiReset: () => void;
  getDishSaveHandler: (connectionId: string) => () => void;
  getRestaurantSaveHandler: (restaurantId: string) => () => void;
  handleRestaurantSavePress: (restaurantId: string) => void;
  handleCloseSaveSheet: () => void;
};

export type AppRouteOverlayCommandRuntime = AppRouteOverlayCommandSnapshot &
  AppRouteOverlayCommandActions;

const DEFAULT_SAVE_SHEET_STATE: AppRouteSaveSheetState = {
  visible: false,
  listType: 'restaurant',
  target: null,
};

const resolveStateUpdate = <T>(current: T, next: React.SetStateAction<T>): T =>
  typeof next === 'function' ? (next as (value: T) => T)(current) : next;

const areCommandSnapshotsEqual = (
  left: AppRouteOverlayCommandSnapshot,
  right: AppRouteOverlayCommandSnapshot
): boolean =>
  left.searchHeaderActionResetToken === right.searchHeaderActionResetToken &&
  left.saveSheetState === right.saveSheetState;

class AppRouteOverlayCommandController {
  private readonly listeners = new Set<Listener>();

  private readonly dishSaveHandlers = new Map<string, () => void>();

  private readonly restaurantSaveHandlers = new Map<string, () => void>();

  private snapshot: AppRouteOverlayCommandSnapshot = {
    searchHeaderActionResetToken: 0,
    saveSheetState: DEFAULT_SAVE_SHEET_STATE,
  };

  public readonly authority: AppRouteOverlayCommandAuthority = {
    subscribe: (listener) => this.subscribe(listener),
    getSnapshot: () => this.snapshot,
  };

  public readonly actions: AppRouteOverlayCommandActions = {
    requestSearchHeaderActionFollowCollapse: () => {
      this.updateSnapshot({
        ...this.snapshot,
        searchHeaderActionResetToken: this.snapshot.searchHeaderActionResetToken + 1,
      });
    },
    setSaveSheetState: (next) => {
      const nextSaveSheetState = resolveStateUpdate(this.snapshot.saveSheetState, next);
      if (nextSaveSheetState === this.snapshot.saveSheetState) {
        return;
      }
      this.updateSnapshot({
        ...this.snapshot,
        saveSheetState: nextSaveSheetState,
      });
    },
    restoreDockedPolls: ({ snap } = {}) => {
      this.routeSheetSnapSessionActions.requestRouteSceneDockedPollsRestore({ snap });
    },
    handleCloseResultsUiReset: () => {
      this.routeSheetSnapSessionActions.setNavRestorePending(true);
      this.actions.requestSearchHeaderActionFollowCollapse();
    },
    getDishSaveHandler: (connectionId) => {
      let handler = this.dishSaveHandlers.get(connectionId);
      if (!handler) {
        handler = () => {
          this.actions.setSaveSheetState({
            visible: true,
            listType: 'dish',
            target: { connectionId },
          });
        };
        this.dishSaveHandlers.set(connectionId, handler);
      }
      return handler;
    },
    getRestaurantSaveHandler: (restaurantId) => {
      let handler = this.restaurantSaveHandlers.get(restaurantId);
      if (!handler) {
        handler = () => {
          this.actions.handleRestaurantSavePress(restaurantId);
        };
        this.restaurantSaveHandlers.set(restaurantId, handler);
      }
      return handler;
    },
    handleRestaurantSavePress: (restaurantId) => {
      this.actions.setSaveSheetState({
        visible: true,
        listType: 'restaurant',
        target: { restaurantId },
      });
    },
    handleCloseSaveSheet: () => {
      this.actions.setSaveSheetState((prev) => ({
        ...prev,
        visible: false,
        target: null,
      }));
    },
  };

  constructor(private readonly routeSheetSnapSessionActions: AppRouteSheetSnapSessionActions) {}

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private updateSnapshot(nextSnapshot: AppRouteOverlayCommandSnapshot): void {
    if (areCommandSnapshotsEqual(this.snapshot, nextSnapshot)) {
      return;
    }
    this.snapshot = nextSnapshot;
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  public dispose(): void {
    this.listeners.clear();
    this.dishSaveHandlers.clear();
    this.restaurantSaveHandlers.clear();
  }
}

export type AppRouteOverlayCommandControllerRuntime = {
  authority: AppRouteOverlayCommandAuthority;
  actions: AppRouteOverlayCommandActions;
  dispose: () => void;
};

export const createAppRouteOverlayCommandController = ({
  routeSheetSnapSessionActions,
}: {
  routeSheetSnapSessionActions: AppRouteSheetSnapSessionActions;
}): AppRouteOverlayCommandControllerRuntime => {
  const controller = new AppRouteOverlayCommandController(routeSheetSnapSessionActions);
  return {
    authority: controller.authority,
    actions: controller.actions,
    dispose: () => {
      controller.dispose();
    },
  };
};
