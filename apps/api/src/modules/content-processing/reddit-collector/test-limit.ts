import { isProdEnv, resolveAppEnv } from '../../../shared/config/app-env';

/**
 * F455: ONE reader for the TEST_* truncation levers (TEST_CHRONO_MAX_POSTS,
 * TEST_ARCHIVE_MAX_POSTS, TEST_REDDIT_FETCH_LIMIT). Each caps how much a run
 * collects, and each was parsed inline with its own guard — the chronological
 * lever had NONE, so a stray env var in prod would silently truncate a
 * collection into PERMANENT loss (a chronological run that stops short never
 * re-reaches the posts between its cursor and where it quit).
 *
 * The lever therefore REFUSES in prod: it returns null (no test limit) and the
 * caller collects in full. `null` also means "unset or unparseable" — the
 * caller supplies its own default via `?? <default>`.
 *
 * @param envVar the process.env key to read
 * @param cap    optional hard ceiling the parsed value is clamped to
 */
export function resolveTestLimit(envVar: string, cap?: number): number | null {
  const raw = process.env[envVar];
  if (typeof raw !== 'string' || !raw.trim() || Number.isNaN(Number(raw))) {
    return null;
  }
  if (isProdEnv(resolveAppEnv())) {
    return null; // never truncate a prod collection — silent permanent loss
  }
  const parsed = Math.max(0, Number.parseInt(raw, 10));
  return typeof cap === 'number' ? Math.min(parsed, cap) : parsed;
}
