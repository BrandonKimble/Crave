export class RedditApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly redditError?: string,
  ) {
    super(message);
    this.name = 'RedditApiError';
  }
}

export class RedditAuthenticationError extends RedditApiError {
  constructor(message: string, redditError?: string) {
    super(message, 401, redditError);
    this.name = 'RedditAuthenticationError';
  }
}

export class RedditConfigurationError extends RedditApiError {
  constructor(message: string) {
    super(message);
    this.name = 'RedditConfigurationError';
  }
}

export class RedditRateLimitError extends RedditApiError {
  constructor(
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message, 429);
    this.name = 'RedditRateLimitError';
  }
}

/**
 * §12.3/§14.7 typed governance denial — the THIRD outcome, distinct from both
 * success and error: the governor said "not now" for a reddit.requests draw.
 * Deliberately NOT a RedditApiError subclass so no generic API-error catch can
 * brand it as a failure (it must never become a term error, a cooldown, or an
 * empty success). Callers abort the remaining requests of the dispatch and
 * leave the work item due.
 */
export class RedditGovernanceDenialError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = 'RedditGovernanceDenialError';
  }
}

export class RedditNetworkError extends RedditApiError {
  constructor(
    message: string,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = 'RedditNetworkError';
  }
}
