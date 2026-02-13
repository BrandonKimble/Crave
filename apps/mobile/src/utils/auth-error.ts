const DEFAULT_UNKNOWN_ERROR_MESSAGE = 'Unknown error';
export const DEFAULT_OAUTH_SIGN_IN_ERROR_MESSAGE =
  'Sign-in failed. Check your internet connection (captive portal/VPN) and try again.';

type CoerceUnknownErrorMessageOptions = {
  fallbackMessage?: string;
  allowObjectToString?: boolean;
  allowGenericStringCoercion?: boolean;
};

const hasText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const coerceUnknownErrorMessage = (
  error: unknown,
  {
    fallbackMessage = DEFAULT_UNKNOWN_ERROR_MESSAGE,
    allowObjectToString = true,
    allowGenericStringCoercion = true,
  }: CoerceUnknownErrorMessageOptions = {}
): string => {
  if (hasText(error)) {
    return error;
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (hasText(record.message)) {
      return record.message;
    }

    if (allowObjectToString) {
      let toStringFn: unknown;
      try {
        toStringFn = record.toString;
      } catch {
        toStringFn = undefined;
      }

      if (typeof toStringFn === 'function') {
        try {
          const next = String(toStringFn.call(record));
          if (hasText(next)) {
            return next;
          }
        } catch {
          // Intentionally swallow: malformed provider errors can have invalid toString.
        }
      }
    }
  }

  if (error instanceof Error && hasText(error.message)) {
    return error.message;
  }

  if (allowGenericStringCoercion) {
    try {
      return String(error);
    } catch {
      // Fall through to fallback message.
    }
  }

  return fallbackMessage;
};

type OAuthErrorMessageOptions = {
  fallbackMessage?: string;
};

export const getOAuthErrorMessage = (
  error: unknown,
  { fallbackMessage = DEFAULT_OAUTH_SIGN_IN_ERROR_MESSAGE }: OAuthErrorMessageOptions = {}
): string => {
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const errors = Array.isArray(record.errors) ? record.errors : undefined;
    const firstError =
      errors && errors[0] && typeof errors[0] === 'object'
        ? (errors[0] as Record<string, unknown>)
        : null;
    const code = firstError && typeof firstError.code === 'string' ? firstError.code : null;
    const longMessage =
      firstError && typeof firstError.longMessage === 'string' ? firstError.longMessage : null;
    const message =
      firstError && typeof firstError.message === 'string' ? firstError.message : null;

    if (code === 'session_exists') return "You're already signed in.";
    if (hasText(longMessage)) return longMessage;
    if (hasText(message)) return message;
    if (hasText(record.message)) return record.message;
  }

  return coerceUnknownErrorMessage(error, {
    fallbackMessage,
    allowObjectToString: false,
    allowGenericStringCoercion: false,
  });
};

export const serializeOAuthErrorForLog = (
  error: unknown,
  { fallbackMessage = DEFAULT_OAUTH_SIGN_IN_ERROR_MESSAGE }: OAuthErrorMessageOptions = {}
): string => {
  const payload: Record<string, unknown> = {
    message: coerceUnknownErrorMessage(error, {
      fallbackMessage,
      allowObjectToString: false,
      allowGenericStringCoercion: false,
    }),
    stack: error instanceof Error ? error.stack : undefined,
    raw: error,
  };

  try {
    return JSON.stringify(payload);
  } catch {
    return JSON.stringify({
      message: payload.message,
      stack: payload.stack,
      raw: '[unserializable]',
    });
  }
};

export const summarizeOAuthError = (error: unknown) => {
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const errors = Array.isArray(record.errors) ? record.errors : undefined;
    const firstError =
      errors && errors[0] && typeof errors[0] === 'object'
        ? (errors[0] as Record<string, unknown>)
        : null;

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
    message: coerceUnknownErrorMessage(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
};
