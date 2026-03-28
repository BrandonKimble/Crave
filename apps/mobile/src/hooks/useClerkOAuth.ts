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
