import { createHash } from 'crypto';
import { CorrelationUtils } from '../../src/shared/logging/correlation.utils';

/**
 * LEDGER ATTRIBUTION FOR ONE-OFF SCRIPTS (2026-09-04).
 *
 * The usage ledger stamps `run_key` from the ambient correlation id when an
 * event carries none. HTTP requests and jobs always have one; a bare script
 * has NONE — so every prompt cert deck, ablation and chunk sweep of the v23
 * campaign landed in api_usage_ledger with run_key NULL. August's ~$890 of
 * interactive extraction (208k calls) could only be attributed by
 * elimination. Wrap a script's body here and the whole tree underneath is
 * tagged: `SELECT run_key, count(*) ... GROUP BY 1` answers "what spent
 * this" in one query.
 *
 * Key shape: `<script>:<discriminator>:<yyyymmdd>` — stable enough to group
 * a day's runs of one deck, distinct enough to separate prompt revisions.
 */
export function runTaggedScript<T>(
  runKey: string,
  fn: () => Promise<T>,
): Promise<T> {
  return CorrelationUtils.runWithContext(
    { correlationId: runKey, startTime: Date.now() },
    fn,
  );
}

/** Eight hex chars of the content's sha256 — a prompt revision fingerprint. */
export function shortHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 8);
}

export function dateStamp(now = new Date()): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}
