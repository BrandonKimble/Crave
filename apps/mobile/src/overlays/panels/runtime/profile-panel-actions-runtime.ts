import React from 'react';
import { Alert } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useAppRouteSceneRuntime } from '../../../navigation/runtime/AppRouteSceneRuntimeProvider';
import { useAppRouteCoordinator } from '../../../navigation/runtime/AppRouteCoordinator';
import type { FavoriteListSummary } from '../../../services/favorite-lists';
import { notificationsService } from '../../../services/notifications';
import type { Poll } from '../../../services/polls';
import { useNotificationStore } from '../../../store/notificationStore';
import { useOnboardingStore } from '../../../store/onboardingStore';
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

  const handleSignOut = React.useCallback(async () => {
    try {
      await unregisterPushToken();
      await signOut();
      Alert.alert('Signed out', 'Sign in again the next time you open the app.');
    } catch (error) {
      logger.error('Sign out failed', error);
      Alert.alert(
        'Unable to sign out',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  }, [signOut, unregisterPushToken]);

  const handleReplayOnboarding = React.useCallback(async () => {
    try {
      await unregisterPushToken();
      await signOut();
    } catch (error) {
      logger.warn('Replay onboarding sign-out failed', error);
    } finally {
      resetOnboarding();
      Alert.alert('Onboarding reset', 'Restart the app to walk through onboarding again.');
    }
  }, [resetOnboarding, signOut, unregisterPushToken]);

  const handleOpenSettings = React.useCallback(() => {
    Alert.alert('Settings', undefined, [
      {
        text: 'Edit profile',
        onPress: () => Alert.alert('Coming soon', 'Profile editing will land next.'),
      },
      {
        text: 'Replay onboarding',
        onPress: () => void handleReplayOnboarding(),
      },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => void handleSignOut(),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
