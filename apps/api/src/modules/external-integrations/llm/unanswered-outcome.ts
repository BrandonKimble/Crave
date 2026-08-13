import { LoggerService } from '../../../shared';

/**
 * "UNANSWERED STAYS DUE" AS ONE RECORDED OUTCOME (sweep-rail contract,
 * 2026-08-12). The batch-backed sweep family (vocabulary labels, dish
 * knowledge, the pooled runner itself) shares one promise: work the model
 * never answered is NOT an abstention — it is left un-stamped/un-ledgered
 * and the owning sweep's watermark re-offers it next pass, and nothing is
 * ever fabricated in its place. That promise used to live as three
 * independently-worded prose comments and three hand-rolled warn lines,
 * which is how conventions drift. It is now one event shape with one
 * emitter: every site records the SAME `sweep_unanswered` event, so "show
 * me everything that went unanswered last night" is one log query, and a
 * lane that forgets to record is greppable by its absence.
 */
export interface UnansweredOutcome {
  /** The sweep lane, as the ledger names it (e.g. 'labels.vocabulary'). */
  lane: string;
  /** What one unanswered unit is (concept, dish, item…). */
  unit: string;
  count: number;
  reason:
    | 'chunk_unanswered'
    | 'unparseable'
    | 'deadline_elapsed'
    | 'timeout_cancelled';
  locale?: string | null;
}

export function recordUnanswered(
  logger: LoggerService,
  outcome: UnansweredOutcome,
): void {
  logger.warn(
    'Unanswered work stays due — not ledgered, re-offered by the owning sweep',
    {
      event: 'sweep_unanswered',
      lane: outcome.lane,
      unit: outcome.unit,
      count: outcome.count,
      reason: outcome.reason,
      ...(outcome.locale !== undefined ? { locale: outcome.locale } : {}),
    },
  );
}
