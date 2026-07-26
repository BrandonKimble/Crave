import React from 'react';
import { useOAuth } from '@clerk/clerk-expo';
import { logger } from '../utils';
import { isExistingSessionOAuthError, summarizeOAuthError } from '../utils/auth-error';

type OAuthStrategy = 'oauth_apple' | 'oauth_google';

type StartOAuthFlowParams = {
  redirectUrl?: string;
  unsafeMetadata?: Record<string, unknown>;
};

type StartOAuthFlowResult = {
  authSessionResult?: unknown;
  createdSessionId: string;
  sessionId: string;
  setActive?: (params: { session: string }) => Promise<void>;
};

export const useClerkOAuth = (strategy: OAuthStrategy) => {
  const clerkOAuth = useOAuth({ strategy });

  const startOAuthFlow = React.useCallback(
    async (params?: StartOAuthFlowParams): Promise<StartOAuthFlowResult> => {
      try {
        const result = await clerkOAuth.startOAuthFlow({
          redirectUrl: params?.redirectUrl,
          unsafeMetadata: params?.unsafeMetadata,
        });
        const createdSessionId = result.createdSessionId ?? '';
        if (!createdSessionId) {
          // Production-instance diagnosis (2026-07-26): the flow can finish
          // the browser leg yet mint no session when the live instance holds
          // an unmet sign-up requirement. Name the requirement, loudly.
          const signIn = result.signIn as
            | {
                status?: string | null;
                firstFactorVerification?: {
                  status?: string | null;
                  error?: { code?: string; message?: string } | null;
                };
              }
            | undefined;
          const signUp = result.signUp as
            | {
                status?: string | null;
                missingFields?: string[];
                unverifiedFields?: string[];
              }
            | undefined;
          logger.error(
            'OAuth flow incomplete — no session minted',
            JSON.stringify({
              strategy,
              authSessionType:
                (result.authSessionResult as { type?: string } | undefined)?.type ?? null,
              signInStatus: signIn?.status ?? null,
              firstFactorStatus: signIn?.firstFactorVerification?.status ?? null,
              firstFactorError: signIn?.firstFactorVerification?.error?.code ?? null,
              signUpStatus: signUp?.status ?? null,
              signUpMissingFields: signUp?.missingFields ?? null,
              signUpUnverifiedFields: signUp?.unverifiedFields ?? null,
            })
          );
        }
        return {
          authSessionResult: result.authSessionResult,
          createdSessionId,
          sessionId: createdSessionId,
          setActive: result.setActive,
        };
      } catch (error) {
        if (isExistingSessionOAuthError(error)) {
          logger.info('OAuth flow reported existing session', { strategy });
          throw error;
        }
        const summary = summarizeOAuthError(error);
        logger.error(
          'OAuth flow threw',
          JSON.stringify({
            strategy,
            ...summary,
          })
        );
        throw error;
      }
    },
    [clerkOAuth, strategy]
  );

  return { startOAuthFlow };
};
