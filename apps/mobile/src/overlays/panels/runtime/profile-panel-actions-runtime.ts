import React from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useAppRouteSceneRuntime } from '../../../navigation/runtime/AppRouteSceneRuntimeProvider';
import { useAppRouteCoordinator } from '../../../navigation/runtime/AppRouteCoordinator';
import type { FavoriteListSummary } from '../../../services/favorite-lists';
import type { Poll } from '../../../services/polls';
import type { ProfilePanelActionsRuntime } from './profile-panel-runtime-contract';

export const useProfilePanelActionsRuntime = (): ProfilePanelActionsRuntime => {
  const { isSignedIn } = useAuth();
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const { dispatchLaunchIntent } = useAppRouteCoordinator();

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
      // Launch the favorites list as a search-sourced results surface (same list
      // + toggle strip + map pins + staged reveal as a real search). The
      // launch-intent runtime captures the profile origin so the search dismisses
      // back here. (Replaced the standalone favoriteListDetail route, now
      // deleted.)
      dispatchLaunchIntent({
        type: 'favorites',
        listId: list.listId,
        listType: list.listType,
        submittedLabel: list.name,
      });
    },
    [dispatchLaunchIntent]
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
