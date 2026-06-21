import React from 'react';

import {
  POLLS_SCENE_LIST_BODY_ADMISSION_POLICY,
  usePollsPanelListSceneParts,
} from '../../overlays/panels/PollsPanel';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';

/**
 * Publishes the polls feed as a `'list'` scene body so it renders through the
 * shared gesture-aware list surface (sheet-drag → list-scroll handoff + working
 * card taps), exactly like the results sheet. Runs unconditionally at the app
 * shell — the feed data hook inside gates its own subscriptions on visibility —
 * so the body publisher is independent of which scene is mounted (the polls
 * controller owns shell + chrome; this owns the body).
 */
export const useAppRoutePollsSceneInputWriterRuntime = ({
  routeSceneRuntime,
}: {
  routeSceneRuntime: AppRouteSceneRuntime;
}): void => {
  const { sceneBodyContent, sceneBodyTransport } = usePollsPanelListSceneParts();

  React.useEffect(() => {
    routeSceneRuntime.sceneInputLane.publishRouteSceneBody({
      sceneKey: 'polls',
      sceneBodyContent,
      sceneBodyTransport,
      sceneBodyAdmissionPolicy: POLLS_SCENE_LIST_BODY_ADMISSION_POLICY,
    });
  }, [routeSceneRuntime.sceneInputLane, sceneBodyContent, sceneBodyTransport]);

  React.useEffect(
    () => () => {
      routeSceneRuntime.sceneInputLane.clearRouteSceneBody('polls');
    },
    [routeSceneRuntime.sceneInputLane]
  );
};
