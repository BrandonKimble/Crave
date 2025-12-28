import React from 'react';
import { View, StyleSheet, ScrollView, Pressable, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import { Text } from '../components';
import EmailAuthModal from '../components/EmailAuthModal';
import { colors as themeColors } from '../constants/theme';
import { useClerkOAuth } from '../hooks/useClerkOAuth';
import { logger } from '../utils';
import { authService } from '../services/auth';

const CTA_COLOR = themeColors.accentDark ?? '#7c3aed';

const SignInScreen: React.FC = () => {
  const auth = useAuth();
  const setActiveSession =
    typeof auth.setActive === 'function'
      ? (auth.setActive as (params: { session: string }) => Promise<void>)
      : null;

  const appleOAuth = useClerkOAuth('oauth_apple');
  const googleOAuth = useClerkOAuth('oauth_google');

  const [oauthStatus, setOauthStatus] = React.useState<'idle' | 'apple' | 'google'>('idle');
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [emailModalVisible, setEmailModalVisible] = React.useState(false);
  const [nativeAppleAvailable, setNativeAppleAvailable] = React.useState(false);

  const redirectUrl = React.useMemo(
    () =>
      makeRedirectUri({
        path: 'oauth-native-callback',
      }),
    []
  );

  React.useEffect(() => {
    if (Platform.OS !== 'ios') {
      setNativeAppleAvailable(false);
      return;
    }
    let cancelled = false;
    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (!cancelled) {
          setNativeAppleAvailable(available);
        }
      })
      .catch((error) => {
        logger.warn('Unable to determine AppleAuthentication availability', error);
        if (!cancelled) {
          setNativeAppleAvailable(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOAuthPress = React.useCallback(
    (provider: 'apple' | 'google') => {
      if (oauthStatus !== 'idle') {
        return;
      }
      const client = provider === 'apple' ? appleOAuth : googleOAuth;
      if (!client?.startOAuthFlow) {
        setAuthError('Unable to start that sign-in right now. Please try again.');
        return;
      }
      const run = async () => {
        try {
          setAuthError(null);
          setOauthStatus(provider);
          const { createdSessionId, sessionId, setActive } = await client.startOAuthFlow({
            redirectUrl,
          });
          const resolvedSessionId = createdSessionId ?? sessionId;
          if (resolvedSessionId && setActive) {
            await setActive({ session: resolvedSessionId });
          }
        } catch (error) {
          logger.error('OAuth sign-in failed', error);
          const message =
            error instanceof Error
              ? error.message
              : 'We could not connect that account. Please try again.';
          setAuthError(message);
        } finally {
          setOauthStatus('idle');
        }
      };
      void run();
    },
    [appleOAuth, googleOAuth, oauthStatus, redirectUrl]
  );

  const handleNativeAppleSignIn = React.useCallback(() => {
    if (oauthStatus !== 'idle') {
      return;
    }
    const run = async () => {
      try {
        setAuthError(null);
        setOauthStatus('apple');
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          ],
        });
        if (!credential.identityToken || !credential.authorizationCode) {
          throw new Error('Apple did not return the required tokens.');
        }
        const result = await authService.signInWithAppleNative({
          identityToken: credential.identityToken,
          authorizationCode: credential.authorizationCode,
          email: credential.email ?? undefined,
          givenName: credential.fullName?.givenName ?? undefined,
          familyName: credential.fullName?.familyName ?? undefined,
        });
        if (!result.sessionId) {
          throw new Error('Native Apple sign-in was not completed.');
        }
        if (setActiveSession) {
          await setActiveSession({ session: result.sessionId });
        }
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error) {
          const typedError = error as { code?: string };
          if (typedError.code === 'ERR_CANCELED') {
            setAuthError(null);
            setOauthStatus('idle');
            return;
          }
        }
        logger.error('Native Apple sign-in failed', error);
        const message =
          error instanceof Error
            ? error.message
            : 'We were unable to sign you in with Apple. Please try again.';
        setAuthError(message);
      } finally {
        setOauthStatus('idle');
      }
    };
    void run();
  }, [oauthStatus, setActiveSession]);

  const handleApplePress = React.useCallback(() => {
    if (nativeAppleAvailable) {
      handleNativeAppleSignIn();
      return;
    }
    handleOAuthPress('apple');
  }, [handleNativeAppleSignIn, handleOAuthPress, nativeAppleAvailable]);

  const openEmailModal = React.useCallback(() => {
    setAuthError(null);
    setEmailModalVisible(true);
  }, []);

  const openTerms = React.useCallback(() => {
    void Linking.openURL('https://example.com/terms');
  }, []);

  const openPrivacy = React.useCallback(() => {
    void Linking.openURL('https://example.com/privacy');
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
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
            onPress={handleApplePress}
            disabled={oauthStatus !== 'idle'}
          >
            <Text variant="body" weight="semibold" style={styles.authButtonText}>
              {oauthStatus === 'apple' ? '🍎 Connecting…' : '🍎 Continue with Apple'}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.authButton, styles.authButtonSpacing]}
            onPress={() => handleOAuthPress('google')}
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
      </ScrollView>
      <EmailAuthModal visible={emailModalVisible} onClose={() => setEmailModalVisible(false)} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  eyebrow: {
    textTransform: 'uppercase',
    color: '#a78bfa',
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
    borderColor: '#e2e8f0',
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
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
