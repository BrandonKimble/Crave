import React from 'react';

import type { AppRoutePollsSceneRuntime } from '../../../navigation/runtime/app-route-polls-scene-runtime';
import type { PollsPanelFeedRuntime } from './polls-panel-feed-runtime';

type UsePollsPanelHeaderModelPublicationArgs = {
  pollsSceneActions: AppRoutePollsSceneRuntime['sceneActions'];
  pollsPanelFeedRuntime: PollsPanelFeedRuntime;
};

export const usePollsPanelHeaderModelPublication = ({
  pollsSceneActions,
  pollsPanelFeedRuntime,
}: UsePollsPanelHeaderModelPublicationArgs): void => {
  React.useEffect(() => {
    pollsSceneActions.publishHeaderModel({
      title: pollsPanelFeedRuntime.headerVisualModel.title,
      badgeCount: pollsPanelFeedRuntime.headerVisualModel.badgeCount,
      badgeLabel: pollsPanelFeedRuntime.headerVisualModel.badgeLabel,
      isBadgeMuted: pollsPanelFeedRuntime.headerVisualModel.isBadgeMuted,
      headerAction: pollsPanelFeedRuntime.headerAction,
      marketKey: pollsPanelFeedRuntime.marketKey,
      marketName: pollsPanelFeedRuntime.marketName,
      candidatePlaceName: pollsPanelFeedRuntime.candidatePlaceName,
      marketOverride: pollsPanelFeedRuntime.marketOverride,
    });
  }, [
    pollsPanelFeedRuntime.candidatePlaceName,
    pollsPanelFeedRuntime.headerAction,
    pollsPanelFeedRuntime.headerVisualModel.badgeCount,
    pollsPanelFeedRuntime.headerVisualModel.badgeLabel,
    pollsPanelFeedRuntime.headerVisualModel.isBadgeMuted,
    pollsPanelFeedRuntime.headerVisualModel.title,
    pollsPanelFeedRuntime.marketKey,
    pollsPanelFeedRuntime.marketName,
    pollsPanelFeedRuntime.marketOverride,
    pollsSceneActions,
  ]);

  React.useEffect(
    () => () => {
      pollsSceneActions.clearHeaderModel();
    },
    [pollsSceneActions]
  );
};
