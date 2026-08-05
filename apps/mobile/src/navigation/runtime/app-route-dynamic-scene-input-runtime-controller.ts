import React from 'react';

import { withSearchNavSwitchRuntimeAttribution } from '../../screens/Search/runtime/shared/search-nav-switch-runtime-attribution';
import {
  areAppRouteDynamicSceneInputRuntimesEqual,
  EMPTY_APP_ROUTE_DYNAMIC_SCENE_INPUT_RUNTIME,
  type AppRouteDynamicSceneInputRuntime,
  type AppRoutePollsDynamicSceneInputRuntime,
} from './app-route-dynamic-scene-inputs-contract';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';

type Listener = () => void;

type ListenerEntry = {
  listener: Listener;
  attributionLabel: string;
};

export type AppRouteDynamicSceneInputRuntimeAuthority = {
  subscribePollsRuntime: (listener: Listener, attributionLabel?: string) => () => void;
  getPollsRuntimeSnapshot: () => AppRoutePollsDynamicSceneInputRuntime;
};

export type AppRouteDynamicSceneInputRuntimeActions = {
  publishRuntime: (runtime: AppRouteDynamicSceneInputRuntime | null) => void;
};

export type AppRouteDynamicSceneInputRuntimeController = {
  authority: AppRouteDynamicSceneInputRuntimeAuthority;
  actions: AppRouteDynamicSceneInputRuntimeActions;
  dispose: () => void;
};

class AppRouteDynamicSceneInputController implements AppRouteDynamicSceneInputRuntimeController {
  // F1395: `pollsRuntimeSnapshot` used to be a SECOND snapshot tracked alongside this one,
  // with its own equality — but `AppRoutePollsDynamicSceneInputRuntime` IS
  // `AppRouteDynamicSceneInputRuntime` (one field, `searchInteractionRef`), so the two
  // equality checks could never disagree and the "polls" copy was dead weight. One snapshot.
  private runtimeSnapshot = EMPTY_APP_ROUTE_DYNAMIC_SCENE_INPUT_RUNTIME;

  private readonly pollsRuntimeListeners = new Set<ListenerEntry>();

  public readonly authority: AppRouteDynamicSceneInputRuntimeAuthority = {
    subscribePollsRuntime: (listener, attributionLabel = 'anonymous') =>
      this.subscribePollsRuntime(listener, attributionLabel),
    getPollsRuntimeSnapshot: () => this.runtimeSnapshot,
  };

  public readonly actions: AppRouteDynamicSceneInputRuntimeActions = {
    publishRuntime: (runtime) => this.publishRuntime(runtime),
  };

  public dispose(): void {
    this.pollsRuntimeListeners.clear();
    this.runtimeSnapshot = EMPTY_APP_ROUTE_DYNAMIC_SCENE_INPUT_RUNTIME;
  }

  private subscribePollsRuntime(listener: Listener, attributionLabel: string): () => void {
    const entry: ListenerEntry = {
      listener,
      attributionLabel,
    };
    this.pollsRuntimeListeners.add(entry);
    return () => {
      this.pollsRuntimeListeners.delete(entry);
    };
  }

  private publishRuntime(runtime: AppRouteDynamicSceneInputRuntime | null): void {
    withSearchNavSwitchRuntimeAttribution('routeDynamicSceneInput', 'publishRuntime', () => {
      const nextRuntime = runtime ?? EMPTY_APP_ROUTE_DYNAMIC_SCENE_INPUT_RUNTIME;
      const isSameRuntime = areAppRouteDynamicSceneInputRuntimesEqual(
        this.runtimeSnapshot,
        nextRuntime
      );

      if (isSameRuntime) {
        return;
      }

      this.runtimeSnapshot = nextRuntime;
      this.notifyPollsRuntimeListeners();
    });
  }

  private notifyPollsRuntimeListeners(): void {
    if (this.pollsRuntimeListeners.size === 0) {
      return;
    }
    withSearchNavSwitchRuntimeAttribution('routeDynamicSceneInput', 'notifyPollsRuntime', () => {
      this.pollsRuntimeListeners.forEach(({ listener, attributionLabel }) => {
        withSearchNavSwitchRuntimeAttribution(
          'routeDynamicSceneInput',
          `notifyPollsRuntime:${attributionLabel}`,
          listener
        );
      });
    });
  }
}

export const createAppRouteDynamicSceneInputRuntimeController =
  (): AppRouteDynamicSceneInputRuntimeController => new AppRouteDynamicSceneInputController();

export const usePublishAppRouteDynamicSceneInputRuntime = ({
  routeSceneRuntime,
  runtime,
}: {
  routeSceneRuntime: AppRouteSceneRuntime;
  runtime: AppRouteDynamicSceneInputRuntime;
}): void => {
  React.useEffect(() => {
    routeSceneRuntime.routeDynamicSceneInputActions.publishRuntime(runtime);
  }, [routeSceneRuntime, runtime]);

  React.useEffect(
    () => () => {
      routeSceneRuntime.routeDynamicSceneInputActions.publishRuntime(null);
    },
    [routeSceneRuntime]
  );
};
