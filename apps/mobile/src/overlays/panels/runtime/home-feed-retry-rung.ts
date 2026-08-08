import { logger } from '../../../utils';
import { resolveRetryDelayMs } from '../../../services/retry/network-retry-ladder';

/**
 * ONE HOME FOR THE HOME FEED'S RETRY RUNG (F4510).
 *
 * The eleven-line scheduling block was written TWICE in HomePanel (the
 * bounds-unavailable path and the fetch-failure path), and each copy carried its
 * OWN hand-maintained exhaustion bound (`retryAttempt < NETWORK_RETRY_MAX_ATTEMPTS`)
 * before coalescing the ladder's `null` — its one honest "I have given up" signal —
 * to `0`. That `?? 0` is what converted a bounded bug into an unbounded one: if
 * either copy of the bound ever drifted (an off-by-one, a `<` becoming `<=`, a third
 * caller written from memory), exhaustion would not stop the retries, it would
 * schedule them with ZERO delay and hammer the API for as long as the app stayed
 * open.
 *
 * The ladder owns exhaustion. There is no second bound here, `null` is handled
 * explicitly, and the give-up path is the same one the viewport slice controller
 * already uses — a PAUSE, not a permanent stop: any fresh trigger (settle, city
 * pick, reconnect) starts a new ladder at rung 0.
 */
export type ScheduleHomeFeedRetryRungArgs = {
  /** Failures so far — 0 is the first failure, so rung 0 is the first retry. */
  retryAttempt: number;
  /**
   * LIVE visibility, read at arm time. A fetch in flight when the surface hides
   * would otherwise arm a fresh timer AFTER the hide-cleanup ran, and the ladder
   * would fetch while hidden (the activation-diff on return covers the missed
   * refresh honestly).
   */
  isVisible: () => boolean;
  /** Runs the next rung. The caller clears its own timer ref inside this. */
  runRung: (nextRetryAttempt: number) => void;
  /**
   * What failed, when something did (the bounds-unavailable path has no
   * error). The ladder's 429 clause reads it: a rate-limited failure waits at
   * least the longest rung, honoring the server's Retry-After — passed
   * through so this consumer can never retry a 429 on the 2s rung.
   */
  cause?: unknown;
};

/**
 * Arms the next rung and returns its timer, or returns null when nothing was armed
 * (surface hidden, or the ladder is exhausted). A null return is never a zero-delay
 * retry — that is the whole point of this function existing.
 */
export const scheduleHomeFeedRetryRung = ({
  retryAttempt,
  isVisible,
  runRung,
  cause,
}: ScheduleHomeFeedRetryRungArgs): ReturnType<typeof setTimeout> | null => {
  if (!isVisible()) {
    return null;
  }
  const delayMs = resolveRetryDelayMs(retryAttempt, cause);
  if (delayMs == null) {
    // Ladder exhausted: stop paying radio for an outage.
    logger.warn('Home feed retry ladder exhausted', { attempts: retryAttempt });
    return null;
  }
  return setTimeout(() => {
    runRung(retryAttempt + 1);
  }, delayMs);
};
