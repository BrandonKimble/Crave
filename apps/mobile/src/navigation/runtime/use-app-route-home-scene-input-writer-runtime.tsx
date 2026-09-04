import React from 'react';

import {
  HOME_SCENE_LIST_BODY_ADMISSION_POLICY,
  useHomePanelListSceneParts,
} from '../../overlays/panels/HomePanel';
import {
  clearFeedSceneParts,
  publishFeedSceneParts,
} from '../../overlays/panels/runtime/feed-scene-parts-registry';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';

/**
 * Publishes the home shelves as a `'list'` scene body (the polls writer
 * pattern): shared gesture-aware list surface — sheet-drag → list-scroll
 * handoff + working card taps. Runs unconditionally at the app shell; the
 * feed runtime inside gates its own subscriptions on the docked visibility.
 *
 * THE ONE OWNER of the home feed runtime (P0 2026-08-19, ruled 2026-09-04):
 * the only call of useHomePanelListSceneParts in the app. The track host's leg
 * resolver reads this instance's parts through the feed-scene-parts registry
 * (published below, same commit as the lane) — never by calling the hook.
 */
export const useAppRouteHomeSceneInputWriterRuntime = ({
  routeSceneRuntime,
}: {
  routeSceneRuntime: AppRouteSceneRuntime;
}): void => {
  const { sceneBodyContent, sceneBodyTransport } = useHomePanelListSceneParts();

  React.useEffect(() => {
    publishFeedSceneParts('home', { sceneBodyContent, sceneBodyTransport });
    routeSceneRuntime.sceneInputLane.publishRouteSceneBody({
      sceneKey: 'home',
      sceneBodyContent,
      sceneBodyTransport,
      sceneBodyAdmissionPolicy: HOME_SCENE_LIST_BODY_ADMISSION_POLICY,
    });
  }, [routeSceneRuntime.sceneInputLane, sceneBodyContent, sceneBodyTransport]);

  React.useEffect(
    () => () => {
      routeSceneRuntime.sceneInputLane.clearRouteSceneBody('home');
      clearFeedSceneParts('home');
    },
    [routeSceneRuntime.sceneInputLane]
  );
};
