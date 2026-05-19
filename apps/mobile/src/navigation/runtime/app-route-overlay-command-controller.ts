import type React from 'react';

import type { FavoriteListType } from '../../services/favorite-lists';
import type { OverlaySheetSnap } from '../../overlays/types';
import type {
  AppOverlaySaveListTarget,
  AppOverlayTopLevelProductRouteKey,
  OverlayKey,
  OverlayRouteEntry,
  OverlayRouteParamsMap,
} from './app-overlay-route-types';
import type { AppOverlayRouteCommandRuntime } from './app-overlay-route-command-runtime';
import type { AppRouteSheetSnapSessionActions } from './app-route-sheet-snap-session-runtime';

type Listener = () => void;

export type AppRouteSaveSheetState = {
  visible: boolean;
  listType: FavoriteListType;
  target: AppOverlaySaveListTarget | null;
  parentSceneKey: AppOverlayTopLevelProductRouteKey | null;
  ownerSceneKey: AppOverlayTopLevelProductRouteKey | null;
  openerRouteKey: OverlayKey | null;
  routeInstanceId: string | null;
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
  restoreSaveSheetState: (state: AppRouteSaveSheetState) => void;
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
  parentSceneKey: null,
  ownerSceneKey: null,
  openerRouteKey: null,
  routeInstanceId: null,
};

const resolveStateUpdate = <T>(current: T, next: React.SetStateAction<T>): T =>
  typeof next === 'function' ? (next as (value: T) => T)(current) : next;

const areCommandSnapshotsEqual = (
  left: AppRouteOverlayCommandSnapshot,
  right: AppRouteOverlayCommandSnapshot
): boolean =>
  left.searchHeaderActionResetToken === right.searchHeaderActionResetToken &&
  left.saveSheetState === right.saveSheetState;

const APP_ROUTE_TOP_LEVEL_PRODUCT_SCENE_KEYS: ReadonlySet<OverlayKey> = new Set<OverlayKey>([
  'search',
  'polls',
  'bookmarks',
  'profile',
]);

const isTopLevelProductSceneKey = (
  sceneKey: OverlayKey | null | undefined
): sceneKey is AppOverlayTopLevelProductRouteKey =>
  sceneKey != null && APP_ROUTE_TOP_LEVEL_PRODUCT_SCENE_KEYS.has(sceneKey);

const getRouteOwnerSceneKey = (
  route: OverlayRouteEntry
): AppOverlayTopLevelProductRouteKey | null => {
  const params = route.params as
    | {
        ownerSceneKey?: AppOverlayTopLevelProductRouteKey | null;
        parentSceneKey?: AppOverlayTopLevelProductRouteKey | null;
      }
    | undefined;
  const ownerSceneKey = params?.ownerSceneKey ?? params?.parentSceneKey ?? null;
  return isTopLevelProductSceneKey(ownerSceneKey) ? ownerSceneKey : null;
};

class AppRouteOverlayCommandController {
  private readonly listeners = new Set<Listener>();

  private readonly dishSaveHandlers = new Map<string, () => void>();

  private readonly restaurantSaveHandlers = new Map<string, () => void>();

  private nextSaveSheetRouteInstance = 0;

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
    restoreSaveSheetState: (state) => {
      if (!state.visible || state.target == null) {
        return;
      }
      this.openSaveSheetRoute({
        listType: state.listType,
        target: state.target,
        ownerSceneKey: state.ownerSceneKey,
        parentSceneKey: state.parentSceneKey,
        openerRouteKey: state.openerRouteKey,
        routeInstanceId: state.routeInstanceId,
      });
    },
    restoreDockedPolls: ({ snap } = {}) => {
      const resolvedSnap = snap ?? 'collapsed';
      this.routeOverlayRouteCommandRuntime.restoreDockedPolls({ snap: resolvedSnap });
    },
    handleCloseResultsUiReset: () => {
      this.routeSheetSnapSessionActions.setNavRestorePending(true);
      this.actions.requestSearchHeaderActionFollowCollapse();
    },
    getDishSaveHandler: (connectionId) => {
      let handler = this.dishSaveHandlers.get(connectionId);
      if (!handler) {
        handler = () => {
          this.openSaveSheetRoute({
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
      this.openSaveSheetRoute({
        listType: 'restaurant',
        target: { restaurantId },
      });
    },
    handleCloseSaveSheet: () => {
      this.closeSaveSheetRoute();
    },
  };

  constructor(
    private readonly routeSheetSnapSessionActions: Pick<
      AppRouteSheetSnapSessionActions,
      'setNavRestorePending'
    >,
    private readonly routeOverlayRouteCommandRuntime: AppOverlayRouteCommandRuntime
  ) {}

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

  private resolveCurrentSaveSheetOwner(): {
    ownerSceneKey: AppOverlayTopLevelProductRouteKey;
    parentSceneKey: AppOverlayTopLevelProductRouteKey;
    openerRouteKey: OverlayKey;
  } {
    const routeState = this.routeOverlayRouteCommandRuntime.getRouteState();
    const activeRoute = routeState.activeOverlayRoute;
    const routeOwnerSceneKey = getRouteOwnerSceneKey(activeRoute);
    const rootOwnerSceneKey = isTopLevelProductSceneKey(routeState.rootOverlayKey)
      ? routeState.rootOverlayKey
      : null;
    const ownerSceneKey = routeOwnerSceneKey ?? rootOwnerSceneKey ?? 'search';
    return {
      ownerSceneKey,
      parentSceneKey: ownerSceneKey,
      openerRouteKey: activeRoute.key,
    };
  }

  private createSaveSheetRouteInstanceId(): string {
    this.nextSaveSheetRouteInstance += 1;
    return `saveList-${this.nextSaveSheetRouteInstance}`;
  }

  private openSaveSheetRoute({
    listType,
    target,
    ownerSceneKey,
    parentSceneKey,
    openerRouteKey,
    routeInstanceId,
  }: {
    listType: FavoriteListType;
    target: AppOverlaySaveListTarget;
    ownerSceneKey?: AppOverlayTopLevelProductRouteKey | null;
    parentSceneKey?: AppOverlayTopLevelProductRouteKey | null;
    openerRouteKey?: OverlayKey | null;
    routeInstanceId?: string | null;
  }): void {
    const currentOwner = this.resolveCurrentSaveSheetOwner();
    const resolvedOwnerSceneKey = ownerSceneKey ?? currentOwner.ownerSceneKey;
    const resolvedParentSceneKey = parentSceneKey ?? currentOwner.parentSceneKey;
    const resolvedOpenerRouteKey = openerRouteKey ?? currentOwner.openerRouteKey;
    const resolvedRouteInstanceId = routeInstanceId ?? this.createSaveSheetRouteInstanceId();
    const saveSheetState: AppRouteSaveSheetState = {
      visible: true,
      listType,
      target,
      parentSceneKey: resolvedParentSceneKey,
      ownerSceneKey: resolvedOwnerSceneKey,
      openerRouteKey: resolvedOpenerRouteKey,
      routeInstanceId: resolvedRouteInstanceId,
    };
    const routeParams: NonNullable<OverlayRouteParamsMap['saveList']> = {
      listType,
      target,
      parentSceneKey: resolvedParentSceneKey,
      ownerSceneKey: resolvedOwnerSceneKey,
      openerRouteKey: resolvedOpenerRouteKey,
      routeInstanceId: resolvedRouteInstanceId,
    };
    this.actions.setSaveSheetState(saveSheetState);
    this.routeOverlayRouteCommandRuntime.pushRoute('saveList', routeParams);
  }

  private closeSaveSheetRoute(): void {
    const currentSaveSheetState = this.snapshot.saveSheetState;
    if (!currentSaveSheetState.visible && currentSaveSheetState.target == null) {
      return;
    }
    const activeRoute = this.routeOverlayRouteCommandRuntime.getRouteState().activeOverlayRoute;
    const activeSaveListParams =
      activeRoute.key === 'saveList'
        ? (activeRoute.params as OverlayRouteParamsMap['saveList'])
        : null;
    const shouldCloseActiveRoute =
      activeSaveListParams != null &&
      (currentSaveSheetState.routeInstanceId == null ||
        activeSaveListParams.routeInstanceId === currentSaveSheetState.routeInstanceId);

    this.actions.setSaveSheetState({
      ...currentSaveSheetState,
      visible: false,
      target: null,
    });

    if (shouldCloseActiveRoute) {
      this.routeOverlayRouteCommandRuntime.closeActiveRoute();
    }
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
  routeOverlayRouteCommandRuntime,
}: {
  routeSheetSnapSessionActions: Pick<AppRouteSheetSnapSessionActions, 'setNavRestorePending'>;
  routeOverlayRouteCommandRuntime: AppOverlayRouteCommandRuntime;
}): AppRouteOverlayCommandControllerRuntime => {
  const controller = new AppRouteOverlayCommandController(
    routeSheetSnapSessionActions,
    routeOverlayRouteCommandRuntime
  );
  return {
    authority: controller.authority,
    actions: controller.actions,
    dispose: () => {
      controller.dispose();
    },
  };
};
