import React from 'react';

import type { SearchRouteSceneLayoutState } from '../../overlays/searchRouteSceneLayoutContract';
import { useSearchRoutePollCreationPanelSpec } from '../../overlays/useSearchRoutePollCreationPanelSpec';
import { useSearchRoutePollCreationSceneStateRuntime } from '../../overlays/useSearchRoutePollCreationSceneStateRuntime';
import type { OverlaySheetSnap } from '../../overlays/types';
import type { OverlayRouteEntry } from './app-overlay-route-types';
import type { AppRouteSceneRuntime } from './app-route-scene-runtime';

export const useAppRoutePollCreationSceneInputWriterRuntime = ({
  routeSceneRuntime,
  activeOverlayRoute,
  sceneLayout,
  pollCreationSnapRequest,
}: {
  routeSceneRuntime: AppRouteSceneRuntime;
  activeOverlayRoute: OverlayRouteEntry;
  sceneLayout: SearchRouteSceneLayoutState;
  pollCreationSnapRequest: Exclude<OverlaySheetSnap, 'hidden'> | null;
}): void => {
  const pollCreationSceneStateRuntime = useSearchRoutePollCreationSceneStateRuntime({
    activeOverlayRoute,
  });
  const pollCreationSceneParts = useSearchRoutePollCreationPanelSpec({
    routeSceneRuntime,
    sceneLayout,
    pollCreationMarketKey: pollCreationSceneStateRuntime.pollCreationMarketKey,
    pollCreationMarketName: pollCreationSceneStateRuntime.pollCreationMarketName,
    pollCreationBounds: pollCreationSceneStateRuntime.pollCreationBounds,
    shouldShowPollCreationPanel: pollCreationSceneStateRuntime.shouldShowPollCreationPanel,
    pollCreationSnapRequest,
    setPollCreationSnapRequest:
      routeSceneRuntime.routeSheetSnapSessionActions.setPollCreationSnapRequest,
  });

  React.useEffect(() => {
    routeSceneRuntime.sceneInputLane.publishRouteSceneShell({
      sceneKey: 'pollCreation',
      shellSpec: pollCreationSceneParts?.shellSpec ?? null,
    });
  }, [pollCreationSceneParts?.shellSpec, routeSceneRuntime.sceneInputLane]);

  React.useEffect(() => {
    routeSceneRuntime.sceneInputLane.publishRouteSceneChrome({
      sceneKey: 'pollCreation',
      sceneChrome: pollCreationSceneParts?.sceneChrome ?? null,
    });
  }, [pollCreationSceneParts?.sceneChrome, routeSceneRuntime.sceneInputLane]);

  React.useEffect(() => {
    routeSceneRuntime.sceneInputLane.publishRouteSceneBody({
      sceneKey: 'pollCreation',
      sceneBodyContent: pollCreationSceneParts?.sceneBodyContent ?? null,
      sceneBodyTransport: pollCreationSceneParts?.sceneBodyTransport ?? null,
    });
  }, [
    pollCreationSceneParts?.sceneBodyContent,
    pollCreationSceneParts?.sceneBodyTransport,
    routeSceneRuntime.sceneInputLane,
  ]);

  React.useEffect(
    () => () => {
      routeSceneRuntime.sceneInputLane.clearRouteSceneInput('pollCreation');
    },
    [routeSceneRuntime.sceneInputLane]
  );
};
