export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Days an active poll stays open before the lifecycle cron closes + graduates it.
 * Single source of truth for the close window (env `POLL_AUTO_CLOSE_DAYS`,
 * default 4) shared by the lifecycle cron and the card's "days left" countdown.
 */
export function resolvePollAutoCloseDays(): number {
  const raw = process.env.POLL_AUTO_CLOSE_DAYS;
  if (!raw) {
    return 4;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
}

// User polls self-schedule their close window within these bounds (§5); app/seeded
// polls (no chosen window) fall back to the global `resolvePollAutoCloseDays()`.
export const MIN_USER_POLL_WINDOW_DAYS = 3;
export const MAX_USER_POLL_WINDOW_DAYS = 14;
export const DEFAULT_USER_POLL_WINDOW_DAYS = 7;

/**
 * Clamp a creator-chosen close window to [MIN, MAX] days (rounded). Returns null for
 * null/invalid input so the caller can decide a default (user creation defaults to
 * DEFAULT_USER_POLL_WINDOW_DAYS; the timing/cron fall back to the global window).
 */
export function clampUserPollWindowDays(
  raw: number | null | undefined,
): number | null {
  if (raw == null || !Number.isFinite(raw)) {
    return null;
  }
  return Math.min(
    MAX_USER_POLL_WINDOW_DAYS,
    Math.max(MIN_USER_POLL_WINDOW_DAYS, Math.round(raw)),
  );
}

/**
 * When an active poll launched at `launchedAt` will auto-close, or null if unknown.
 * `windowDaysOverride` is the poll's stored per-poll close window (§5); when absent
 * or invalid, falls back to the global `resolvePollAutoCloseDays()`. Shared by the
 * lifecycle cron and the card's "days left" countdown so they always agree.
 */
export function resolvePollClosesAt(
  launchedAt: Date | string | null | undefined,
  windowDaysOverride?: number | null,
): Date | null {
  if (!launchedAt) {
    return null;
  }
  const launched =
    launchedAt instanceof Date ? launchedAt : new Date(launchedAt);
  if (Number.isNaN(launched.getTime())) {
    return null;
  }
  const days =
    windowDaysOverride != null &&
    Number.isFinite(windowDaysOverride) &&
    windowDaysOverride > 0
      ? windowDaysOverride
      : resolvePollAutoCloseDays();
  return new Date(launched.getTime() + days * MS_PER_DAY);
}

/** Read a stored per-poll close window out of a `PollTopic.metadata` JSON blob. */
export function extractCloseWindowDays(metadata: unknown): number | null {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const value = (metadata as Record<string, unknown>).closeWindowDays;
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? value
      : null;
  }
  return null;
}

/**
 * Whether an ACTIVE poll has reached its close time as of `nowMs` — honoring its
 * stored per-poll window (`metadata`) and falling back to the global window. The
 * lifecycle cron uses this to pick which active polls to close + graduate.
 */
export function isActivePollDueToClose(
  launchedAt: Date | string | null | undefined,
  metadata: unknown,
  nowMs: number,
): boolean {
  const closesAt = resolvePollClosesAt(
    launchedAt,
    extractCloseWindowDays(metadata),
  );
  return closesAt != null && closesAt.getTime() <= nowMs;
}

/**
 * Smallest possible close window (days) across user + app polls — used as a coarse
 * cron pre-filter so we never fetch active polls too young to possibly be due.
 */
export function resolveMinPossibleCloseWindowDays(): number {
  return Math.min(MIN_USER_POLL_WINDOW_DAYS, resolvePollAutoCloseDays());
}
