import React from 'react';
import { useOAuth } from '@clerk/clerk-expo';
import { logger } from '../utils';

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

const summarizeOAuthError = (error: unknown) => {
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const errors = Array.isArray(record.errors) ? record.errors : undefined;
    const firstError =
      errors && errors[0] && typeof errors[0] === 'object' ? (errors[0] as Record<string, unknown>) : null;

    return {
      name: typeof record.name === 'string' ? record.name : undefined,
      message: typeof record.message === 'string' ? record.message : undefined,
      stack: typeof record.stack === 'string' ? record.stack : undefined,
      status: typeof record.status === 'number' ? record.status : undefined,
      clerkTraceId:
        typeof record.clerkTraceId === 'string'
          ? record.clerkTraceId
          : typeof record.traceId === 'string'
            ? record.traceId
            : undefined,
      firstError: firstError
        ? {
            code: typeof firstError.code === 'string' ? firstError.code : undefined,
            message: typeof firstError.message === 'string' ? firstError.message : undefined,
            longMessage:
              typeof firstError.longMessage === 'string' ? firstError.longMessage : undefined,
            meta: firstError.meta,
          }
        : undefined,
    };
  }

  return {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
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
