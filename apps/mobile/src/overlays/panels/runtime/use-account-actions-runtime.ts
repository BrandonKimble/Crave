import React from 'react';
import { useAuth } from '@clerk/clerk-expo';

import { notificationsService } from '../../../services/notifications';
import { useNotificationStore } from '../../../store/notificationStore';
import { useOnboardingStore } from '../../../store/onboardingStore';
import { announceFailureIfOnline, showAppModal } from '../../../components/app-modal-store';
import { logger } from '../../../utils';

/**
 * Account-level actions (sign out, replay onboarding) — extracted from the profile panel's
 * actions runtime when the Settings placeholder modal became a real `push(settings)` (S-B
 * slice 4 / trigger-nav ideal §5.7). Consumed by the settings scene body.
 */
export const useAccountActionsRuntime = () => {
  const resetOnboarding = useOnboardingStore((state) => state.__forceOnboarding);
  const { signOut } = useAuth();
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
      showAppModal({
        title: 'Signed out',
        message: 'Sign in again the next time you open the app.',
      });
    } catch (error) {
      logger.error('Sign out failed', error);
      announceFailureIfOnline();
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
      showAppModal({
        title: 'Onboarding reset',
        message: 'Restart the app to walk through onboarding again.',
      });
    }
  }, [resetOnboarding, signOut, unregisterPushToken]);

  return React.useMemo(
    () => ({ handleSignOut, handleReplayOnboarding }),
    [handleSignOut, handleReplayOnboarding]
  );
};
