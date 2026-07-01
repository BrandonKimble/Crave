import React from 'react';

import type { OverlayRouteEntry } from '../navigation/runtime/app-overlay-route-types';
import type { Poll } from '../services/polls';

type UseSearchRoutePollDetailSceneStateRuntimeArgs = {
  activeOverlayRoute: OverlayRouteEntry;
};

export type SearchRoutePollDetailSceneStateRuntime = {
  pollDetailPollId: string | null;
  pollDetailPoll: Poll | null;
  // Return-to-origin foundation P4 (design §Restore step 5 / §New sources). The comment a
  // cross-surface reveal launched from — set ONLY when the pop-to-restore dismiss re-pushes
  // this poll (resolveChildOriginRePush carries anchor.commentId into the route params). The
  // panel reads it post-fetch to scroll the thread to + flash-highlight that exact comment.
  pollDetailCommentAnchorId: string | null;
  shouldShowPollDetailPanel: boolean;
};

const isPollDetailRouteEntry = (
  route: OverlayRouteEntry
): route is OverlayRouteEntry<'pollDetail'> => {
  if (route.key !== 'pollDetail') {
    return false;
  }
  const params = route.params as OverlayRouteEntry<'pollDetail'>['params'];
  return (
    params?.parentSceneKey === 'polls' &&
    params?.ownerSceneKey === 'polls' &&
    Boolean(params?.pollId)
  );
};

export const useSearchRoutePollDetailSceneStateRuntime = ({
  activeOverlayRoute,
}: UseSearchRoutePollDetailSceneStateRuntimeArgs): SearchRoutePollDetailSceneStateRuntime =>
  React.useMemo(() => {
    const activePollDetailRoute = isPollDetailRouteEntry(activeOverlayRoute)
      ? activeOverlayRoute
      : null;
    const shouldShowPollDetailPanel = activePollDetailRoute != null;

    return {
      pollDetailPollId: shouldShowPollDetailPanel
        ? (activePollDetailRoute.params?.pollId ?? null)
        : null,
      pollDetailPoll: shouldShowPollDetailPanel
        ? (activePollDetailRoute.params?.poll ?? null)
        : null,
      pollDetailCommentAnchorId: shouldShowPollDetailPanel
        ? (activePollDetailRoute.params?.commentAnchorId ?? null)
        : null,
      shouldShowPollDetailPanel,
    };
  }, [activeOverlayRoute]);
