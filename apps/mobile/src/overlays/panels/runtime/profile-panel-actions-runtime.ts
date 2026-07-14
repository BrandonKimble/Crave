import React from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useAppRouteSceneRuntime } from '../../../navigation/runtime/AppRouteSceneRuntimeProvider';
import type { ProfilePanelActionsRuntime } from './profile-panel-runtime-contract';

export const useProfilePanelActionsRuntime = (): ProfilePanelActionsRuntime => {
  const { isSignedIn } = useAuth();
  const routeSceneRuntime = useAppRouteSceneRuntime();

  const handleOpenSettings = React.useCallback(() => {
    // Real child push (S-B slice 4 / §5.7) — the placeholder action-list modal is gone; the
    // settings SCENE owns edit-profile / replay-onboarding / sign-out rows.
    routeSceneRuntime.routeOverlayRouteCommandRuntime.pushRoute('settings');
  }, [routeSceneRuntime.routeOverlayRouteCommandRuntime]);

  const handleOpenMessages = React.useCallback(() => {
    // W3 messaging (§4.4 entry 2): the inbox is a child of the own-profile page.
    routeSceneRuntime.routeOverlayRouteCommandRuntime.pushRoute('messagesInbox');
  }, [routeSceneRuntime.routeOverlayRouteCommandRuntime]);

  const handleOpenFollowList = React.useCallback(
    (userId: string, mode: 'followers' | 'following') => {
      // Followers/Following stat tap — the SAME followList child push UserProfilePanel makes.
      routeSceneRuntime.routeOverlayRouteCommandRuntime.pushRoute('followList', { userId, mode });
    },
    [routeSceneRuntime.routeOverlayRouteCommandRuntime]
  );

  return React.useMemo(
    () => ({
      isSignedIn: Boolean(isSignedIn),
      handleOpenSettings,
      handleOpenMessages,
      handleOpenFollowList,
    }),
    [handleOpenFollowList, handleOpenMessages, handleOpenSettings, isSignedIn]
  );
};
