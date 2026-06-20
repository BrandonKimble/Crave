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

/** When an active poll launched at `launchedAt` will auto-close, or null if unknown. */
export function resolvePollClosesAt(
  launchedAt: Date | string | null | undefined,
): Date | null {
  if (!launchedAt) {
    return null;
  }
  const launched =
    launchedAt instanceof Date ? launchedAt : new Date(launchedAt);
  if (Number.isNaN(launched.getTime())) {
    return null;
  }
  return new Date(launched.getTime() + resolvePollAutoCloseDays() * MS_PER_DAY);
}
