import React from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { useAppRouteSceneRuntime } from '../../../navigation/runtime/AppRouteSceneRuntimeProvider';
import { useAppRouteCoordinator } from '../../../navigation/runtime/AppRouteCoordinator';
import type { FavoriteListSummary } from '../../../services/favorite-lists';
import { notificationsService } from '../../../services/notifications';
import type { Poll } from '../../../services/polls';
import { useNotificationStore } from '../../../store/notificationStore';
import { useOnboardingStore } from '../../../store/onboardingStore';
import { announceFailureIfOnline, showAppModal } from '../../../components/app-modal-store';
import { logger } from '../../../utils';
import type { ProfilePanelActionsRuntime } from './profile-panel-runtime-contract';

export const useProfilePanelActionsRuntime = (): ProfilePanelActionsRuntime => {
  const resetOnboarding = useOnboardingStore((state) => state.__forceOnboarding);
  const { signOut, isSignedIn } = useAuth();
  const routeSceneRuntime = useAppRouteSceneRuntime();
  const { dispatchLaunchIntent } = useAppRouteCoordinator();
  const pushToken = useNotificationStore((state) => state.pushToken);
  const setPushToken = useNotificationStore((state) => state.setPushToken);

  const unregisterPushToken = React.useCallback(async () => {
    if (!pushToken) {
      return;
    }
    try {
      await notificationsService.unregisterDevice(pushToken);
    } catch (error) {
      logger.warn('Failed to unregister push token', error);
    } finally {
      setPushToken(null);
    }
  }, [pushToken, setPushToken]);

  // The failure modal's retry closure needs the LATEST sign-out (the callback rebuilds
  // when auth/token state changes) — a ref keeps the retry honest without self-reference.
  const handleSignOutRef = React.useRef<() => Promise<void>>(async () => {});
  const handleSignOut = React.useCallback(async () => {
    try {
      await unregisterPushToken();
      await signOut();
      showAppModal({
        title: 'Signed out',
        message: 'Sign in again the next time you open the app.',
      });
    } catch (error) {
      logger.error('Sign out failed', error);
      announceFailureIfOnline({ onRetry: () => void handleSignOutRef.current() });
    }
  }, [signOut, unregisterPushToken]);
  handleSignOutRef.current = handleSignOut;

  const handleReplayOnboarding = React.useCallback(async () => {
    try {
      await unregisterPushToken();
      await signOut();
    } catch (error) {
      logger.warn('Replay onboarding sign-out failed', error);
    } finally {
      resetOnboarding();
      showAppModal({
        title: 'Onboarding reset',
        message: 'Restart the app to walk through onboarding again.',
      });
    }
  }, [resetOnboarding, signOut, unregisterPushToken]);

  const handleOpenSettings = React.useCallback(() => {
    showAppModal({
      title: 'Settings',
      actions: [
        {
          label: 'Edit profile',
          onPress: () =>
            showAppModal({ title: 'Coming soon', message: 'Profile editing will land next.' }),
        },
        {
          label: 'Replay onboarding',
          onPress: () => void handleReplayOnboarding(),
        },
        {
          label: 'Sign out',
          style: 'destructive',
          onPress: () => void handleSignOut(),
        },
        { label: 'Cancel', style: 'cancel' },
      ],
    });
  }, [handleReplayOnboarding, handleSignOut]);

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
