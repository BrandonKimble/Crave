/**
 * Kept as a re-export so the signals call sites read unchanged. The single
 * authority now lives in shared/sql/utc-instant.ts — there used to be two
 * identical helpers plus a third mechanism, and that is exactly why the fix
 * discovered here never reached the polls feed.
 */
export { utcInstant as utcInstantSql } from '../../shared/sql/utc-instant';
