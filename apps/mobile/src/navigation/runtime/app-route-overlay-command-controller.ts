import type React from 'react';

import type { UserListType } from '../../services/user-lists';
import { resolveOwnerSceneKeyAndOpener } from './docked-scene-target';
import type {
  AppOverlaySaveListTarget,
  AppOverlayTopLevelProductRouteKey,
  OverlayKey,
  OverlayRouteParamsMap,
} from './app-overlay-route-types';
import type { AppOverlayRouteCommandRuntime } from './app-overlay-route-command-runtime';

type Listener = () => void;

export type AppRouteSaveSheetState = {
  visible: boolean;
  listType: UserListType;
  target: AppOverlaySaveListTarget | null;
  parentSceneKey: AppOverlayTopLevelProductRouteKey | null;
  ownerSceneKey: AppOverlayTopLevelProductRouteKey | null;
  openerRouteKey: OverlayKey | null;
  routeInstanceId: string | null;
};

// F1360 removed `searchHeaderActionResetToken` — the surviving half of the
// 'follow-collapse' header policy that app-overlay-route-types.ts:42-44 records as
// DELETED — and left a one-field envelope behind. F6202: the save-sheet state IS
// the command snapshot. A wrapper around a single field is a rename plus an
// allocation, and the field-wise equality it justified degenerated to the identity
// check `setSaveSheetState` had already performed, i.e. a bail-out that could not
// bail out.
export type AppRouteOverlayCommandAuthority = {
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => AppRouteSaveSheetState;
};

export type AppRouteOverlayCommandActions = {
  setSaveSheetState: (next: React.SetStateAction<AppRouteSaveSheetState>) => void;
  restoreDockedScene: () => void;
  // locationId = the in-context location the save trigger rendered (master
  // plan §7) — rides the save-sheet target into the add payloads.
  getDishSaveHandler: (connectionId: string, locationId?: string | null) => () => void;
  getRestaurantSaveHandler: (restaurantId: string, locationId?: string | null) => () => void;
  handleRestaurantSavePress: (restaurantId: string, locationId?: string | null) => void;
  handleCloseSaveSheet: () => void;
};

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

class AppRouteOverlayCommandController {
  private readonly listeners = new Set<Listener>();

  // ─── THE SAVE-HANDLER CACHES ARE BOUNDED (F955(a), F912's shape) ───────────────────
  // These are keyed by CONTENT identity (`${connectionId|restaurantId}|${locationId}`),
  // not by the bounded scene-key space, so they used to grow by one permanent entry for
  // every dish and restaurant the user ever saw a save button for, with the only clear
  // being `dispose()` at teardown: the leak class, cache variant. They exist purely to
  // keep the handler IDENTITY stable so memoised rows do not re-render — that is a CACHE
  // with a policy, so it has one now: least-recently-used eviction at a cap.
  //
  // THE CAP is a MEMORY knob, not a UX knob (same class as SCENE_ENTRY_MOUNT_DEPTH_LIMIT
  // and SCENE_SCROLL_RECORD_LIMIT): evicting a handler costs one new closure and one row
  // re-render the next time that row scrolls back into view, never a wrong or missing
  // save — the handler is rebuilt from the same key. It is set well above any plausible
  // on-screen row count so eviction can only ever touch rows the user has scrolled far
  // past.
  private static readonly SAVE_HANDLER_LIMIT = 256;

  private readonly dishSaveHandlers = new Map<string, () => void>();

  private readonly restaurantSaveHandlers = new Map<string, () => void>();

  /** LRU read-through: Map iteration is insertion order, so re-inserting on hit keeps the
   *  front of the iteration as the least-recently-used end. */
  private resolveCachedSaveHandler(
    cache: Map<string, () => void>,
    handlerKey: string,
    build: () => () => void
  ): () => void {
    const existing = cache.get(handlerKey);
    if (existing != null) {
      cache.delete(handlerKey);
      cache.set(handlerKey, existing);
      return existing;
    }
    const handler = build();
    cache.set(handlerKey, handler);
    while (cache.size > AppRouteOverlayCommandController.SAVE_HANDLER_LIMIT) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      cache.delete(oldestKey);
    }
    return handler;
  }

  private nextSaveSheetRouteInstance = 0;

  private snapshot: AppRouteSaveSheetState = DEFAULT_SAVE_SHEET_STATE;

  public readonly authority: AppRouteOverlayCommandAuthority = {
    subscribe: (listener) => this.subscribe(listener),
    getSnapshot: () => this.snapshot,
  };

  public readonly actions: AppRouteOverlayCommandActions = {
    setSaveSheetState: (next) => {
      const nextSaveSheetState = resolveStateUpdate(this.snapshot, next);
      if (nextSaveSheetState === this.snapshot) {
        return;
      }
      this.snapshot = nextSaveSheetState;
      this.listeners.forEach((listener) => {
        listener();
      });
    },
    restoreDockedScene: () => {
      this.routeOverlayRouteCommandRuntime.restoreDockedScene();
    },
    getDishSaveHandler: (connectionId, locationId) => {
      // Cache key includes the location: the same connection can render at a
      // different in-context location across worlds, and a stale cached
      // handler would save the wrong pin.
      const handlerKey = `${connectionId}|${locationId ?? ''}`;
      return this.resolveCachedSaveHandler(this.dishSaveHandlers, handlerKey, () => () => {
        this.openSaveSheetRoute({
          listType: 'dish',
          target: { connectionId, locationId: locationId ?? null },
        });
      });
    },
    getRestaurantSaveHandler: (restaurantId, locationId) => {
      const handlerKey = `${restaurantId}|${locationId ?? ''}`;
      return this.resolveCachedSaveHandler(this.restaurantSaveHandlers, handlerKey, () => () => {
        this.actions.handleRestaurantSavePress(restaurantId, locationId);
      });
    },
    handleRestaurantSavePress: (restaurantId, locationId) => {
      this.openSaveSheetRoute({
        listType: 'restaurant',
        target: { restaurantId, locationId: locationId ?? null },
      });
    },
    handleCloseSaveSheet: () => {
      this.closeSaveSheetRoute();
    },
  };

  constructor(private readonly routeOverlayRouteCommandRuntime: AppOverlayRouteCommandRuntime) {}

  private subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private resolveCurrentSaveSheetOwner(): {
    ownerSceneKey: AppOverlayTopLevelProductRouteKey;
    parentSceneKey: AppOverlayTopLevelProductRouteKey;
    openerRouteKey: OverlayKey;
  } {
    const routeState = this.routeOverlayRouteCommandRuntime.getRouteState();
    return resolveOwnerSceneKeyAndOpener({
      activeRoute: routeState.activeOverlayRoute,
      rootOverlayKey: routeState.rootOverlayKey,
    });
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
    listType: UserListType;
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
    const currentSaveSheetState = this.snapshot;
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
  routeOverlayRouteCommandRuntime,
}: {
  routeOverlayRouteCommandRuntime: AppOverlayRouteCommandRuntime;
}): AppRouteOverlayCommandControllerRuntime => {
  const controller = new AppRouteOverlayCommandController(routeOverlayRouteCommandRuntime);
  return {
    authority: controller.authority,
    actions: controller.actions,
    dispose: () => {
      controller.dispose();
    },
  };
};
