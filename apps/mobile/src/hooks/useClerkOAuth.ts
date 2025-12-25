import React from 'react';
import { useSignIn, useSignUp } from '@clerk/clerk-expo';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

type OAuthStrategy = 'oauth_apple' | 'oauth_google';

type StartOAuthFlowParams = {
  redirectUrl?: string;
  unsafeMetadata?: Record<string, unknown>;
};

type StartOAuthFlowResult = {
  authSessionResult?: AuthSession.AuthSessionResult;
  createdSessionId: string;
  sessionId: string;
  setActive?: (params: { session: string }) => Promise<void>;
};

export const useClerkOAuth = (strategy: OAuthStrategy) => {
  const { signIn, setActive, isLoaded: isSignInLoaded } = useSignIn();
  const { signUp, isLoaded: isSignUpLoaded } = useSignUp();

  const startOAuthFlow = React.useCallback(
    async (params?: StartOAuthFlowParams): Promise<StartOAuthFlowResult> => {
      if (!isSignInLoaded || !isSignUpLoaded || !signIn || !signUp) {
        return {
          createdSessionId: '',
          sessionId: '',
          setActive,
        };
      }

      const oauthRedirectUrl =
        params?.redirectUrl ??
        AuthSession.makeRedirectUri({
          path: 'oauth-native-callback',
        });

      await signIn.create({ strategy, redirectUrl: oauthRedirectUrl });

      if (signIn.status === 'complete' && signIn.createdSessionId) {
        return {
          createdSessionId: signIn.createdSessionId ?? '',
          sessionId: signIn.createdSessionId ?? '',
          setActive,
        };
      }

      const externalVerificationRedirectURL =
        signIn.firstFactorVerification?.externalVerificationRedirectURL;

      if (!externalVerificationRedirectURL) {
        throw new Error(
          'OAuth is not ready. Check that the provider is enabled in Clerk and the redirect URL is allowed.'
        );
      }

      const authSessionResult = await WebBrowser.openAuthSessionAsync(
        externalVerificationRedirectURL.toString(),
        oauthRedirectUrl
      );

      const { type, url } = authSessionResult || {};
      if (type !== 'success' || !url) {
        return {
          authSessionResult,
          createdSessionId: '',
          sessionId: '',
          setActive,
        };
      }

      const urlParams = new URL(url).searchParams;
      const rotatingTokenNonce = urlParams.get('rotating_token_nonce') || '';
      await signIn.reload({ rotatingTokenNonce });

      let createdSessionId = '';
      if (signIn.status === 'complete') {
        createdSessionId = signIn.createdSessionId ?? '';
      } else if (signIn.firstFactorVerification?.status === 'transferable') {
        await signUp.create({
          transfer: true,
          unsafeMetadata: params?.unsafeMetadata,
        });
        createdSessionId = signUp.createdSessionId || '';
      }

      return {
        authSessionResult,
        createdSessionId,
        sessionId: createdSessionId,
        setActive,
      };
    },
    [isSignInLoaded, isSignUpLoaded, setActive, signIn, signUp, strategy]
  );

  return { startOAuthFlow };
};
