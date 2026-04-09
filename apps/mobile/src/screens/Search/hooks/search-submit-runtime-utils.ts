import axios from 'axios';

export const isRateLimitError = (error: unknown) => {
  if (error && typeof error === 'object') {
    const maybeCode = (error as { code?: unknown }).code;
    if (typeof maybeCode === 'string' && maybeCode === 'RATE_LIMITED') {
      return true;
    }
  }

  if (axios.isAxiosError(error)) {
    return error.response?.status === 429;
  }

  return false;
};

export const resolveLoadMoreRequestErrorMessage = (error: unknown) =>
  isRateLimitError(error)
    ? 'Too many requests. Please wait a moment and try again.'
    : 'Unable to load more results. Please try again.';

export const noopSearchPhaseLogger = (_label: string, _options?: { reset?: boolean }) => {};

export const noopSearchTimingLogger = (_label: string, _durationMs: number) => {};
