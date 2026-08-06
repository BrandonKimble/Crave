import React from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components';
import { announceFailureIfOnline } from '../components/app-modal-store';
import { usersService } from '../services/users';
import { daysUntilPurge, useAccountDeletedStore } from '../store/accountDeletedStore';
import { logger } from '../utils';

/**
 * THE CLOSED ACCOUNT, AND THE WAY BACK.
 *
 * A ROUTING DESTINATION, not a modal — the same axis as the paywall. A deleted
 * account is refused by every authenticated route, so there is nothing behind
 * this screen to browse: showing a dismissible sheet over a dead app would
 * leave the person tapping into failures with no explanation.
 *
 * Reached only from the server's ACCOUNT_DELETED verdict, which carries the
 * deadline. The countdown is the SERVER's date, never a locally computed one —
 * the client must not invent a promise about when data disappears.
 */
export const AccountDeletedScreen: React.FC = () => {
  const purgeDueAt = useAccountDeletedStore((state) => state.purgeDueAt);
  const clearDeleted = useAccountDeletedStore((state) => state.clearDeleted);
  const [restoring, setRestoring] = React.useState(false);
  const { signOut } = useAuth();
  const daysLeft = daysUntilPurge(purgeDueAt);

  const handleRestore = React.useCallback(() => {
    setRestoring(true);
    usersService
      .restoreAccount()
      .then(() => {
        // Clearing the flag drops this destination and the coordinator routes
        // back to `main` on the next render — the same way a purchase leaves
        // the paywall. No navigation call: the axis IS the navigation.
        clearDeleted();
      })
      .catch((error) => {
        logger.warn('Account restore failed', error);
        announceFailureIfOnline({
          message: "We couldn't restore your account. Please try again.",
        });
      })
      .finally(() => setRestoring(false));
  }, [clearDeleted]);

  return (
    <View style={styles.container}>
      <Text variant="subtitle" weight="bold" style={styles.title}>
        Your account is closed
      </Text>
      <Text variant="body" style={styles.body}>
        {daysLeft === null
          ? 'You can still restore it — signing back in brings everything back.'
          : daysLeft === 0
            ? 'Today is the last day you can restore it.'
            : `You have ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left to restore it. After that, your username is retired and your personal data is erased.`}
      </Text>
      <Pressable
        onPress={handleRestore}
        disabled={restoring}
        accessibilityRole="button"
        accessibilityLabel="Restore my account"
        testID="account-deleted-restore"
        style={[styles.button, restoring && styles.buttonBusy]}
      >
        {restoring ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text variant="body" weight="bold" style={styles.buttonText}>
            Restore my account
          </Text>
        )}
      </Pressable>
      {/* THE WAY OUT. Without this the screen is a trap: one button, and it
          UNDOES the decision the person just made. Someone who meant to leave
          would have no exit but force-quitting, and every relaunch would put
          them back here asking them to reconsider. A takeover needs an exit
          for the choice it is NOT advocating — the paywall has one, the
          sign-in screen has one, and this was built without one. */}
      <Pressable
        onPress={() => void signOut()}
        accessibilityRole="button"
        accessibilityLabel="Sign out and leave the account closed"
        testID="account-deleted-sign-out"
        style={styles.secondary}
      >
        <Text variant="body" style={styles.secondaryText}>
          Sign out
        </Text>
      </Pressable>
      <Text variant="caption" style={styles.footnote}>
        Posts, comments and photos you contributed stay in the community without your name.
      </Text>
    </View>
  );
};

const ACCENT = '#16a34a';

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, gap: 14 },
  title: { textAlign: 'center' },
  body: { textAlign: 'center', opacity: 0.85 },
  button: {
    marginTop: 10,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  buttonBusy: { opacity: 0.6 },
  secondary: { paddingVertical: 12, alignItems: 'center' },
  secondaryText: { opacity: 0.75 },
  buttonText: { color: '#ffffff' },
  footnote: { textAlign: 'center', opacity: 0.6, marginTop: 6 },
});
