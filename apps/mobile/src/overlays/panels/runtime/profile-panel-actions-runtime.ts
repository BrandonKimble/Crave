import React from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useAppRouteSceneRuntime } from '../../../navigation/runtime/AppRouteSceneRuntimeProvider';
import { useEntityRefActionExecutor } from '../../../navigation/runtime/use-entity-ref-action-executor';
import type { FavoriteListSummary } from '../../../services/favorite-lists';
import type { Poll } from '../../../services/polls';
import type { ProfilePanelActionsRuntime } from './profile-panel-runtime-contract';

export const useProfilePanelActionsRuntime = (): ProfilePanelActionsRuntime => {
  const { isSignedIn } = useAuth();
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const executeEntityRefAction = useEntityRefActionExecutor();

  const handleOpenSettings = React.useCallback(() => {
    // Real child push (S-B slice 4 / §5.7) — the placeholder action-list modal is gone; the
    // settings SCENE owns edit-profile / replay-onboarding / sign-out rows.
    routeSceneRuntime.routeOverlayRouteCommandRuntime.pushRoute('settings');
  }, [routeSceneRuntime.routeOverlayRouteCommandRuntime]);

  const handlePollPress = React.useCallback(
    (poll: Poll) => {
      routeSceneRuntime.routeSearchCommandActions.openAppSearchRoutePollsHome({
        params: {
          pollId: poll.pollId,
          marketKey: poll.marketKey ?? null,
          marketName: poll.marketName ?? null,
          pinnedMarket: true,
        },
        snap: 'expanded',
      });
    },
    [routeSceneRuntime.routeSearchCommandActions]
  );

  const handleListPress = React.useCallback(
    (list: FavoriteListSummary) => {
      // S-D.2: routes through THE entity policy (listWorld = favorites-as-search today).
      executeEntityRefAction({
        entityId: list.listId,
        entityType: 'list',
        label: list.name,
        listType: list.listType,
      });
    },
    [executeEntityRefAction]
  );

  return React.useMemo(
    () => ({
      isSignedIn: Boolean(isSignedIn),
      handleOpenSettings,
      handlePollPress,
      handleListPress,
    }),
    [handleListPress, handleOpenSettings, handlePollPress, isSignedIn]
  );
};
