import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { DEMAND_KERNEL_HORIZON_DAYS } from '../polls/supply/poll-supply.constants';

/**
 * PROMOTION INTO THE ANONYMOUS DEMAND TABLE.
 *
 * Measured 2026-08-03: of 30 distinct search subjects in the local corpus, 26
 * had exactly ONE distinct actor. So `signals` is not aggregate demand
 * evidence — it is a per-person search history, and dropping `actor_id` would
 * not anonymise a row that is already unique on its text, viewport and time.
 * `signal_demand_daily`, despite the name, is a per-ACTOR daily rollup that
 * keeps the raw typed text: nothing in the pipeline ever aggregated ACROSS
 * people, which is the only operation that makes demand data anonymous.
 *
 * This is that operation. It groups away the actor, counts DISTINCT people,
 * and applies the k-floor to the only PII-bearing dimension: the free text.
 *
 * THE FLOOR IS APPLIED HERE, AT PROMOTION — never at read. A subject's words
 * are written only once >= K distinct people used them; below the floor the
 * demand still counts but `subject_text` lands NULL. An identifying row
 * therefore never enters this table at all, so no reader can leak one by
 * forgetting a filter. That is the difference between a floor and a habit:
 * today the floor is one reader's private opinion (3 in query-suggestions, a
 * DIFFERENT 2 in keyword-slice-selection, and none at all in queryDemand or
 * territoryUnmetAsks, which will hand a caller a term one person typed).
 */
@Injectable()
export class DemandAnonymizationService {
  /**
   * The k-anonymity floor for free text.
   *
   * NOT an invented number: 3 is the floor this codebase already published
   * and shipped (`search-query-suggestion.service.ts` minGlobalDistinctUsers).
   * Adopting it makes the substrate at least as strict as the strictest
   * existing reader, rather than introducing a new constant nobody chose.
   * It is a PRIVACY VALUE COMMITMENT — the honest shape for it is a named
   * constant with a stated rationale, not a derivation (deriving a privacy
   * floor from usage would let popularity redefine the protection).
   */
  private static readonly TEXT_K_FLOOR = 3;

  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('DemandAnonymization');
  }

  /** Rebuild one day. Idempotent: the day is deleted then re-inserted, so a
   *  re-run after a late-arriving act simply produces the newer truth. */
  async promoteDay(day: Date): Promise<{ rows: number; suppressed: number }> {
    const dayKey = day.toISOString().slice(0, 10);

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `DELETE FROM signal_demand_anonymous WHERE day = $1::date`,
          dayKey,
        );

        // GROUP AWAY THE ACTOR. `count(DISTINCT actor_id)` is the whole point:
        // it is the only number any ranking consumer actually needs, and it is
        // computable without ever emitting who those actors were.
        // TWO PASSES, and the split is forced by correctness, not style.
        //
        // A single statement cannot do this: the floor depends on
        // count(DISTINCT actor_id), and Postgres forbids an aggregate in
        // GROUP BY. Collapsing below-floor terms to NULL text in one pass
        // would ALSO collide on the unique key (many terms -> one NULL), and
        // summing their distinct-actor counts would over-count anyone who
        // typed two different rare things.
        //
        // Pass 1: everything at or above the floor, plus every entity subject
        // (a catalogue id is not a person's words and is never suppressed).
        const above = await tx.$executeRawUnsafe(
          `
          INSERT INTO signal_demand_anonymous (
            day, place_id, kind, subject_type, subject_id, subject_text,
            distinct_actors, act_count, demand_mass
          )
          SELECT day, place_id, kind, subject_type, subject_id, subject_text,
                 distinct_actors, act_count, demand_mass
          FROM (
            SELECT d.day, d.place_id, d.kind, d.subject_type, d.subject_id,
                   d.subject_text,
                   count(DISTINCT d.actor_id)::int AS distinct_actors,
                   sum(d.per_actor_acts)::bigint   AS act_count,
                   -- PER-ACTOR sub-linear weighting, computed here because the
                   -- actor dimension does not survive this statement.
                   sum(ln(1 + d.per_actor_acts) / ln(2))::float8 AS demand_mass
            FROM (
              SELECT day, place_id, kind, subject_type, subject_id,
                     subject_text, actor_id,
                     sum(signal_count) AS per_actor_acts
              FROM signal_demand_daily
              WHERE day = $1::date
              GROUP BY day, place_id, kind, subject_type, subject_id,
                       subject_text, actor_id
            ) d
            GROUP BY d.day, d.place_id, d.kind, d.subject_type, d.subject_id,
                     d.subject_text
          ) g
          -- The floor protects FREE TEXT. Three kinds of row are never
          -- suppressed because none of them carries a person's words:
          --   subject_id IS NOT NULL   a catalogue reference
          --   subject_text IS NULL     place-level demand (viewport dwell,
          --                            entity view) — no text to protect
          -- Only a typed term below the floor is dropped, in pass 2.
          -- MEASURED: on 2026-07-24, 12,522 of 12,524 groups are this third
          -- kind. An earlier version of this predicate dropped every one of
          -- them and promoted 2 rows out of 12,524 — place demand would have
          -- silently vanished from ranking. Found by running it on real data,
          -- not by reading it.
          WHERE g.subject_id IS NOT NULL
             OR g.subject_text IS NULL
             OR g.distinct_actors >= $2
          `,
          dayKey,
          DemandAnonymizationService.TEXT_K_FLOOR,
        );

        // Pass 2: everything below the floor, folded into ONE bucket per
        // (day, place, kind, subject_type) with the text discarded. The
        // distinct-actor count is recomputed from the base rows so that a
        // person who typed several rare things is counted once, not once per
        // thing.
        const below = await tx.$executeRawUnsafe(
          `
          INSERT INTO signal_demand_anonymous (
            day, place_id, kind, subject_type, subject_id, subject_text,
            distinct_actors, act_count, demand_mass
          )
          -- One bucket per (day, place, kind, subject_type). The words are
          -- discarded; the demand they represent is not. Counted from the
          -- PER-ACTOR grain so someone who typed several rare things is one
          -- person here, not several — and so demand_mass keeps the same
          -- sub-linear weighting the above-floor rows use.
          SELECT a.day, a.place_id, a.kind, a.subject_type, NULL, NULL,
                 count(DISTINCT a.actor_id)::int,
                 sum(a.per_actor_acts)::bigint,
                 sum(ln(1 + a.per_actor_acts) / ln(2))::float8
          FROM (
            SELECT day, place_id, kind, subject_type, subject_text, actor_id,
                   sum(signal_count) AS per_actor_acts
            FROM signal_demand_daily
            WHERE day = $1::date
              AND subject_id IS NULL
              AND subject_text IS NOT NULL
            GROUP BY day, place_id, kind, subject_type, subject_text, actor_id
          ) a
          -- Only the terms that fell below the floor.
          JOIN (
            SELECT place_id, kind, subject_type, subject_text
            FROM signal_demand_daily
            WHERE day = $1::date
              AND subject_id IS NULL
              AND subject_text IS NOT NULL
            GROUP BY place_id, kind, subject_type, subject_text
            HAVING count(DISTINCT actor_id) < $2
          ) lo
            ON lo.kind = a.kind
           AND lo.subject_type = a.subject_type
           AND lo.subject_text = a.subject_text
           AND lo.place_id IS NOT DISTINCT FROM a.place_id
          GROUP BY a.day, a.place_id, a.kind, a.subject_type
          `,
          dayKey,
          DemandAnonymizationService.TEXT_K_FLOOR,
        );

        const inserted = Number(above) + Number(below);

        const suppressedRows = await tx.$queryRawUnsafe<Array<{ n: bigint }>>(
          `SELECT count(*)::bigint AS n FROM signal_demand_anonymous
           WHERE day = $1::date AND subject_text IS NULL AND subject_id IS NULL`,
          dayKey,
        );
        const suppressed = Number(suppressedRows[0]?.n ?? 0);

        this.logger.info('Demand day promoted', {
          day: dayKey,
          rows: inserted,
          suppressedBelowFloor: suppressed,
        });
        return { rows: inserted, suppressed };
      },
      { timeout: 120_000 },
    );
  }

  /**
   * PLACE DEMAND SNAPSHOT over the fixed kernel horizon.
   *
   * Separate from promoteDay because it is a different SHAPE, not a different
   * schedule: `demand-mass.reader` collapses all of an actor's acts for a
   * place across the WHOLE window before the sub-linear ln weighting, and
   * that number cannot be rebuilt by summing finer-grained rows (ln is
   * concave — slicing inflates it; measured max error 41.26 by day, 102.35 by
   * subject). So it is computed once, at the window, with the actor still
   * present, and stored without one.
   *
   * Legitimate as a snapshot only because the horizon is a DERIVED constant
   * (RECENCY_FLAT_DAYS + 10 half-lives), not a caller parameter. If a caller
   * ever needs a different window, this must become per-window rows rather
   * than silently answering the wrong question.
   */
  async refreshPlaceDemandSnapshot(
    windowDays: number,
  ): Promise<{ places: number }> {
    const rows = await this.prisma.$executeRawUnsafe(
      `
      WITH per_actor AS (
        SELECT place_id, actor_id, sum(signal_count) AS acts
        FROM signal_demand_daily
        WHERE place_id IS NOT NULL
          AND day >= (CURRENT_DATE - ($1::int))
        GROUP BY place_id, actor_id
      ),
      rolled AS (
        SELECT place_id,
               count(DISTINCT actor_id)::int         AS distinct_actors,
               sum(acts)::bigint                     AS act_count,
               sum(ln(1 + acts) / ln(2))::float8     AS demand_mass
        FROM per_actor
        GROUP BY place_id
      )
      INSERT INTO signal_place_demand_anonymous (
        place_id, window_days, distinct_actors, act_count, demand_mass,
        computed_at
      )
      SELECT place_id, $1::int, distinct_actors, act_count, demand_mass, now()
      FROM rolled
      ON CONFLICT (place_id) DO UPDATE SET
        window_days     = EXCLUDED.window_days,
        distinct_actors = EXCLUDED.distinct_actors,
        act_count       = EXCLUDED.act_count,
        demand_mass     = EXCLUDED.demand_mass,
        computed_at     = EXCLUDED.computed_at
      `,
      windowDays,
    );
    this.logger.info('Place demand snapshot refreshed', {
      places: rows,
      windowDays,
    });
    return { places: Number(rows) };
  }

  /**
   * Nightly: promote yesterday, and re-promote the day before in case late
   * acts landed. Cheap (two days), and it keeps the anonymous table the
   * durable record while the raw ledger becomes the short-lived one.
   */
  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async promoteRecentDays(): Promise<void> {
    const now = Date.now();
    for (const offset of [1, 2]) {
      await this.promoteDay(new Date(now - offset * 86_400_000));
    }
    // The place snapshot is a WINDOW, so it is recomputed whole rather than
    // rolled forward — see refreshPlaceDemandSnapshot for why summing days
    // would be the wrong number.
    await this.refreshPlaceDemandSnapshot(DEMAND_KERNEL_HORIZON_DAYS);
  }
}
