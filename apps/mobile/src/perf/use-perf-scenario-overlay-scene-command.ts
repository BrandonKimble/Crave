import React from 'react';

import type { AppRouteSceneRuntime } from '../navigation/runtime/app-route-scene-runtime';
import type { OverlayKey } from '../overlays/types';
import { APP_OVERLAY_ROUTE_METADATA_BY_KEY } from '../navigation/runtime/app-overlay-route-types';
import { registerPerfScenarioCommands } from './perf-scenario-command-registry';

const isSwitchableOverlaySceneKey = (scene: string): scene is OverlayKey =>
  Object.prototype.hasOwnProperty.call(APP_OVERLAY_ROUTE_METADATA_BY_KEY, scene) &&
  APP_OVERLAY_ROUTE_METADATA_BY_KEY[scene as OverlayKey].sceneSwitch;

const POLL_CHILD_COMMIT_DELAY_MS = 600;

/**
 * Verification harness: registers an `open_overlay_scene` perf command so a
 * Maestro flow / deep link can drive into any overlay scene's committed state
 * directly — instead of the manual docked-lane gesture dance that made pollDetail
 * impossible to reach from automation. Example:
 *   crave://perf-scenario-command?action=open_overlay_scene&scene=pollDetail&routeParam=<pollId>
 *   crave://perf-scenario-command?action=open_overlay_scene&scene=polls
 * Poll child scenes commit the polls home first (so the owner scene is valid),
 * then push the child after a short settle.
 */
export const usePerfScenarioOverlaySceneCommand = ({
  routeSceneRuntime,
}: {
  routeSceneRuntime: AppRouteSceneRuntime;
}): void => {
  React.useEffect(() => {
    const command = routeSceneRuntime.routeOverlayRouteCommandRuntime;
    const searchActions = routeSceneRuntime.routeSearchCommandActions;

    const commitPollsHome = (pollId?: string | null): void => {
      searchActions.openAppSearchRoutePollsHome({
        params: pollId ? { pollId } : {},
        snap: 'expanded',
      });
    };

    const openOverlayScene = ({
      scene,
      routeParam,
    }: {
      scene: string;
      routeParam?: string | null;
    }): boolean => {
      switch (scene) {
        case 'polls':
          commitPollsHome(routeParam);
          return true;
        case 'pollDetail':
          if (!routeParam) {
            return false; // pollDetail needs a pollId
          }
          commitPollsHome(routeParam);
          setTimeout(() => {
            command.pushRoute('pollDetail', { pollId: routeParam });
          }, POLL_CHILD_COMMIT_DELAY_MS);
          return true;
        case 'pollCreation':
          commitPollsHome(null);
          setTimeout(() => {
            command.pushRoute('pollCreation', {});
          }, POLL_CHILD_COMMIT_DELAY_MS);
          return true;
        case 'search':
        case 'bookmarks':
        case 'profile':
          command.setRootRoute(scene as OverlayKey);
          return true;
        default:
          // Metadata-driven fallback: any registered switchable scene is drivable without a
          // hand-maintained whitelist (the old default:false silently rejected e.g. 'restaurant'
          // and every page-registry stub scene). Poll scenes keep their choreography above.
          if (!isSwitchableOverlaySceneKey(scene)) {
            return false;
          }
          if (APP_OVERLAY_ROUTE_METADATA_BY_KEY[scene].role === 'topLevel') {
            command.setRootRoute(scene);
            return true;
          }
          command.pushRoute(scene);
          return true;
      }
    };

    // The from-anywhere probe: push a CHILD scene into whatever context is
    // presented RIGHT NOW — a faithful pushRoute mirror, zero choreography.
    //   crave://perf-scenario-command?action=push_child_scene&scene=pollDetail
    //     &routeParamsJson={"pollId":"..."}
    const pushChildScene = ({
      scene,
      params,
    }: {
      scene: string;
      params: Record<string, unknown>;
    }): boolean => {
      if (!isSwitchableOverlaySceneKey(scene)) {
        return false;
      }
      if (APP_OVERLAY_ROUTE_METADATA_BY_KEY[scene].role !== 'child') {
        return false;
      }
      command.pushRoute(scene as never, params as never);
      return true;
    };

    return registerPerfScenarioCommands({ openOverlayScene, pushChildScene });
  }, [routeSceneRuntime]);
};
