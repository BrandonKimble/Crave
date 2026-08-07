import { scheduleHomeFeedRetryRung } from './home-feed-retry-rung';
import {
  NETWORK_RETRY_BACKOFF_MS,
  NETWORK_RETRY_MAX_ATTEMPTS,
} from '../../../services/retry/network-retry-ladder';

jest.mock('../../../utils', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

describe('home feed retry rung (F4510: the ladder owns exhaustion)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  const arm = (retryAttempt: number, visible = true) => {
    const runRung = jest.fn();
    const timer = scheduleHomeFeedRetryRung({
      retryAttempt,
      isVisible: () => visible,
      runRung,
    });
    return { runRung, timer };
  };

  it('arms each rung at the ladder delay', () => {
    NETWORK_RETRY_BACKOFF_MS.forEach((delayMs, attempt) => {
      const { runRung, timer } = arm(attempt);
      expect(timer).not.toBeNull();
      jest.advanceTimersByTime(delayMs - 1);
      expect(runRung).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(runRung).toHaveBeenCalledWith(attempt + 1);
    });
  });

  it('SCHEDULES NOTHING at exhaustion — not a zero-delay retry', () => {
    // THE FINDING, as a red line. With the deleted `?? 0` restored, the exhausted
    // rung arms a timer at delay 0 and the next attempt runs on the very next tick:
    // a hot loop hammering the API. Both assertions below go RED under that mutation.
    const { runRung, timer } = arm(NETWORK_RETRY_MAX_ATTEMPTS);
    expect(timer).toBeNull();
    jest.advanceTimersByTime(60_000);
    expect(runRung).not.toHaveBeenCalled();
  });

  it('stays stopped however far past the bound a caller drifts', () => {
    // The bound used to be hand-maintained at the call site, in two copies. An
    // off-by-one there no longer reaches a delay of any kind.
    [NETWORK_RETRY_MAX_ATTEMPTS + 1, NETWORK_RETRY_MAX_ATTEMPTS + 7].forEach((attempt) => {
      const { runRung, timer } = arm(attempt);
      expect(timer).toBeNull();
      jest.advanceTimersByTime(60_000);
      expect(runRung).not.toHaveBeenCalled();
    });
  });

  it('arms nothing while the surface is hidden', () => {
    const { runRung, timer } = arm(0, false);
    expect(timer).toBeNull();
    jest.advanceTimersByTime(60_000);
    expect(runRung).not.toHaveBeenCalled();
  });
});
