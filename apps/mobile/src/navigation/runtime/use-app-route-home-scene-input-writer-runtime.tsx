import React from 'react';

import {
  HOME_SCENE_LIST_BODY_ADMISSION_POLICY,
  useHomePanelListSceneParts,
} from '../../overlays/panels/HomePanel';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';

/**
 * Publishes the home shelves as a `'list'` scene body (the polls writer
 * pattern): shared gesture-aware list surface — sheet-drag → list-scroll
 * handoff + working card taps. Runs unconditionally at the app shell; the
 * feed runtime inside gates its own subscriptions on the docked visibility.
 */
export const useAppRouteHomeSceneInputWriterRuntime = ({
  routeSceneRuntime,
}: {
  routeSceneRuntime: AppRouteSceneRuntime;
}): void => {
  const { sceneBodyContent, sceneBodyTransport } = useHomePanelListSceneParts();

  React.useEffect(() => {
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
    },
    [routeSceneRuntime.sceneInputLane]
  );
};
