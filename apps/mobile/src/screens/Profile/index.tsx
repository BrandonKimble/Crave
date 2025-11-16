import React from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { Text, Button } from '../../components';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useNotificationStore } from '../../store/notificationStore';
import { logger } from '../../utils';
import { notificationsService } from '../../services/notifications';

const ProfileScreen: React.FC = () => {
  const resetOnboarding = useOnboardingStore((state) => state.__forceOnboarding);
  const { signOut, isSignedIn } = useAuth();
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
        error instanceof Error ? error.message : 'Please try again.',
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text variant="title" weight="bold" style={styles.title}>
          Profile
        </Text>
        <Text variant="caption" style={styles.subtitle}>
          Your account settings
        </Text>
      </View>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.emptyState}>
          <Text variant="body" style={styles.emptyText}>
            Profile coming soon
          </Text>
          <Button
            label="Replay onboarding"
            variant="ghost"
            onPress={handleReplayOnboarding}
            style={styles.resetButton}
          />
          {isSignedIn ? (
            <Button
              label="Sign out"
              variant="ghost"
              onPress={handleSignOut}
              style={styles.resetButton}
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  title: {
    color: '#0f172a',
  },
  subtitle: {
    color: '#64748b',
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    color: '#64748b',
  },
  resetButton: {
    marginTop: 16,
  },
});

export default ProfileScreen;
