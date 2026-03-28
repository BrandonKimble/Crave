import React from 'react';
import { Platform } from 'react-native';
import { makeRedirectUri } from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '@clerk/clerk-expo';
import { useClerkOAuth } from './useClerkOAuth';
import { authService } from '../services/auth';
import { logger } from '../utils';
import {
  getOAuthErrorMessage,
  isExistingSessionOAuthError,
  serializeOAuthErrorForLog,
} from '../utils/auth-error';

export type AuthControllerState = {
  isSignedIn: boolean;
  oauthStatus: 'idle' | 'apple' | 'google';
  authError: string | null;
  setAuthError: React.Dispatch<React.SetStateAction<string | null>>;
  emailModalVisible: boolean;
  setEmailModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  continueWithApple: () => void;
  continueWithGoogle: () => void;
};

export const useAuthController = (): AuthControllerState => {
  const auth = useAuth();
  const { isSignedIn } = auth;
  const setActiveSession =
    typeof (auth as Record<string, unknown>).setActive === 'function'
      ? ((auth as Record<string, unknown>).setActive as (params: {
          session: string;
        }) => Promise<void>)
      : undefined;
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
    logger.info('[Auth] Redirect URI', { redirectUrl });
  }, [redirectUrl]);

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

  const continueWithOAuthProvider = React.useCallback(
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
          const { createdSessionId, sessionId, setActive, authSessionResult } =
            await client.startOAuthFlow({
              redirectUrl,
            });
          const resolvedSessionId = createdSessionId ?? sessionId;
          if (!resolvedSessionId) {
            const resultType =
              authSessionResult &&
              typeof authSessionResult === 'object' &&
              'type' in authSessionResult
                ? String((authSessionResult as { type?: unknown }).type)
                : '';
            if (resultType !== 'cancel' && resultType !== 'dismiss') {
              setAuthError('Sign-in was not completed. Please try again.');
            }
            return;
          }
          if (resolvedSessionId && setActive) {
            await setActive({ session: resolvedSessionId });
          }
        } catch (error) {
          if (isExistingSessionOAuthError(error)) {
            setAuthError(null);
            return;
          }
          logger.error('OAuth sign-in failed', serializeOAuthErrorForLog(error));
          setAuthError(getOAuthErrorMessage(error));
        } finally {
          setOauthStatus('idle');
        }
      };
      void run();
    },
    [appleOAuth, googleOAuth, oauthStatus, redirectUrl]
  );

  const continueWithNativeApple = React.useCallback(() => {
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
        setAuthError(
          error instanceof Error
            ? error.message
            : 'We were unable to sign you in with Apple. Please try again.'
        );
      } finally {
        setOauthStatus('idle');
      }
    };
    void run();
  }, [oauthStatus, setActiveSession]);

  const continueWithApple = React.useCallback(() => {
    if (nativeAppleAvailable) {
      continueWithNativeApple();
      return;
    }
    continueWithOAuthProvider('apple');
  }, [continueWithNativeApple, continueWithOAuthProvider, nativeAppleAvailable]);

  const continueWithGoogle = React.useCallback(() => {
    continueWithOAuthProvider('google');
  }, [continueWithOAuthProvider]);

  return {
    isSignedIn: !!isSignedIn,
    oauthStatus,
    authError,
    setAuthError,
    emailModalVisible,
    setEmailModalVisible,
    continueWithApple,
    continueWithGoogle,
  };
};
