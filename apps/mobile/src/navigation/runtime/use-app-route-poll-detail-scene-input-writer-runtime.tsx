import React from 'react';

import type { SearchRouteSceneLayoutState } from '../../overlays/searchRouteSceneLayoutContract';
import { useSearchRoutePollDetailPanelSpec } from '../../overlays/useSearchRoutePollDetailPanelSpec';
import { useSearchRoutePollDetailSceneStateRuntime } from '../../overlays/useSearchRoutePollDetailSceneStateRuntime';
import type { OverlayRouteEntry } from './app-overlay-route-types';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';

export const useAppRoutePollDetailSceneInputWriterRuntime = ({
  routeSceneRuntime,
  activeOverlayRoute,
  sceneLayout,
}: {
  routeSceneRuntime: AppRouteSceneRuntime;
  activeOverlayRoute: OverlayRouteEntry;
  sceneLayout: SearchRouteSceneLayoutState;
}): void => {
  const pollDetailSceneStateRuntime = useSearchRoutePollDetailSceneStateRuntime({
    activeOverlayRoute,
  });
  const pollDetailSceneParts = useSearchRoutePollDetailPanelSpec({
    sceneLayout,
    pollDetailPollId: pollDetailSceneStateRuntime.pollDetailPollId,
    pollDetailPoll: pollDetailSceneStateRuntime.pollDetailPoll,
    pollDetailCommentAnchorId: pollDetailSceneStateRuntime.pollDetailCommentAnchorId,
    shouldShowPollDetailPanel: pollDetailSceneStateRuntime.shouldShowPollDetailPanel,
  });

  React.useEffect(() => {
    routeSceneRuntime.sceneInputLane.publishRouteSceneShell({
      sceneKey: 'pollDetail',
      shellSpec: pollDetailSceneParts?.shellSpec ?? null,
    });
  }, [pollDetailSceneParts?.shellSpec, routeSceneRuntime.sceneInputLane]);

  React.useEffect(() => {
    routeSceneRuntime.sceneInputLane.publishRouteSceneChrome({
      sceneKey: 'pollDetail',
      sceneChrome: pollDetailSceneParts?.sceneChrome ?? null,
    });
  }, [pollDetailSceneParts?.sceneChrome, routeSceneRuntime.sceneInputLane]);

  React.useEffect(() => {
    routeSceneRuntime.sceneInputLane.publishRouteSceneBody({
      sceneKey: 'pollDetail',
      sceneBodyContent: pollDetailSceneParts?.sceneBodyContent ?? null,
      sceneBodyTransport: pollDetailSceneParts?.sceneBodyTransport ?? null,
    });
  }, [
    pollDetailSceneParts?.sceneBodyContent,
    pollDetailSceneParts?.sceneBodyTransport,
    routeSceneRuntime.sceneInputLane,
  ]);

  React.useEffect(
    () => () => {
      routeSceneRuntime.sceneInputLane.clearRouteSceneInput('pollDetail');
    },
    [routeSceneRuntime.sceneInputLane]
  );
};
