import React from 'react';
import { View, StyleSheet, ScrollView, Pressable, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../components';
import EmailAuthModal from '../components/EmailAuthModal';
import { colors as themeColors } from '../constants/theme';
import { useAuthController } from '../hooks/use-auth-controller';

const CTA_COLOR = themeColors.accentDark ?? '#7c3aed';

const SignInScreen: React.FC = () => {
  const {
    oauthStatus,
    authError,
    setAuthError,
    emailModalVisible,
    setEmailModalVisible,
    continueWithApple,
    continueWithGoogle,
  } = useAuthController();

  const openEmailModal = React.useCallback(() => {
    setAuthError(null);
    setEmailModalVisible(true);
  }, [setAuthError, setEmailModalVisible]);

  const openTerms = React.useCallback(() => {
    void Linking.openURL('https://example.com/terms');
  }, []);

  const openPrivacy = React.useCallback(() => {
    void Linking.openURL('https://example.com/privacy');
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.surfaceCard}>
          <Text variant="caption" style={styles.eyebrow}>
            Welcome back
          </Text>
          <Text variant="title" weight="bold" style={styles.title}>
            Sign back into Crave Search
          </Text>
          <Text variant="body" style={styles.subtitle}>
            Pick up your polls, bookmarks, and drops instantly.
          </Text>
          <View style={styles.buttonGroup}>
            <Pressable
              style={styles.authButton}
              onPress={continueWithApple}
              disabled={oauthStatus !== 'idle'}
            >
              <Text variant="body" weight="semibold" style={styles.authButtonText}>
                {oauthStatus === 'apple' ? '🍎 Connecting…' : '🍎 Continue with Apple'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.authButton, styles.authButtonSpacing]}
              onPress={continueWithGoogle}
              disabled={oauthStatus !== 'idle'}
            >
              <Text variant="body" weight="semibold" style={styles.authButtonText}>
                {oauthStatus === 'google' ? '🔍 Connecting…' : '🔍 Continue with Google'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.authButton, styles.authButtonSpacing]}
              onPress={openEmailModal}
              disabled={oauthStatus !== 'idle'}
            >
              <Text variant="body" weight="semibold" style={styles.authButtonText}>
                ✉️ Continue with email
              </Text>
            </Pressable>
          </View>
          {authError ? (
            <Text variant="caption" style={styles.errorText}>
              {authError}
            </Text>
          ) : null}
          <Text variant="caption" style={styles.disclaimer}>
            By continuing you agree to our{' '}
            <Text variant="caption" style={styles.link} onPress={openTerms}>
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text variant="caption" style={styles.link} onPress={openPrivacy}>
              Privacy Policy
            </Text>
            .
          </Text>
        </View>
      </ScrollView>
      <EmailAuthModal visible={emailModalVisible} onClose={() => setEmailModalVisible(false)} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 48,
    justifyContent: 'center',
  },
  surfaceCard: {
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingVertical: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.52)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
  eyebrow: {
    textTransform: 'uppercase',
    color: '#6b7280',
    marginBottom: 8,
  },
  title: {
    color: '#111827',
  },
  subtitle: {
    color: themeColors.textBody,
    marginTop: 8,
  },
  buttonGroup: {
    marginTop: 32,
  },
  authButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.95)',
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(248, 250, 252, 0.92)',
  },
  authButtonText: {
    color: CTA_COLOR,
  },
  authButtonSpacing: {
    marginTop: 12,
  },
  errorText: {
    color: '#dc2626',
    marginTop: 16,
  },
  disclaimer: {
    marginTop: 32,
    color: themeColors.textBody,
  },
  link: {
    color: CTA_COLOR,
  },
});

export default SignInScreen;
