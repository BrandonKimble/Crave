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
  constructor(message: string, public readonly retryAfter?: number) {
    super(message, 429);
    this.name = 'RedditRateLimitError';
  }
}

export class RedditNetworkError extends RedditApiError {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'RedditNetworkError';
  }
}
