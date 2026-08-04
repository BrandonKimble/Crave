import React from 'react';
import { useAuth } from '@clerk/clerk-expo';

import { usersService } from '../../../services/users';
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

  // Apple 5.1.1(v): permanent in-app account deletion, reachable by ANY
  // signed-in user (entitled or lapsed). Two-step: warning (incl. the
  // App-Store-subscription caveat — Apple subs can only be cancelled in iOS
  // Settings, deletion does not stop that billing) → typed DELETE confirm.
  const handleDeleteAccount = React.useCallback(() => {
    const runDeletion = async () => {
      try {
        await usersService.deleteMe();
        await unregisterPushToken();
        await signOut();
        showAppModal({
          title: 'Account deleted',
          message:
            'Your account and personal data are gone. If you had an App Store subscription, cancel it in iOS Settings → Apple ID → Subscriptions.',
        });
      } catch (error) {
        logger.error('Account deletion failed', error);
        announceFailureIfOnline();
      }
    };
    // Both steps ride THE standard modal (the host's exactly-once close bookkeeping
    // makes opening step 2 from step 1's action safe); step 2 uses the sheet's
    // `prompt` field — the Alert.prompt replacement.
    showAppModal({
      title: 'Delete account?',
      message:
        // THE COPY IS PART OF THE MECHANISM. This used to say "cannot be
        // undone" while the privacy policy promised a 30-day recoverable
        // window — two user-facing documents telling opposite stories about
        // the same act. The window is real now (deletion revokes sessions and
        // marks the account; nothing is destroyed until the deadline), and
        // account-deletion-promise.spec.ts asserts this string, the policy and
        // GRACE_PERIOD_DAYS all agree.
        'Your account will be closed and you will be signed out everywhere.\n\nYou have 30 days to change your mind — signing back in during that time restores your account. After 30 days it is permanent: your username is retired and your personal data is erased.\n\nPosts, comments and photos you contributed stay in the community without your name.\n\nApp Store subscriptions are NOT cancelled by deleting your account — manage those in iOS Settings → Apple ID → Subscriptions.',
      actions: [
        { label: 'Cancel', style: 'cancel' },
        {
          label: 'Continue',
          style: 'destructive',
          testID: 'delete-account-continue',
          onPress: () => {
            showAppModal({
              title: 'Type DELETE to confirm',
              message:
                'Your account closes now. You have 30 days to restore it by signing back in.',
              prompt: {
                placeholder: 'DELETE',
                autoCapitalize: 'characters',
                testID: 'delete-account-confirm-input',
              },
              actions: [
                { label: 'Cancel', style: 'cancel' },
                {
                  label: 'Delete forever',
                  style: 'destructive',
                  testID: 'delete-account-confirm',
                  onPress: (typed?: string) => {
                    if (typed?.trim().toUpperCase() === 'DELETE') {
                      void runDeletion();
                    } else {
                      showAppModal({
                        title: 'Not deleted',
                        message: 'The confirmation text did not match.',
                      });
                    }
                  },
                },
              ],
            });
          },
        },
      ],
    });
  }, [signOut, unregisterPushToken]);

  return React.useMemo(
    () => ({ handleSignOut, handleReplayOnboarding, handleDeleteAccount }),
    [handleSignOut, handleReplayOnboarding, handleDeleteAccount]
  );
};
