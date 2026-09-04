import React from 'react';

import {
  POLLS_SCENE_LIST_BODY_ADMISSION_POLICY,
  usePollsPanelListSceneParts,
} from '../../overlays/panels/PollsPanel';
import {
  clearFeedSceneParts,
  publishFeedSceneParts,
} from '../../overlays/panels/runtime/feed-scene-parts-registry';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';

/**
 * Publishes the polls feed as a `'list'` scene body so it renders through the
 * shared gesture-aware list surface (sheet-drag → list-scroll handoff + working
 * card taps), exactly like the results sheet. Runs unconditionally at the app
 * shell — the feed data hook inside gates its own subscriptions on visibility —
 * so the body publisher is independent of which scene is mounted (the polls
 * controller owns shell + chrome; this owns the body).
 *
 * THE ONE OWNER of the polls feed runtime (P0 2026-08-19, ruled 2026-09-04):
 * this is the only call of usePollsPanelListSceneParts in the app. The track
 * host's leg resolver reads this instance's parts through the feed-scene-parts
 * registry (published below, same commit as the lane) — it must never call the
 * hook itself, or the feed's sockets/fetches/toggle consequences run twice.
 */
export const useAppRoutePollsSceneInputWriterRuntime = ({
  routeSceneRuntime,
}: {
  routeSceneRuntime: AppRouteSceneRuntime;
}): void => {
  const { sceneBodyContent, sceneBodyTransport } = usePollsPanelListSceneParts();

  React.useEffect(() => {
    publishFeedSceneParts('polls', { sceneBodyContent, sceneBodyTransport });
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
      clearFeedSceneParts('polls');
    },
    [routeSceneRuntime.sceneInputLane]
  );
};
