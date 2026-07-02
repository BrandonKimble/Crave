import React from 'react';

import type { AppRoutePollsSceneRuntime } from '../../../navigation/runtime/app-route-polls-scene-runtime';
import { logPerfScenarioSearchRequestLifecycle } from '../../../perf/perf-scenario-attribution';
import { usePerfScenarioRuntimeStore } from '../../../perf/perf-scenario-runtime-store';
import type { PollsPanelFeedRuntime } from './polls-panel-feed-runtime';

type UsePollsPanelHeaderModelPublicationArgs = {
  pollsSceneActions: AppRoutePollsSceneRuntime['sceneActions'];
  pollsPanelFeedRuntime: PollsPanelFeedRuntime;
};

export const usePollsPanelHeaderModelPublication = ({
  pollsSceneActions,
  pollsPanelFeedRuntime,
}: UsePollsPanelHeaderModelPublicationArgs): void => {
  const activePerfScenarioRunId = usePerfScenarioRuntimeStore(
    (state) => state.activeConfig?.runId ?? null
  );

  React.useEffect(() => {
    const headerModel = {
      title: pollsPanelFeedRuntime.headerVisualModel.title,
      headerAction: pollsPanelFeedRuntime.headerAction,
      marketKey: pollsPanelFeedRuntime.marketKey,
      marketName: pollsPanelFeedRuntime.marketName,
      candidateLocalityName: pollsPanelFeedRuntime.candidateLocalityName,
      marketOverride: pollsPanelFeedRuntime.marketOverride,
    };
    pollsSceneActions.publishHeaderModel(headerModel);
    logPerfScenarioSearchRequestLifecycle({
      source: 'polls.headerModel',
      phase: 'poll_header_model',
      pollHeaderTitle: headerModel.title,
      pollHeaderMarketKey: headerModel.marketKey,
      pollHeaderMarketName: headerModel.marketName,
      pollHeaderCandidateLocalityName: headerModel.candidateLocalityName,
      pollHeaderMarketOverride: headerModel.marketOverride,
      pollHeaderAction: headerModel.headerAction,
    });
  }, [
    pollsPanelFeedRuntime.candidateLocalityName,
    pollsPanelFeedRuntime.headerAction,
    pollsPanelFeedRuntime.headerVisualModel.title,
    pollsPanelFeedRuntime.marketKey,
    pollsPanelFeedRuntime.marketName,
    pollsPanelFeedRuntime.marketOverride,
    pollsSceneActions,
    activePerfScenarioRunId,
  ]);

  React.useEffect(
    () => () => {
      pollsSceneActions.clearHeaderModel();
    },
    [pollsSceneActions]
  );
};
